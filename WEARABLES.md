# Apple Watch and Oura setup

Both integrations are implemented in this project. They need provider/device setup before they can import your own readings. There is no invented data or demo-device fallback. The web app build and integration tests pass. Oura requests were tested with provider fixtures; real Oura credentials have not been exercised. The iPhone source and Xcode project are included, with property-list validation, but cannot be compiled or run here because full Xcode is not installed.

## Oura Ring

1. Register an OAuth application in [Oura My Applications](https://cloud.ouraring.com/oauth/applications). Follow Oura's current application and access requirements.
2. For local development, register this exact redirect URI: `http://localhost:5173/api/wearables/oura/callback`. Use `localhost` consistently in the browser so the verification cookie is sent to the same host. The Vite development server must be running on 5173.
3. Add these additional lines to your existing `.env`; preserve your current keys and settings:

   ```dotenv
   OURA_CLIENT_ID=your-client-id
   OURA_CLIENT_SECRET=your-client-secret
   OURA_REDIRECT_URI=http://localhost:5173/api/wearables/oura/callback
   ```

   `APP_ORIGIN` should be `http://localhost:5173` for this setup. For a publicly hosted app, use its HTTPS origin for `APP_ORIGIN` and register `https://your-domain/api/wearables/oura/callback` with Oura instead. If Oura's registration does not accept your local URI, use a reachable HTTPS deployment and its exact registered URI; do not disable callback verification.
4. Restart the backend, open the website at your configured APP_ORIGIN, and choose **Wearables → Connect Oura**. Approve only the reading categories you want. The app requests `heartrate`, `daily`, and `spo2`; it does not request personal information or email.
5. Sync the ring using the Oura app first. Then choose **Sync last 7 days** in PulseSense.

The importer retrieves all pages in the requested seven-day window, deduplicates records, and updates existing provider revisions. An entry deleted from your PulseSense journal is not recreated on later sync. Missing values stay absent. A provider error aborts the import instead of saving partial results for that run. Access tokens are renewed server-side using refresh tokens.

Measurements:

| Oura data | PulseSense label | Time shown |
| --- | --- | --- |
| Heart-rate time series | Heart rate sample | Provider sample time |
| Sleep average HRV | HRV, RMSSD · Sleep averages | End of sleep period |
| Sleep average breathing rate | Sleep averages | End of sleep period |
| Daily SpO₂ average | Nightly oxygen average | Provider calendar day, not a fabricated measurement hour |

Granting fewer scopes limits the imported categories. Availability depends on ring and account access. This is an on-demand historical sync, not live monitoring.

## Apple Watch through Apple Health

Apple Health is accessible to the native iPhone companion, not directly to the web browser. The companion imports Watch-origin samples already synced to the phone. It does not require a separate Watch app.

### Install the companion

1. Install Apple's full Xcode from the Mac App Store or Apple Developer distribution. Command Line Tools alone cannot build iPhone apps.
2. Open `ios/PulseSenseHealth/PulseSenseHealth.xcodeproj` in Xcode.
3. Select the **PulseSenseHealth** target. In **Signing & Capabilities**, select your Apple development team and use your own unique bundle identifier. HealthKit capability and a read-purpose description are included. Provisioning and device deployment depend on your Apple account's capabilities.
4. Connect your iPhone, select it as the run destination, and build/run. The project targets iOS 17 or later. You may need to enable Developer Mode on the phone.
5. The companion requires a reachable **HTTPS** PulseSense backend. `127.0.0.1` or `localhost` on a phone refers to the phone, not your Mac. Public hosting and HTTPS are not configured by this change. Do not expose health data through an unsecured HTTP endpoint.

### Pair and import

1. Sign in to PulseSense in your browser. Open **Wearables → Generate pairing code**.
2. Enter your PulseSense HTTPS origin and the one-time code in the iPhone companion. The code expires after ten minutes. Pairing a new phone replaces the prior phone's access.
3. Choose **Choose Health permissions** on the iPhone. Select the read access you want. HealthKit does not disclose whether individual read permissions were denied; the app reports no readable samples without claiming permission was granted.
4. Choose **Sync last 7 days**. This explicit action uploads available Watch-origin measurements to your account. Nothing is automatically sent to Gemini or ElevenLabs.
5. Choose **Refresh status** in the website's Wearables screen; the journal and dashboard refresh too.

Supported quantities are heart rate (bpm), HRV (SDNN, ms), oxygen saturation (percent), and respiratory rate (breaths/min), only where the Watch/Health data and permissions make them available. Blood pressure remains manual. SDNN from Apple and RMSSD from Oura remain explicitly labeled; the app does not convert one into the other. Only Watch-origin samples are selected, so Oura samples already copied into Apple Health do not get reimported through the companion.

The companion sends chunks of up to 500 samples, preserves HealthKit sample identifiers and measurement times, and reports partial progress if a later chunk fails. Retrying does not duplicate accepted samples. This release uses manual foreground sync, not background delivery. HealthKit deletions are not synchronized automatically: remove unwanted records in PulseSense too.

## Storage, disconnecting, and access

- Wearable readings are stored per user in the existing database. Source, measurement time, aggregation label, and HRV method travel with each reading and export.
- Oura tokens are encrypted using AES-256-GCM and a separate server file, `data/.wearable-key`. Preserve this file when backing up or moving the database. Health records themselves still use the existing unencrypted SQLite storage.
- The one-time Apple pairing code is stored hashed. The resulting import-only token is stored hashed on the server and in the iPhone Keychain using device-only, unlocked access. It expires after 90 days and cannot read account records or call AI endpoints.
- **Disconnect iPhone** invalidates its import token and pending pairing codes. Forgetting the pairing on the phone removes the local token; use the website to revoke server access as well.
- **Disconnect Oura** removes this server's tokens and blocks additional imports. Revoke the app in Oura account settings as well if you want to remove the provider-side authorization. Already saved readings remain until you delete them in Health Records.
- Sync locks and request limits are per server process; this version is intended for one server instance. Multi-instance deployment needs distributed coordination for single-use Oura refresh tokens.
- The source label is provenance reported by the importer, not medical device attestation. Neither integration makes the app a diagnostic system.

## Verification

`npm run build` checks TypeScript and builds the web app. `npm test` covers account isolation plus OAuth state/browser binding, rejected callback replay, encrypted token storage and refresh, paginated Oura imports, null readings, deduplication, failed-page rollback, one-time Apple pairing, import validation, scoped tokens, deleted-entry tombstones, and revocation.

Real-device QA remains required: Oura approval and first live sync; Xcode compile/signing; phone pairing over HTTPS; Health permissions denied/partial/allowed; Watch-origin sample availability; offline retry; and local/web disconnect behavior.

## Provider references

- [Oura authentication and scopes](https://cloud.ouraring.com/docs/authentication)
- [Oura API v2 reference](https://cloud.ouraring.com/v2/docs)
- [Apple HealthKit authorization](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)
- [Configure HealthKit access in Xcode](https://developer.apple.com/documentation/xcode/configuring-healthkit-access)
