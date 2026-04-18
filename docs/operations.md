# Operations Notes

## Image Publishing

The repository includes a GitHub Actions workflow at [.github/workflows/deploy-images.yml](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/.github/workflows/deploy-images.yml:1) that builds and pushes three images to GHCR:

- `ghcr.io/<owner>/kebab-telefon-assistant-web`
- `ghcr.io/<owner>/kebab-telefon-assistant-api`
- `ghcr.io/<owner>/kebab-telefon-assistant-agent`

The workflow runs on pushes to `main` and on manual dispatch.

If you want to deploy by pulling prebuilt images on Hetzner instead of building on the server, update [infra/docker-compose.prod.yml](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/infra/docker-compose.prod.yml:1) to replace each `build:` block with the matching `image:` reference.
This repository is already set up for that mode. Configure `WEB_IMAGE`, `API_IMAGE`, and `AGENT_IMAGE` in `.env` on `app-01`.

If the GHCR packages are private, authenticate once on the app server:

```bash
echo $GHCR_TOKEN | docker login ghcr.io -u <your-github-username> --password-stdin
```

Use a GitHub personal access token with package read access.

## Postgres Backups

Use [scripts/backup-postgres.sh](/Users/issa/Documents/repos/Kebab-telefon-assistant-v2/scripts/backup-postgres.sh:1) from a host that can reach the database and has `pg_dump` installed.

Required environment variables:

- `DATABASE_URL`
- `BACKUP_DIR`

Optional environment variables:

- `BACKUP_RETENTION_DAYS`

Example:

```bash
export DATABASE_URL='postgresql://restaurant_ai:secret@10.0.1.10:5432/restaurant_ai?schema=public'
export BACKUP_DIR='/var/backups/kebab-telefon-assistant'
export BACKUP_RETENTION_DAYS='14'
./scripts/backup-postgres.sh
```

Example cron entry for nightly backups at `02:15` UTC:

```cron
15 2 * * * DATABASE_URL='postgresql://restaurant_ai:secret@10.0.1.10:5432/restaurant_ai?schema=public' BACKUP_DIR='/var/backups/kebab-telefon-assistant' BACKUP_RETENTION_DAYS='14' /opt/kebab-telefon-assistant-v2/scripts/backup-postgres.sh >> /var/log/kebab-backup.log 2>&1
```

This script writes compressed SQL dumps. Keep a copy off-server; local backups alone are not enough.
