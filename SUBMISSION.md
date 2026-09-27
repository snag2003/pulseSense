# PulseSense — ShellHacks submission kit

## Project pitch

PulseSense helps people turn scattered wearable readings into an appointment preparation brief they can review, edit and hear aloud. Users choose the readings, inspect the data before it goes to AI, and keep control through data previews and request receipts. Device sources and HRV methods stay visible so unlike measurements are not silently combined.

## Challenge evidence

These targets are based on the challenge list supplied by the team. Final eligibility and any entry limits belong to the organizers.

| Challenge | What to demonstrate | Status / evidence needed |
| --- | --- | --- |
| Assurant — Take Control of AI | Exact Gemini data preview, explicit consent, activity tracking, usage receipts, Tiger snapshot removal | Implemented; record a live walkthrough and show a data preview before a provider request |
| Microsoft — What's Missing? | Select readings → create an editable appointment brief → export it, with no chat window | Implemented; show the completed document and source readings |
| MLH — Best Use of Gemini API | Structured appointment brief from approved readings, deterministic statistics and validated source IDs | Integration implemented; capture a successful real Gemini request |
| MLH — Best Use of ElevenLabs | Narrate the reviewed brief, show transcript and change playback speed | Integration implemented; demonstrate real ElevenLabs audio rather than browser speech |
| MLH — Best Use of Tiger Data | Measurement hypertable, daily continuous aggregate, actual SQL-backed trend table | Connection, migration and live sync still required; an account alone is insufficient |
| MLH — GoDaddy domain challenge | pulsesenseai.us registration and project association | User reports registration using the offer; retain proof and verify Porkbun redemption eligibility with organizers; public deployment pending |
| Best Overall | Complete end-to-end task and clear explanation of impact | Automatically entered per supplied rules |
| Best First-Time Hacker | At least 50% of the team submitting at a hackathon for the first time | Team must confirm this condition |

DigitalOcean is excluded at the team's request. Do not select unrelated sponsor categories without meeting their actual requirements. This build does not implement Solana, MongoDB, Snowflake, utility coordination, investment research, auto insurance or student-builder collaboration.

## Three-minute demo

1. **0:00–0:25 — The problem:** “My wearable collects readings, but preparing for an appointment still takes work.” Open real imported Oura readings with timestamps. Use a separate demo account and explicitly labeled synthetic values if you do not want to expose personal data.
2. **0:25–1:10 — A concrete task:** Select a few readings in Appointment brief. Show the exact data preview and exclusions. Approve processing, generate, open a supporting source and edit a sentence. Download or print the brief. Explain that this organizes observations; it does not diagnose.
3. **1:10–1:35 — Accessible review:** Show the narration transcript, generate ElevenLabs audio and play it. Change speed. Audio is generated only on request.
4. **1:35–2:00 — User control:** Show AI activity and the new receipt, then show the data-sharing preferences in Privacy center. Estimates appear only when pricing is configured.
5. **2:00–2:35 — Time-series analytics:** With Tiger already connected, show explicit sync consent, the successful snapshot and daily source/method groups. Explain the hypertable and continuous aggregate; do not claim a speedup without measurements.
6. **2:35–3:00 — Outcome:** Show the finished brief and project domain. State which features are live and which remain local. Close with the next improvement: testing with intended users and strengthening account recovery and deployment operations.

## Submission text

**Inspiration:** Wearable readings are easy to collect and harder to turn into a useful conversation. We wanted a preparation tool that preserves sources while making AI sharing visible and optional.

**What it does:** PulseSense imports recorded wearable measurements, lets users select the information for an appointment brief, uses Gemini to organize it, and lets users edit, export and narrate the result through ElevenLabs. Data previews and receipts make usage visible. An optional Tiger Data snapshot supports daily measurement analytics.

**How we built it:** React and TypeScript frontend; Node and Express backend; SQLite accounts, journals and briefs; Oura OAuth and an Apple Health companion; structured Gemini outputs with server-side validation; ElevenLabs narration; PostgreSQL/TimescaleDB hypertables and continuous aggregates for the optional Tiger integration. Secrets remain on the server.

**What we learned:** A useful AI health-data experience needs more than a prompt. Selection, consent, source traceability, editable output and understandable failure states are part of the product.

**Next steps:** Verify the Apple companion on a physical device, finish public hosting, test accessibility with users, add account recovery, and evaluate brief accuracy. Do not describe the app as clinically validated or compliant with a medical privacy standard without independent evidence.

## Before submitting

- Capture a real successful Gemini response, ElevenLabs audio and Tiger sync. Test fixtures are not sponsor usage evidence.
- Verify the public URL actually runs the full app. GitHub Pages alone is a static preview.
- Keep API keys, connection strings, OAuth codes, registration contacts and personal health records out of videos and screenshots.
- Disclose AI-assisted development and any pre-existing code as required by the event rules. Describe only work completed during the allowed period as hackathon work.
- Include the repository, demo video, setup instructions, team and eligible category selections. Do not claim first-time status without checking your team.

## Validation record

Five automated integration suites pass, including account isolation, wearable scopes, data-preview consent, source validation, edit conflicts, activity tracking, and mocked Tiger query contracts. Production frontend build passes. Paid provider calls and live PostgreSQL are not proven by those tests. Oura works according to the team's latest report. The Apple Health companion and Docker deployment are not yet compiled/deployed in this environment.

## Updated core experience

Camera check-in and Photo tracking are now the dashboard entry points. The experimental Python rPPG engine, image-boundary journal, optional dictation and consented Gemini photo observations complete the original multimodal direction. Use [the updated two-minute demo](DEMO-2-MINUTES.md), and read [vision validation limits](VISION.md). Do not claim a validated recovery score, continuous biometric streaming, or clinical rPPG accuracy.
