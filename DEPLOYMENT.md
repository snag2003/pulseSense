# Free demo deployment

Target domain: **pulsesenseai.us**. GitHub repository: **snag2003/pulseSense**.

The Dockerfile runs the React app, Node API and private Python worker together. `render.yaml` selects a **free** Render web service, not a static site. DigitalOcean is not used. This is a single-instance hackathon demo.

## Current deployment

Live: https://pulsesense-ai-szcc.onrender.com

Render service: `srv-dasbdio473hc73fi6p8g`, Docker, Free, Ohio. Automatic code deployments are off so a commit cannot unexpectedly reset demo records. Deploy manually after reviewing changes. Credentials are configured privately in Render.

`pulsesenseai.us` and `www.pulsesenseai.us` are registered in Render and currently await DNS. In Porkbun, use an A record with a blank Host and answer `216.24.57.1`, plus a CNAME with Host `www` and answer `pulsesense-ai-szcc.onrender.com`. Keep unrelated records. Verify in Render after saving.

Verified live with synthetic data: account creation, saved readings, Gemini guidance, ElevenLabs audio, Tiger sync/continuous aggregate/removal, OpenCV segmentation, and correct rejection of a no-face camera scan. Real-person camera accuracy and the hosted Oura authorization flow remain unverified.

## Render

Create a Web Service using the public GitHub repository and its `main` branch. Choose Docker and the Free plan. Set the variables from `render.yaml` in Render's Environment page. Keep credentials there, never in GitHub. The database certificate file is public certificate material, not a password.

Use these public values:

```
NODE_ENV=production
HOST=0.0.0.0
PORT=10000
APP_ORIGIN=https://pulsesenseai.us
DATABASE_PATH=/app/data/pulsesense.sqlite
DEMO_EPHEMERAL=true
VISION_MAX_WORKERS=1
OURA_REDIRECT_URI=https://pulsesenseai.us/api/wearables/oura/callback
TIGER_CA_FILE=/app/deploy/tiger-service-ca.pem
```

Set Gemini, ElevenLabs, Oura and Tiger secrets privately from your working setup. Render supplies `RENDER_EXTERNAL_URL`, which is also accepted as a browser origin so you can check the app before domain DNS finishes. Do not copy localhost values over the public settings above.

Free hosting has temporary storage. Accounts, sessions, saved photos, the Oura token encryption key, and local records can disappear on restart or idle spin-down. Reconnect Oura if that happens. Consented Tiger snapshots persist separately but are not an account backup or recovery mechanism. Export demo records before a restart. Cloud snapshots belonging to lost local accounts must be removed administratively in Tiger Data; use synthetic demo data where possible.

The free plan has limited CPU and memory. Vision requests run one at a time and may take longer than on the laptop. Verify an actual scan after deployment; a successful health check proves only the web server is running. Do not upgrade to paid hosting automatically.

## Domain and Oura

1. Add `pulsesenseai.us` in the Render service's **Settings → Custom Domains**.
2. In Porkbun, update only the website DNS records to the exact values Render shows. Keep unrelated email and verification records. Remove conflicting parking records only after reviewing them.
3. Verify the domain in Render and wait for HTTPS to be ready.
4. Register `https://pulsesenseai.us/api/wearables/oura/callback` in the Oura application. Keep the local callback if you still use it.
5. Open the custom domain, create a demo account and reconnect Oura. Local account files are not uploaded by this deployment.

## Recording checklist

Open the site before recording so the sleeping server can start. Rehearse without displaying environment variables or provider account pages. Verify signup, a reading, photo processing, a real Gemini result, ElevenLabs audio and Tiger sync. Use the task-based navigation: Home → Check in → My health → Prepare for a visit → Settings. See `DEMO-2-MINUTES.md`.

## Tiger TLS

This service initially presented a Timescale-issued private certificate. `deploy/tiger-service-ca.pem` contains the certificate bundle retrieved from the specific service endpoint using the procedure in Tiger Data's stricter-SSL documentation. It is scoped to this connection via `TIGER_CA_FILE`; global TLS verification remains enabled. Refresh the trusted bundle through your provider's instructions if its certificate changes, and verify the provider identity before replacing it.

References: https://render.com/docs/free · https://render.com/docs/custom-domains · https://www.tigerdata.com/docs/deploy/tiger-cloud/tiger-cloud-aws/security/strict-ssl
