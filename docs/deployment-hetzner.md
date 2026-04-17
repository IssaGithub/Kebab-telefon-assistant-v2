# Hetzner Deployment

## MVP Recommendation

Use Docker Compose on one or two Hetzner Cloud servers before introducing Kubernetes.

Recommended first production layout:

```text
app-01
  Caddy
  web
  api
  agent

db-01
  PostgreSQL
  Redis
  private Hetzner Network only
```

For the earliest pilot, all services can run on one server while backups and monitoring are configured from day one.

## Ports

Web/API:

- `80` and `443` public for Caddy
- `3000` and `4000` internal only in production

Database:

- `5432` private network only
- `6379` private network only

LiveKit self-hosting later:

- SIP signaling port `5060`
- RTP media range `10000-20000`
- WebRTC ports according to the selected LiveKit deployment

Do not put the SIP/RTP media path behind a standard HTTP load balancer. Keep media networking explicit and test it with the selected SIP provider.

## Deployment Steps

1. Create a Hetzner Cloud project.
2. Create a private network.
3. Create `app-01` and optionally `db-01`.
4. Install Docker and Docker Compose.
5. Point DNS records to `app-01` or to a Hetzner Load Balancer for web traffic.
6. Copy `.env.example` to `.env` and set production secrets.
7. Start services:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

8. Run Prisma migrations:

```bash
npm run db:deploy
```

9. Configure backups for PostgreSQL.
10. Add Sentry or another error tracker before pilots.

## Production Hardening

- Move Postgres and Redis off public interfaces.
- Use strong generated passwords.
- Configure automated database backups.
- Rotate LiveKit, Stripe, and LLM provider secrets.
- Add request logging and audit logs.
- Keep audio recording optional and disabled by default until the legal workflow is finalized.
