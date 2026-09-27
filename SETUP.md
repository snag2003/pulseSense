# Finish setting up PulseSense

## Use your updated local app

The working folder is `/Users/stephanyacosta/Desktop/pulsesense 2`.
Stop the old backend in its terminal with Control+C, then run:

```sh
npm run server
```

Keep your existing Vite terminal running, or start `npm run dev` in another terminal. Open http://localhost:5173. Your existing Oura configuration and local records are preserved. Look for Camera check-in, Photo tracking, Appointment brief, AI activity, and Trend analytics in the sidebar. The camera/photo Python runtime has been installed in this working copy; see VISION.md for setup on another machine.

## Tiger Data

1. In your Tiger Data account, create or select a PostgreSQL service with TimescaleDB enabled. Review any service charges before creating it.
2. Copy its PostgreSQL connection string into your local `.env` as `TIGER_DATABASE_URL=...`. It includes a password: do not put it in source code, GitHub, screenshots or chat.
3. In the app folder run `npm run tiger:migrate`. This creates a measurement hypertable and daily continuous aggregate; it uploads no health readings.
4. Restart the backend. Open **Trend analytics**, read the data-sharing notice, approve the snapshot and press **Sync measurement snapshot**.
5. Confirm that daily rows appear and the page identifies Tiger Data. A configured badge alone does not prove the database works.

TLS certificate verification is enabled. If your service uses a private certificate authority, provide the trusted CA path in `TIGER_CA_FILE`; do not disable verification. The app needs permission to create the schema and refresh its aggregate. Accounts and the journal still use local SQLite; Tiger stores only the separate, explicitly synced analytics copy. Use one backend instance with persistent storage.

## Domain: pulsesenseai.us

Registration reserves the name; it does not deploy the app. Your pasted settings show Porkbun nameservers. DNS changes belong there unless you deliberately change nameservers.

DigitalOcean is not required. This repository includes a standard Dockerfile and optional Docker Compose/Caddy configuration for any compatible persistent server. No paid server has been created. GitHub Pages can host a static frontend, but cannot run this Node server, SQLite sessions, secret API keys or Oura token exchange.

Once you choose a host:

1. Deploy the Node app with a persistent `/app/data` directory, including the SQLite database and wearable encryption key. Keep secrets outside the repository. Do not use disposable storage for real accounts.
2. Copy `deploy/production.env.example` to `.env.production` and fill in the secrets privately. Set `APP_ORIGIN=https://pulsesenseai.us` and `OURA_REDIRECT_URI=https://pulsesenseai.us/api/wearables/oura/callback`.
3. Add that exact HTTPS callback to your Oura developer application, keeping your local callback if you still use it.
4. Add the DNS records specified by your chosen host. For the included standalone Caddy setup, point the root A record to your server's IPv4 address and allow inbound ports 80 and 443. Do not guess an IP or add an IPv6 record unless configured.
5. For the standalone Docker setup, run `docker compose -f deploy/compose.yaml up -d --build` on the server. Caddy obtains HTTPS after DNS resolves correctly. For managed hosting, use its domain/TLS instructions instead.
6. Verify signup, login, Oura reconnect/sync, brief generation, narration, Tiger sync and data persistence after restart before sharing the public link.

The Docker deployment has not been run in this environment. A domain purchase alone does not establish GoDaddy challenge eligibility; retain your redemption confirmation and ask the organizer if the Porkbun registration qualifies.

## AI usage and account keys

Keys previously pasted in chat should be replaced privately in provider dashboards and `.env`. Never put them in frontend variables. PulseSense does not enforce daily AI quotas. Activity includes attempted requests and failures. Optional pricing variables produce estimates only, not a provider billing guarantee. Missing pricing displays unknown rather than zero.
