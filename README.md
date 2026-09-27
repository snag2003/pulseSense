# PulseSense

A working full-stack foundation built from your Figma Make export. It keeps the navy, royal blue, and pink visual direction while replacing simulated health results and fake service statuses with real account data and explicit integration states.

## Try it locally

Requires Node.js 22.13+ (tested with 22.20) and npm.

```sh
npm install
npm run build
npm start
```

Open http://127.0.0.1:3001 and choose **Create an account**. Use a password of at least 12 characters. The local app does not send email or verify your address. There is no password-reset flow yet.

The preview may already be running in Codex. Do not start a second copy on port 3001 if it is.

For development, run `npm run server` and `npm run dev` in separate terminals, then visit http://localhost:5173. The Vite server forwards API calls to port 3001.

## Connect the AI services

Copy `.env.example` to `.env` inside this folder. Set the provider keys there, **not in frontend source or chat**, and restart the server.

- `GEMINI_API_KEY`: Google AI Studio key. `GEMINI_MODEL` selects the model available to your account; the example uses `gemini-3.8-flash` from the provider reference checked during implementation.
- `ELEVENLABS_API_KEY`: ElevenLabs key. `ELEVENLABS_VOICE_ID` chooses a voice available to your account.

In the app, open **Privacy center** and enable only the services you want to use. Then submit an observation in **Symptom AI**, or choose ElevenLabs in **Voice guide**. Enabling a preference alone does not send information. Provider access may incur usage charges under your provider account.

A configured-key badge only means an environment variable is present. It does not verify the key, model access, quota, or service availability. Provider failures appear in the app; simulated responses are never substituted.

References: [Gemini generateContent](https://ai.google.dev/api/generate-content), [ElevenLabs text-to-speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).

## Troubleshooting API settings

Run `npm run check:config` in your VS Code terminal. It prints the exact project and `.env` paths and whether each key is loaded, without printing any key. The server now loads `.env` relative to its project folder, even when launched from another working directory. `.env.example` is only a template; it is not loaded. Keep real keys in `.env`, never in `src/App.tsx`.

After changing `.env`, stop the backend with Ctrl+C and run `npm run server` again. Refresh the browser to update its service badges. If port 3001 is occupied, stop the older server so the browser connects to the copy you are editing. Enable the corresponding processing switch in Privacy Center before sending a request. Keys previously pasted into chat should be replaced at the provider.

## What works

- Account registration, sign-in, sign-out, seven-day server sessions, scrypt password hashes, HttpOnly cookies, and request-origin checks.
- Individual account records stored in SQLite, manual vitals entry with validation, heart-rate history, record filters, permanent individual deletion, and JSON export.
- Gemini text and optional image requests through the backend; descriptions and actual provider responses are saved. Images are forwarded only for the submitted request and are not retained by this app.
- ElevenLabs speech through the backend, plus browser speech as a separate option. Browser voices may depend on operating-system or browser network services.
- Server-enforced provider consent, basic request throttling, and an account activity log.
- Responsive layouts, labeled inputs, keyboard focus states, loading states, empty states, and visible errors.

## Data and architecture

`src/App.tsx` contains the React screens. `src/product.css` styles the product; the export’s global theme remains in `src/index.css`. `server/app.mjs` implements the Express API and SQLite schema. `server/index.mjs` loads environment configuration and starts the server.

The default database is `data/pulsesense.sqlite`; SQLite may also create WAL/SHM files. Data survives restarts. Back up SQLite consistently using SQLite backup tooling. API keys are environment variables and never included in browser assets. The database is **not encrypted by this application**. Photos are not persisted, but descriptions, generated guidance, notes, and readings are stored. Exports contain your saved record content.

The original ZIP remains untouched. Figma-specific helper scripts were not carried into this portable app. The copied pnpm lockfile was removed; `package-lock.json` is the current dependency lock.

## Validation

```sh
npm test
npm run build
```

The integration test exercises registration and login, unauthenticated access, invalid measurements, record ownership, exports, consent denial, missing configuration, invalid image signatures, mocked provider contracts, record deletion, activity logs, session invalidation, and database persistence after reopening.

Actual paid-provider requests have **not** been tested without credentials. Browser sign-in layout was visually inspected. Other screens and mobile layouts are implemented but have not completed end-to-end browser testing.

## Before a public launch

This is a local working foundation, not a clinically validated or production-certified medical system. No camera-based rPPG, blood-pressure/SpO₂ estimation, wearable integration, clinician notifications, Tiger Data connection, or DigitalOcean deployment is included. Readings come from manual entry; AI supplies educational guidance and does not diagnose.

A public service still needs your hosting/provider choices, HTTPS, an exact `APP_ORIGIN`, `NODE_ENV=production` (secure cookies), persistent database storage, backup/recovery, email verification and password recovery, account lifecycle controls, deployment monitoring, and an appropriate privacy/security review for the intended health-data use. The in-process rate limiter and single-server SQLite design are intentionally small-scale. Provider keys must be stored as deployment secrets. Do not claim HIPAA compliance or clinical measurement accuracy from this implementation.

For production behind an HTTPS reverse proxy, serve the built app and API from the same origin, set `APP_ORIGIN` to that exact HTTPS URL, and keep the backend private to the proxy. Choose storage and scaling requirements before moving to multiple instances.
