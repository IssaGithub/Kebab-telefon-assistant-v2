# Production Deployment Checklist

This checklist assumes the recommended Hetzner layout for this repository:

- `app-01`: `caddy`, `web`, `api`, `agent`
- `db-01`: `postgres`, `redis`
- `LiveKit`, `OpenAI`, and `Stripe` stay external

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
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

LIVEKIT_URL=wss://your-livekit-endpoint
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_SIP_OUTBOUND_TRUNK_ID=...

OPENAI_API_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

WEB_IMAGE=ghcr.io/<your-github-owner>/kebab-telefon-assistant-web:latest
API_IMAGE=ghcr.io/<your-github-owner>/kebab-telefon-assistant-api:latest
AGENT_IMAGE=ghcr.io/<your-github-owner>/kebab-telefon-assistant-agent:latest
```

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

Update [infra/caddy/Caddyfile](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/infra/caddy/Caddyfile:1) with your real domains and operations email:

```caddy
{
  email ops@yourdomain.com
}

app.yourdomain.com {
  reverse_proxy web:3000
}

api.yourdomain.com {
  reverse_proxy api:4000
}
```

## 7. Deploy Application Services

On `app-01`:

```bash
echo $GHCR_TOKEN | docker login ghcr.io -u <your-github-username> --password-stdin
docker compose -f infra/docker-compose.prod.yml pull
docker compose --profile ops -f infra/docker-compose.prod.yml run --rm migrate
docker compose -f infra/docker-compose.prod.yml up -d
```

Verify:

```bash
docker compose -f infra/docker-compose.prod.yml ps
curl -f https://api.yourdomain.com/health
```

## 8. Post-Deploy Checks

1. Open `https://app.yourdomain.com`.
2. Verify `https://api.yourdomain.com/health` returns `200`.
3. Create a test restaurant through the UI or API.
4. Check `/v1/system/capabilities` and confirm whether telephony shows configured or intentionally disabled.
5. If LiveKit is configured, test outbound test call creation.

## 9. Backups and Monitoring

Set up before onboarding real customers:

- Daily Postgres backups
- Off-server backup storage
- Uptime checks for app and API
- Error tracking for `web` and `api`
- Disk usage alerts on `db-01`

The repository includes a backup helper at [scripts/backup-postgres.sh](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/scripts/backup-postgres.sh:1) and additional operations notes in [docs/operations.md](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/docs/operations.md:1).

## 10. Release Routine

For each deployment:

```bash
docker compose -f infra/docker-compose.prod.yml pull
docker compose --profile ops -f infra/docker-compose.prod.yml run --rm migrate
docker compose -f infra/docker-compose.prod.yml up -d
```

If the schema changes, do not skip the migration step.

If you adopt GHCR image publishing through [.github/workflows/deploy-images.yml](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/.github/workflows/deploy-images.yml:1), you can switch the app server from local `docker compose build` to `docker compose pull` plus `docker compose up -d`.
