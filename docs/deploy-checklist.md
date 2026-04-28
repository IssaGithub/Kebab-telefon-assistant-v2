# Production Deployment Checklist

This checklist assumes the recommended Hetzner layout for this repository:

- `app-01`: `caddy`, `web`, `api`, `agent`
- `db-01`: `postgres`, `redis`
- `LiveKit Cloud`, the SIP trunk or phone number provider, `OpenAI`, and `Stripe` stay external

For the MVP, do not self-host LiveKit SIP on Hetzner. Use LiveKit Cloud first so the app deployment only needs outbound connectivity to LiveKit and inbound HTTPS for API/webhooks. Self-hosting LiveKit server plus LiveKit SIP later is possible, but it is a separate media infrastructure task with SIP, RTP, WebRTC, TURN/STUN, and firewall work.

## 1. Provision Infrastructure

1. Create a Hetzner Cloud project in the region closest to your restaurants.
2. Create a private network and attach both servers.
3. Provision:
   - `app-01` with a public IP and private NIC
   - `db-01` with a private NIC and no public database exposure
4. Add firewall rules:
   - `app-01`: allow `22/tcp` from your admin IP, `80/tcp`, `443/tcp`
   - `db-01`: allow `22/tcp` from your admin IP only
5. Point DNS records for `app.yourdomain.com` and `api.yourdomain.com` to `app-01`.

## 2. Bootstrap Status

If you provisioned the servers with the Terraform in `infra/terraform`, cloud-init already installs:

- Docker Engine
- Docker Compose plugin
- Git
- UFW with a minimal host rule set

Verify on both servers:

```bash
docker --version
docker compose version
```

## 3. Place the Repository on Both Servers

Clone the repository to the same path on both servers, for example:

```bash
git clone <your-repo-url> /opt/kebab-telefon-assistant-v2
cd /opt/kebab-telefon-assistant-v2
```

All commands below assume you are running them from `/opt/kebab-telefon-assistant-v2`.

## 4. Prepare Environment Files

Create `.env` on `app-01`:

```env
DATABASE_URL=postgresql://restaurant_ai:CHANGE_ME@10.0.1.10:5432/restaurant_ai?schema=public
REDIS_URL=redis://10.0.1.10:6379

API_PORT=4000
WEB_PORT=3000
APP_DOMAIN=app.yourdomain.com
API_DOMAIN=api.yourdomain.com
CADDY_EMAIL=ops@yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
INTERNAL_API_URL=http://api:4000
WEB_APP_URL=https://app.yourdomain.com

LIVEKIT_URL=wss://your-livekit-endpoint
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_SIP_OUTBOUND_TRUNK_ID=...
LIVEKIT_AGENT_NAME=kebab-phone-agent

OPENAI_API_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

WEB_IMAGE=ghcr.io/<your-github-owner>/kebab-telefon-assistant-web:latest
API_IMAGE=ghcr.io/<your-github-owner>/kebab-telefon-assistant-api:latest
AGENT_IMAGE=ghcr.io/<your-github-owner>/kebab-telefon-assistant-agent:latest
```

`NEXT_PUBLIC_API_URL` is the public browser-facing API URL. `INTERNAL_API_URL` is used by server-side Next.js code inside Docker. `WEB_APP_URL` is used when the API builds login, verification, and password-reset links.

Create `.env.db` on `db-01`:

```env
POSTGRES_DB=restaurant_ai
POSTGRES_USER=restaurant_ai
POSTGRES_PASSWORD=CHANGE_ME
POSTGRES_BIND_IP=10.0.1.10
REDIS_BIND_IP=10.0.1.10
```

Replace `10.0.1.10` with the private IP of `db-01`.

## 5. Bring Up Database Services

On `db-01`:

```bash
docker compose --env-file .env.db -f infra/docker-compose.db.yml up -d
```

Verify:

```bash
docker compose --env-file .env.db -f infra/docker-compose.db.yml ps
```

## 6. Configure Caddy

[infra/caddy/Caddyfile](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/infra/caddy/Caddyfile:1) reads `APP_DOMAIN`, `API_DOMAIN`, and `CADDY_EMAIL` from `.env`, so no server-side Caddyfile edit is needed for normal production deploys.

## 7. Deploy Application Services

On `app-01`:

```bash
echo $GHCR_TOKEN | docker login ghcr.io -u <your-github-username> --password-stdin
docker compose --env-file .env -f infra/docker-compose.prod.yml pull
docker compose --env-file .env --profile ops -f infra/docker-compose.prod.yml run --rm migrate
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d
```

If you want GitHub Actions to deploy automatically after a successful `main` build, add these repository secrets first:

- `GHCR_TOKEN`
- `GHCR_USERNAME`
- `HETZNER_APP_HOST`
- `HETZNER_APP_PATH`
- `HETZNER_APP_SSH_KEY`
- `HETZNER_APP_SSH_KNOWN_HOSTS`
- `HETZNER_APP_USER`

`HETZNER_APP_SSH_KNOWN_HOSTS` should contain the output of:

```bash
ssh-keyscan -H <app-01-ip-or-hostname>
```

Verify:

```bash
docker compose --env-file .env -f infra/docker-compose.prod.yml ps
curl -f https://api.yourdomain.com/health
```

## 8. Configure LiveKit Cloud Telephony

1. In LiveKit Cloud, create or select the project matching `LIVEKIT_URL`.
2. Add a SIP trunk provider or LiveKit phone number.
3. Create an inbound trunk for the phone number/provider.
4. Configure LiveKit webhooks to send events to:

```text
https://api.yourdomain.com/v1/livekit/webhook
```

5. Confirm the `agent` container is running with `LIVEKIT_AGENT_NAME=kebab-phone-agent`.
6. In the dashboard, activate a restaurant number with provider `LiveKit SIP` and paste the LiveKit inbound trunk ID into `SIP Trunk ID`.
7. Call the number. The expected flow is:

```text
phone call -> LiveKit SIP -> per-call room -> kebab-phone-agent -> API webhook -> dashboard call/order rows
```

Real-call acceptance checklist:

- `docker compose --env-file .env -f infra/docker-compose.prod.yml ps` shows `api`, `web`, and `agent` running.
- `https://api.yourdomain.com/health` returns `200`.
- `/v1/system/capabilities` reports telephony as configured after login.
- Activating a restaurant number stores a `livekitDispatchRuleId`.
- The LiveKit Cloud room for the call shows one SIP participant and one `kebab-phone-agent` participant.
- The dashboard `Anrufe` page shows a new inbound call within a few seconds.
- The dashboard `Bestellungen` page shows a linked draft order.

## 9. Post-Deploy Checks

1. Open `https://app.yourdomain.com`.
2. Verify `https://api.yourdomain.com/health` returns `200`.
3. Create a test restaurant through the UI or API.
4. Check `/v1/system/capabilities` and confirm whether telephony shows configured or intentionally disabled.
5. If LiveKit is configured, test inbound calling by activating a phone number and confirming the call appears under `Anrufe`.
6. If `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` is configured, test outbound test call creation.

## 10. Backups and Monitoring

Set up before onboarding real customers:

- Daily Postgres backups
- Off-server backup storage
- Uptime checks for app and API
- Error tracking for `web` and `api`
- Disk usage alerts on `db-01`

The repository includes a backup helper at [scripts/backup-postgres.sh](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/scripts/backup-postgres.sh:1) and additional operations notes in [docs/operations.md](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/docs/operations.md:1).

## 11. Release Routine

For each deployment:

```bash
docker compose --env-file .env -f infra/docker-compose.prod.yml pull
docker compose --env-file .env --profile ops -f infra/docker-compose.prod.yml run --rm migrate
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d
```

If the schema changes, do not skip the migration step.

If you adopt GHCR image publishing through [.github/workflows/deploy-images.yml](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/.github/workflows/deploy-images.yml:1), you can switch the app server from local `docker compose build` to `docker compose pull` plus `docker compose up -d`.

The repository now separates the delivery flow into three GitHub Actions:

- `CI`: install, Prisma generate, typecheck, build
- `Build Images`: publish GHCR images only after successful `CI`
- `Deploy Hetzner`: SSH deploy after successful image publish, or manual dispatch
