import React, { useEffect, useRef, useState } from "react"
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import "./product.css"

type User = { id: string; name: string; email: string; ai: boolean; voice: boolean }
type Services = { gemini: boolean; elevenlabs: boolean }
type Reading = {
  hr?: number
  hrv?: number
  spo2?: number
  rr?: number
  sbp?: number
  dbp?: number
  note?: string
  source?: string
  description?: string
  result?: string
  provider?: string
}
type RecordItem = {
  id: string
  kind: "vitals" | "analysis"
  payload: Reading
  created: string
}
type Section = "dashboard" | "vitals" | "symptom" | "voice" | "records" | "privacy"
const nav: [Section, string, string][] = [
  ["dashboard", "Dashboard", "▦"],
  ["vitals", "Vitals journal", "♡"],
  ["symptom", "Symptom AI", "✧"],
  ["voice", "Voice guide", "◉"],
  ["records", "Health records", "▤"],
  ["privacy", "Privacy center", "◇"],
]
const fields = [
  { key: "hr", label: "Heart rate", unit: "bpm", min: 20, max: 250 },
  { key: "hrv", label: "Heart rate variability", unit: "ms", min: 0, max: 500 },
  { key: "spo2", label: "Oxygen saturation", unit: "%", min: 50, max: 100 },
  {
    key: "rr",
    label: "Respiratory rate",
    unit: "breaths/min",
    min: 3,
    max: 80,
  },
  { key: "sbp", label: "Systolic pressure", unit: "mmHg", min: 50, max: 260 },
  { key: "dbp", label: "Diastolic pressure", unit: "mmHg", min: 30, max: 180 },
] as const
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-PulseSense-Request": "1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth"))
      window.dispatchEvent(new Event("session-expired"))
    throw new Error(data.error || "Request failed.")
  }
  return data
}
const date = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null
}
function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      <span className="pill">PERSONAL HEALTH SPACE</span>
    </header>
  )
}
function Logo() {
  return (
    <div className="brand">
      <span className="brand-icon">∿</span>
      <div>
        PulseSense<span>HEALTH, IN VIEW</span>
      </div>
    </div>
  )
}
function Auth({ onDone }: { onDone: () => void }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const data = Object.fromEntries(new FormData(e.currentTarget))
    try {
      await api("/auth/" + (register ? "register" : "login"), "POST", data)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth">
      <section className="auth-story">
        <Logo />
        <div>
          <div className="eyebrow">A CLEARER PICTURE OF YOU</div>
          <h1>
            Your health.
            <br />A little more
            <br />
            <em>connected.</em>
          </h1>
          <p>
            Keep your readings, observations, and questions in one thoughtful
            space.
          </p>
          <svg viewBox="0 0 500 90" aria-hidden="true">
            <path
              d="M0 45 H110 L125 30 L139 60 L157 8 L180 82 L196 35 L213 45 H290 L305 30 L319 60 L337 8 L360 82 L376 35 L393 45 H500"
              fill="none"
              stroke="#ec4899"
              strokeWidth="2"
            />
          </svg>
        </div>
        <small>
          Personal tracking and health education · Not a diagnostic service
        </small>
      </section>
      <section className="auth-form">
        <div>
          <div className="eyebrow">WELCOME TO PULSESENSE</div>
          <h2>
            {register
              ? "Make room for your wellbeing."
              : "Good to have you back."}
          </h2>
          <p>
            {register
              ? "Create your private health journal."
              : "Sign in to your personal health space."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder={
                  register ? "At least 12 characters" : "Enter your password"
                }
              />
            </label>
            <ErrorMessage message={error} />
            <button className="primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : register
                  ? "Create account →"
                  : "Sign in →"}
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register)
              setError("")
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
          <p className="small">
            Your records are saved on this app’s server. Nothing is sent to an
            AI provider unless you enable it and submit a request.
          </p>
        </div>
      </section>
    </div>
  )
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [services, setServices] = useState<Services>({
      gemini: false,
      elevenlabs: false,
    }),
    [loading, setLoading] = useState(true),
    [section, setSection] = useState<Section>("dashboard"),
    [records, setRecords] = useState<RecordItem[]>([]),
    [error, setError] = useState("")
  async function refresh() {
    const data = await api("/records")
    setRecords(data.records)
  }
  async function load() {
    setLoading(true)
    try {
      const data = await api("/me")
      setUser(data.user)
      setServices(data.services)
      await refresh()
    } catch (e) {
      if ((e as Error).message !== "Please sign in.")
        setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    const expire = () => {
      setUser(null)
      setRecords([])
    }
    window.addEventListener("session-expired", expire)
    return () => window.removeEventListener("session-expired", expire)
  }, [])
  if (loading)
    return (
      <div className="loading">
        <Logo />
        <p>Opening your health space…</p>
      </div>
    )
  if (!user)
    return (
      <>
        <ErrorMessage message={error} />
        <Auth onDone={() => void load()} />
      </>
    )
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              aria-current={section === id ? "page" : undefined}
              className={section === id ? "active" : ""}
              onClick={() => setSection(id)}
            >
              <span>{icon}</span>
              {label}
              {section === id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>◇</span>
          <strong>Privacy by choice</strong>
          <p>You decide when information is shared with AI providers.</p>
        </div>
        <div className="profile">
          <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <small>Personal account</small>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              try {
                await api("/auth/logout", "POST")
                setUser(null)
                setRecords([])
                setError("")
                setSection("dashboard")
              } catch (e) {
                setError((e as Error).message)
              }
            }}
          >
            ↪
          </button>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>
            MY HEALTH <b>/</b> {nav.find((n) => n[0] === section)?.[1]}
          </span>
          <span className="date-today">
            {new Date().toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="page">
          <ErrorMessage message={error} />
          {section === "dashboard" && (
            <Dashboard user={user} records={records} onNav={setSection} />
          )}{" "}
          {section === "vitals" && (
            <Vitals
              onSaved={async () => {
                await refresh()
                setSection("records")
              }}
            />
          )}
          {section === "symptom" && (
            <Symptoms
              user={user}
              services={services}
              onSaved={refresh}
              onPrivacy={() => setSection("privacy")}
            />
          )}{" "}
          {section === "voice" && <Voice user={user} services={services} />}{" "}
          {section === "records" && (
            <Records records={records} refresh={refresh} />
          )}{" "}
          {section === "privacy" && (
            <Privacy user={user} services={services} onUpdate={setUser} />
          )}
        </div>
        <footer>
          PulseSense is for personal tracking and education. It does not
          diagnose conditions or contact a care team.
        </footer>
      </main>
    </div>
  )
}
function Dashboard({
  user,
  records,
  onNav,
}: {
  user: User
  records: RecordItem[]
  onNav: (s: Section) => void
}) {
  const readings = records.filter((r) => r.kind === "vitals")
  const latest = readings[0]
  const chart = [...readings]
    .reverse()
    .filter((r) => r.payload.hr !== undefined)
    .slice(-30)
    .map((r) => ({
      time: new Date(r.created).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      hr: r.payload.hr,
    }))
  return (
    <>
      <Heading
        eyebrow="YOUR DAILY OVERVIEW"
        title={`Hello, ${user.name.split(" ")[0]}.`}
      >
        A little awareness. A healthier everyday.
      </Heading>
      <section className="welcome-card">
        <div>
          <span className="eyebrow">ONE PLACE. YOUR WHOLE PICTURE.</span>
          <h2>
            Make time to <em>check in.</em>
          </h2>
          <p>
            Add a reading from your device and start seeing your story over
            time.
          </p>
          <button className="primary" onClick={() => onNav("vitals")}>
            ＋ Add a reading
          </button>
        </div>
        <div className="pulse-art" aria-hidden="true">
          <div />
          <svg viewBox="0 0 260 100">
            <path
              d="M0 50 H48 L63 32 L77 67 L96 8 L116 92 L135 38 L150 50 H260"
              fill="none"
              stroke="#ec4899"
              strokeWidth="2.5"
            />
          </svg>
          <span>SMALL MOMENTS. MEANINGFUL INSIGHT.</span>
        </div>
      </section>
      <div className="section-line">
        <h3>Latest readings</h3>
        <span>
          {latest ? date(latest.created) : "Your journal starts here"}
        </span>
      </div>
      <div className="metric-grid">
        {fields.slice(0, 3).map((f, i) => (
          <article className={"metric metric-" + i} key={f.key}>
            <span>{f.label}</span>
            <div>
              <strong>{latest?.payload[f.key] ?? "—"}</strong>
              <small>{f.unit}</small>
            </div>
            <p>
              {latest?.payload[f.key] !== undefined
                ? "Manually recorded"
                : "No reading yet"}
            </p>
            <svg viewBox="0 0 180 24" aria-hidden="true">
              <path d="M0 20 L25 20 L35 11 L45 20 L68 20 L81 3 L90 23 L102 13 L115 20 H180" />
            </svg>
          </article>
        ))}
      </div>
      <div className="dashboard-lower">
        <section className="panel">
          <div className="section-line">
            <h3>Heart rate over time</h3>
            <span>Last 30 entries</span>
          </div>
          {chart.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart}>
                  <defs>
                    <linearGradient id="heart" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ec4899" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#ffffff0c" vertical={false} />
                  <XAxis dataKey="time" stroke="#91a4be" fontSize={10} />
                  <YAxis stroke="#91a4be" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: "#0d2550",
                      border: "1px solid #ffffff20",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="hr"
                    name="Heart rate"
                    unit=" bpm"
                    stroke="#ec4899"
                    fill="url(#heart)"
                    dot={{ r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty">
              <span>♡</span>
              <h3>Every trend starts with one reading.</h3>
              <p>Your saved heart rate entries will appear here.</p>
              <button className="text-button" onClick={() => onNav("vitals")}>
                Add your first reading →
              </button>
            </div>
          )}
        </section>
        <section className="panel next-step">
          <span className="eyebrow">A LITTLE SUPPORT</span>
          <h2>
            Questions about
            <br />
            how you’re feeling?
          </h2>
          <p>
            Write down your observations. Get educational guidance to help
            prepare for a conversation with your clinician.
          </p>
          <button className="secondary" onClick={() => onNav("symptom")}>
            Open Symptom AI ↗
          </button>
          <div className="stat-line">
            <strong>{records.length}</strong>
            <span>
              entries in your
              <br />
              health journal
            </span>
          </div>
        </section>
      </div>
    </>
  )
}
function Vitals({ onSaved }: { onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const values = Object.fromEntries(new FormData(e.currentTarget))
    const payload: Record<string, unknown> = { note: values.note }
    for (const f of fields)
      if (values[f.key] !== "") payload[f.key] = Number(values[f.key])
    try {
      await api("/records", "POST", { kind: "vitals", payload })
      await onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Heading eyebrow="BUILD YOUR HEALTH STORY" title="Vitals journal">
        Record readings from a trusted device, at your own pace.
      </Heading>
      <div className="two-column">
        <form className="panel" onSubmit={submit}>
          <h3>Add a new reading</h3>
          <p className="muted">
            Fill in the readings you have. Leave the rest blank.
          </p>
          <div className="form-grid">
            {fields.map((f) => (
              <label key={f.key}>
                {f.label}
                <div className="input-unit">
                  <input
                    name={f.key}
                    type="number"
                    min={f.min}
                    max={f.max}
                    step="0.1"
                    placeholder="—"
                  />
                  <span>{f.unit}</span>
                </div>
              </label>
            ))}
          </div>
          <label>
            Notes <span className="muted">(optional)</span>
            <textarea
              name="note"
              maxLength={2000}
              placeholder="For example: taken after my morning walk"
            />
          </label>
          <ErrorMessage message={error} />
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save reading →"}
          </button>
        </form>
        <section className="panel info-card">
          <span className="large-symbol">♡</span>
          <h2>
            Real readings.
            <br />A useful record.
          </h2>
          <p>
            Use measurements from your own monitor or wearable. Each entry is
            dated and saved to your account.
          </p>
          <div className="notice">
            Camera-based heart rate, oxygen saturation, and blood pressure
            measurement are not connected in this version.
          </div>
          <p className="small">
            Numbers here are recorded values, not an interpretation of your
            health.
          </p>
        </section>
      </div>
    </>
  )
}
function Symptoms({
  user,
  services,
  onSaved,
  onPrivacy,
}: {
  user: User
  services: Services
  onSaved: () => Promise<void>
  onPrivacy: () => void
}) {
  const [description, setDescription] = useState(""),
    [image, setImage] = useState(""),
    [fileName, setFileName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState("")
  const upload = useRef(0)
  async function select(file?: File) {
    const token = ++upload.current
    setError("")
    setImage("")
    setFileName("")
    if (!file) return
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a JPEG, PNG, or WebP image under 5 MB.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (token === upload.current) {
        setImage(String(reader.result))
        setFileName(file.name)
      }
    }
    reader.onerror = () => setError("Could not read this image.")
    reader.readAsDataURL(file)
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    setResult("")
    try {
      const data = await api("/analyze", "POST", {
        description,
        image: image || undefined,
      })
      setResult(data.record.payload.result)
      await onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Heading eyebrow="OBSERVE. ASK. UNDERSTAND." title="Symptom AI">
        Educational guidance to help you prepare for a clinician conversation.
      </Heading>
      {(!services.gemini || !user.ai) && (
        <div className="notice">
          {!services.gemini
            ? "Gemini needs a server API key before analysis is available."
            : "Gemini processing is off. Enable it before sending a description or image."}{" "}
          <button className="text-button" onClick={onPrivacy}>
            Open privacy center →
          </button>
        </div>
      )}
      <div className="two-column">
        <form className="panel" onSubmit={submit}>
          <h3>What have you noticed?</h3>
          <label>
            Your observations
            <textarea
              required
              minLength={10}
              maxLength={6000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you noticed, when it started, and what has changed."
              rows={6}
            />
          </label>
          <label className="upload">
            ＋ Attach a photo{" "}
            <span>Optional · JPEG, PNG, WebP · up to 5 MB</span>
            <input
              aria-label="Attach a photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => void select(e.target.files?.[0])}
            />
          </label>
          {image && (
            <div className="image-preview">
              <img src={image} alt="Your selected attachment" />
              <span>{fileName}</span>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  upload.current++
                  setImage("")
                  setFileName("")
                }}
              >
                Remove
              </button>
            </div>
          )}
          <p className="small">
            Submitting sends this description and optional image to Google
            Gemini. The response and description are saved to your account; the
            image is not stored by this app.
          </p>
          <ErrorMessage message={error} />
          <button
            className="primary"
            disabled={busy || !services.gemini || !user.ai}
          >
            {busy ? "Preparing your guidance…" : "Get guidance →"}
          </button>
        </form>
        <section className="panel result-panel" aria-live="polite">
          {result ? (
            <>
              <div className="eyebrow">GEMINI · SAVED TO YOUR RECORDS</div>
              <h2>For your consideration</h2>
              <div className="response">{result}</div>
              <p className="small">
                AI can make mistakes. This is educational information, not a
                diagnosis.
              </p>
            </>
          ) : (
            <div className="empty">
              <span>✧</span>
              <h3>A starting point for a conversation.</h3>
              <p>
                {busy
                  ? "Reviewing your observations…"
                  : "Your response will appear here after you submit your observations."}
              </p>
              <p className="small">
                If you think you may be experiencing a medical emergency,
                contact local emergency services.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
function Voice({ user, services }: { user: User; services: Services }) {
  const [message, setMessage] = useState(
      "Take a quiet moment to check in with yourself. You can add a reading or write down a question for your next appointment.",
    ),
    [provider, setProvider] = useState("device"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null),
    url = useRef(""),
    generation = useRef(0)
  function stop() {
    generation.current++
    audio.current?.pause()
    window.speechSynthesis?.cancel()
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = ""
    setPlaying(false)
    setBusy(false)
  }
  useEffect(
    () => () => {
      generation.current++
      audio.current?.pause()
      window.speechSynthesis?.cancel()
      if (url.current) URL.revokeObjectURL(url.current)
    },
    [],
  )
  async function play() {
    stop()
    const token = generation.current
    setError("")
    try {
      if (provider === "device") {
        if (!window.speechSynthesis)
          throw new Error("Device voice is not supported by this browser.")
        const speech = new SpeechSynthesisUtterance(message)
        speech.onend = () => {
          if (token === generation.current) setPlaying(false)
        }
        speech.onerror = () => {
          if (token === generation.current) {
            setPlaying(false)
            setError("Device playback was interrupted or unavailable.")
          }
        }
        window.speechSynthesis.speak(speech)
        setPlaying(true)
      } else {
        setBusy(true)
        const res = await fetch("/api/speech", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PulseSense-Request": "1",
          },
          body: JSON.stringify({ text: message }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        const blob = await res.blob()
        if (token !== generation.current) return
        url.current = URL.createObjectURL(blob)
        audio.current = new Audio(url.current)
        audio.current.onended = () => setPlaying(false)
        await audio.current.play()
        setPlaying(true)
      }
    } catch (e) {
      if (token === generation.current) setError((e as Error).message)
    } finally {
      if (token === generation.current) setBusy(false)
    }
  }
  return (
    <>
      <Heading eyebrow="A MOMENT TO LISTEN" title="Voice guide">
        Turn a short note or reminder into spoken audio.
      </Heading>
      <div className="two-column">
        <section className="panel">
          <label>
            Text to read
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={3000}
              rows={7}
            />
          </label>
          <label>
            Voice service
            <select
              value={provider}
              onChange={(e) => {
                stop()
                setProvider(e.target.value)
              }}
            >
              <option value="device">Device voice</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </label>
          <p className="small">
            {provider === "device"
              ? "Uses your browser’s speech service. Your browser or operating system may use network voices."
              : "Your text is sent to ElevenLabs when you press Play."}
          </p>
          {provider === "elevenlabs" &&
            (!services.elevenlabs || !user.voice) && (
              <div className="notice">
                ElevenLabs needs a server API key and permission in Privacy
                Center.
              </div>
            )}
          <ErrorMessage message={error} />
          <div className="actions">
            <button
              className="primary"
              disabled={
                !message.trim() ||
                busy ||
                (provider === "elevenlabs" &&
                  (!services.elevenlabs || !user.voice))
              }
              onClick={() => void play()}
            >
              {busy ? "Creating audio…" : playing ? "Replay" : "▶ Play"}
            </button>
            <button className="secondary" onClick={stop}>
              Stop
            </button>
          </div>
        </section>
        <section className="panel info-card">
          <span className="large-symbol">◉</span>
          <h2>
            Support,
            <br />
            at your pace.
          </h2>
          <p>
            Listen to your own reminders or educational notes. Voice playback
            does not monitor your health or notify anyone.
          </p>
        </section>
      </div>
    </>
  )
}
function Records({
  records,
  refresh,
}: {
  records: RecordItem[]
  refresh: () => Promise<void>
}) {
  const [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [pending, setPending] = useState(""),
    [busy, setBusy] = useState(false)
  async function remove(id: string) {
    setBusy(true)
    setError("")
    try {
      await api("/records/" + id, "DELETE")
      setPending("")
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Heading eyebrow="YOUR STORY, OVER TIME" title="Health records">
        Your readings and AI guidance, saved in one place.
      </Heading>
      <div className="section-line">
        <div className="tabs">
          {["all", "vitals", "analysis"].map((f) => (
            <button
              className={filter === f ? "selected" : ""}
              key={f}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All entries"
                : f === "vitals"
                  ? "Vitals"
                  : "AI guidance"}
            </button>
          ))}
        </div>
        <a className="secondary" href="/api/export" download>
          ↓ Export JSON
        </a>
      </div>
      <ErrorMessage message={error} />
      {records.filter((r) => filter === "all" || r.kind === filter).length ===
      0 ? (
        <div className="panel empty">
          <span>▤</span>
          <h3>No entries here yet.</h3>
          <p>Save a reading or request AI guidance to start your journal.</p>
        </div>
      ) : (
        <div className="record-list">
          {records
            .filter((r) => filter === "all" || r.kind === filter)
            .map((r) => (
              <article key={r.id} className="panel">
                <div className="section-line">
                  <div>
                    <span className="eyebrow">
                      {r.kind === "vitals"
                        ? "MANUAL READING"
                        : "GEMINI GUIDANCE"}
                    </span>
                    <h3>{date(r.created)}</h3>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setPending(r.id)}
                  >
                    Delete
                  </button>
                </div>
                {r.kind === "vitals" ? (
                  <>
                    <div className="record-values">
                      {fields
                        .filter((f) => r.payload[f.key] !== undefined)
                        .map((f) => (
                          <div key={f.key}>
                            <span>{f.label}</span>
                            <strong>
                              {r.payload[f.key]} <small>{f.unit}</small>
                            </strong>
                          </div>
                        ))}
                    </div>
                    {r.payload.note && (
                      <p className="response">{r.payload.note}</p>
                    )}
                  </>
                ) : (
                  <details>
                    <summary>{r.payload.description}</summary>
                    <div className="response">{r.payload.result}</div>
                  </details>
                )}
                {pending === r.id && (
                  <div className="notice">
                    Delete this saved entry permanently?{" "}
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={() => void remove(r.id)}
                    >
                      Delete entry
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setPending("")}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </article>
            ))}
        </div>
      )}
    </>
  )
}
function Privacy({
  user,
  services,
  onUpdate,
}: {
  user: User
  services: Services
  onUpdate: (u: User) => void
}) {
  const [events, setEvents] = useState<{ action: string; created: string }[]>(
      [],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  async function load() {
    try {
      setEvents((await api("/audit")).events)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    void load()
  }, [])
  async function toggle(key: "ai" | "voice") {
    setBusy(true)
    setError("")
    try {
      const next = { ...user, [key]: !user[key] }
      await api("/preferences", "PATCH", { ai: next.ai, voice: next.voice })
      onUpdate(next)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Heading eyebrow="YOU’RE IN CONTROL" title="Privacy center">
        Clear choices about where your information goes.
      </Heading>
      <ErrorMessage message={error} />
      <div className="two-column">
        <section className="panel">
          <h3>External processing</h3>
          <p className="muted">
            Off by default. Changing a preference does not send any data.
          </p>
          {([
            {
              key: "ai",
              label: "Gemini health guidance",
              desc: "Send descriptions and optional images to Google only when you request guidance.",
              ready: services.gemini,
            },
            {
              key: "voice",
              label: "ElevenLabs voice",
              desc: "Send the text you choose to ElevenLabs only when you press Play.",
              ready: services.elevenlabs,
            },
          ] as const).map((s) => (
            <div className="consent-row" key={s.key}>
              <div>
                <strong>{s.label}</strong>
                <p>{s.desc}</p>
                <span className="pill">
                  {s.ready ? "SERVER KEY CONFIGURED" : "SERVER KEY NEEDED"}
                </span>
              </div>
              <button
                role="switch"
                aria-checked={user[s.key]}
                aria-label={s.label}
                disabled={busy}
                className={"switch " + (user[s.key] ? "on" : "")}
                onClick={() => void toggle(s.key)}
              >
                <i />
              </button>
            </div>
          ))}
        </section>
        <section className="panel">
          <span className="large-symbol">◇</span>
          <h2>
            Your data,
            <br />
            explained.
          </h2>
          <p>
            Account details, manually entered readings, and AI responses are
            stored in this app’s server database. Uploaded photos are forwarded
            for the requested analysis and are not saved by this app.
          </p>
          <p>
            Provider processing is subject to Google’s or ElevenLabs’ terms.
            Turning processing off blocks future requests; it does not recall
            requests already sent.
          </p>
          <p className="small">
            Use Health Records to export your entries or delete individual
            records. This local version does not claim clinical certification or
            encrypted database storage.
          </p>
        </section>
      </div>
      <section className="panel audit">
        <div className="section-line">
          <h3>Account activity</h3>
          <span>Most recent 100 events</span>
        </div>
        {events.map((e, i) => (
          <div className="audit-row" key={i}>
            <span>{e.action}</span>
            <time>{date(e.created)}</time>
          </div>
        ))}
      </section>
    </>
  )
}
