import SwiftUI
import HealthKit
import Security

@main
struct PulseSenseHealthApp: App {
    var body: some Scene { WindowGroup { CompanionView() } }
}

struct Credentials: Codable { let server: String; let token: String }
enum CredentialStore {
    static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "PulseSenseHealth", kSecAttrAccount as String: "paired-server"]
    static func load() -> Credentials? {
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(Credentials.self, from: data)
    }
    static func save(_ value: Credentials) throws {
        let data = try JSONEncoder().encode(value)
        var q = query; q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let result = SecItemAdd(q as CFDictionary, nil)
        if result == errSecDuplicateItem {
            guard SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecSuccess else { throw CompanionError.message("Could not update the secure pairing. Pair again.") }
        } else if result != errSecSuccess { throw CompanionError.message("Could not save pairing securely. Pair again.") }
    }
    static func clear() { SecItemDelete(query as CFDictionary) }
}
enum CompanionError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(text) = self { return text }; return nil }
}
struct Sample: Codable { let id: String; let metric: String; let value: Double; let measuredAt: String; let hrvMethod: String? }
struct PairRequest: Encodable { let code: String }
struct PairResponse: Decodable { let token: String; let expires: Double }
struct ImportRequest: Encodable { let samples: [Sample] }
struct ImportResponse: Decodable { let inserted: Int; let updated: Int }
struct APIError: Decodable { let error: String }

@MainActor
final class Companion: ObservableObject {
    @Published var server = ""
    @Published var code = ""
    @Published var paired = false
    @Published var busy = false
    @Published var message = ""
    private let health = HKHealthStore()
    private var credentials: Credentials?
    private let types: [(HKQuantityTypeIdentifier, String, HKUnit)] = [
        (.heartRate, "hr", HKUnit.count().unitDivided(by: .minute())),
        (.heartRateVariabilitySDNN, "hrv", HKUnit.secondUnit(with: .milli)),
        (.oxygenSaturation, "spo2", .percent()),
        (.respiratoryRate, "rr", HKUnit.count().unitDivided(by: .minute()))
    ]
    init() { credentials = CredentialStore.load(); paired = credentials != nil; server = credentials?.server ?? "" }
    private func validatedServer(_ text: String) throws -> URL {
        guard let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), url.scheme == "https", let host = url.host, !host.isEmpty, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.path == "" || url.path == "/" else {
            throw CompanionError.message("Enter the HTTPS origin of your PulseSense server, such as https://health.example.com. Do not use localhost or include a path.")
        }
        return url
    }
    private func post<B: Encodable, R: Decodable>(_ path: String, body: B, server: String, token: String? = nil) async throws -> R {
        let base = try validatedServer(server)
        let url = base.appendingPathComponent("api/wearables/apple/" + path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"; request.timeoutInterval = 45
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("1", forHTTPHeaderField: "X-PulseSense-Request")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CompanionError.message("No server response.") }
        guard (200..<300).contains(http.statusCode) else {
            throw CompanionError.message((try? JSONDecoder().decode(APIError.self, from: data).error) ?? "Server request failed (\(http.statusCode)).")
        }
        return try JSONDecoder().decode(R.self, from: data)
    }
    func pair() async {
        busy = true; message = ""; defer { busy = false }
        do {
            let url = try validatedServer(server)
            let result: PairResponse = try await post("pair", body: PairRequest(code: code.trimmingCharacters(in: .whitespacesAndNewlines)), server: url.absoluteString)
            let saved = Credentials(server: url.absoluteString, token: result.token)
            try CredentialStore.save(saved); credentials = saved; server = saved.server; paired = true; code = ""
            message = "Paired. You can now choose Health permissions. Pairing does not upload readings."
        } catch { message = error.localizedDescription }
    }
    func authorize() async {
        busy = true; defer { busy = false }
        do {
            guard HKHealthStore.isHealthDataAvailable() else { throw CompanionError.message("Apple Health is unavailable on this device.") }
            let readTypes: Set<HKObjectType> = Set(types.compactMap { HKObjectType.quantityType(forIdentifier: $0.0) })
            try await health.requestAuthorization(toShare: [], read: readTypes)
            // HealthKit intentionally does not reveal which read permissions were granted.
            message = "Permission request completed. Apple does not disclose read-permission choices to this app. Sync imports only available, permitted Apple Watch samples."
        } catch { message = error.localizedDescription }
    }
    private func samples(for type: HKQuantityType) async throws -> [HKQuantitySample] {
        let start = Date().addingTimeInterval(-7 * 86400)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
                if let error { continuation.resume(throwing: error) } else { continuation.resume(returning: samples as? [HKQuantitySample] ?? []) }
            }
            health.execute(query)
        }
    }
    func sync() async {
        guard let credentials else { message = "Pair your iPhone first."; return }
        busy = true; message = "Reading available Apple Watch measurements…"; defer { busy = false }
        do {
            guard HKHealthStore.isHealthDataAvailable() else { throw CompanionError.message("Apple Health is unavailable on this device.") }
            var result: [Sample] = []
            let formatter = ISO8601DateFormatter()
            for (identifier, metric, unit) in types {
                guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { continue }
                for sample in try await samples(for: type) {
                    let product = sample.sourceRevision.productType ?? ""
                    let device = sample.device?.model ?? ""
                    guard product.hasPrefix("Watch") || device.localizedCaseInsensitiveContains("watch") else { continue }
                    let value = sample.quantity.doubleValue(for: unit) * (metric == "spo2" ? 100 : 1)
                    guard value.isFinite else { continue }
                    result.append(Sample(id: sample.uuid.uuidString, metric: metric, value: value, measuredAt: formatter.string(from: sample.startDate), hrvMethod: metric == "hrv" ? "SDNN" : nil))
                }
            }
            guard !result.isEmpty else { message = "No readable Apple Watch samples from the last 7 days. Check Health permissions and let your Watch sync to your iPhone. No readings were uploaded."; return }
            var inserted = 0, updated = 0, sent = 0
            do {
                for offset in stride(from: 0, to: result.count, by: 500) {
                    let batch = Array(result[offset..<min(offset + 500, result.count)])
                    let response: ImportResponse = try await post("import", body: ImportRequest(samples: batch), server: credentials.server, token: credentials.token)
                    inserted += response.inserted; updated += response.updated; sent += batch.count
                }
            } catch { throw CompanionError.message("Sync stopped after \(sent) samples were accepted (\(inserted) new). You can retry safely; duplicates are skipped. \(error.localizedDescription)") }
            message = "Sync complete: \(inserted) new readings, \(updated) updated. Open PulseSense and refresh Wearables or reload your journal."
        } catch { message = error.localizedDescription }
    }
    func forget() {
        CredentialStore.clear(); credentials = nil; paired = false; code = ""
        message = "Pairing removed from this phone. Also disconnect the iPhone in PulseSense Wearables to revoke its server token."
    }
}
struct CompanionView: View {
    @StateObject private var model = Companion()
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Your watch. Your journal.", systemImage: "heart.text.square")
                    Text("Import Apple Watch measurements that are already available in Apple Health. This is not continuous live monitoring.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("1 · Pair with PulseSense") {
                    TextField("https://your-server.example", text: $model.server).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(model.paired || model.busy)
                    if !model.paired {
                        SecureField("One-time pairing code", text: $model.code).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Pair iPhone") { Task { await model.pair() } }.disabled(model.busy || model.code.isEmpty)
                    } else { Label("Paired", systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
                    Text("Use the HTTPS address of your PulseSense server. Your Mac’s localhost address is not reachable from an iPhone.").font(.footnote)
                }
                Section("2 · Choose Health access") {
                    Button("Choose Health permissions") { Task { await model.authorize() } }.disabled(model.busy || !model.paired)
                    Text("Read-only access: heart rate, HRV (SDNN), oxygen saturation, and respiratory rate. Availability depends on your Watch and permissions.").font(.footnote)
                }
                Section("3 · Send readings") {
                    Text("Sync uploads permitted Apple Watch samples from the last 7 days to your paired PulseSense server, where they are saved to your account. No readings are sent to an AI provider by this action.").font(.footnote)
                    Button("Sync last 7 days") { Task { await model.sync() } }.disabled(model.busy || !model.paired)
                }
                if model.busy { ProgressView() }
                if !model.message.isEmpty { Section("Status") { Text(model.message).textSelection(.enabled) } }
                if model.paired { Section { Button("Forget pairing on this phone", role: .destructive) { model.forget() }.disabled(model.busy) } }
            }
            .navigationTitle("PulseSense Health")
        }.tint(.pink)
    }
}
