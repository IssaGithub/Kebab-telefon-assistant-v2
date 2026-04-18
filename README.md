# Kebab Telefon Assistant V2

SaaS platform for AI-powered restaurant phone ordering. Restaurants can onboard, manage menus, connect a phone number, and receive structured orders captured by an AI voice assistant.

## Repository Structure

```text
apps/
  web/      Next.js restaurant dashboard
  api/      HTTP API for SaaS data and integrations
  agent/    LiveKit voice agent worker
packages/
  db/       Prisma schema and database client
  shared/   Shared TypeScript types and validation helpers
infra/
  docker-compose.yml
  caddy/
docs/
  architecture.md
  deployment-hetzner.md
```

## Local Development

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Start Postgres, Redis, API, web, and agent services:

```bash
docker compose -f infra/docker-compose.yml up --build
```

4. Open the dashboard:

```text
http://localhost:3000
```

## Local MVP Flow

1. Install dependencies:

```bash
npm install
```

2. Start Postgres and Redis locally.
If you do not already have them running, the simplest option is to start the local containers used during development.

3. Apply the schema and seed demo data:

```bash
npm run db:deploy
npm run db:seed
```

4. Start the full app:

```bash
npm run dev
```

5. Open the dashboard at `http://localhost:3000`

Seeded demo login:

```text
E-Mail: owner@example.com
Passwort: supersecret
```

You can also create a completely new tenant from `/login`.
Every newly created restaurant now receives a starter menu automatically, so you can test the AI order demo immediately without manual menu setup.

## MVP Test Path

1. Create a new tenant from the login page.
2. Open the dashboard.
3. Use `KI-Telefonassistent Demo` on the dashboard.
4. Start a demo call for the selected restaurant.
5. Send messages like:

```text
Ich haette gern 2 Doener Teller, mein Name ist Samet
Abholung bitte, meine Nummer ist +491701234567 und das war alles
```

6. Open `Bestellungen` to accept or complete the order.
7. Open `Anrufe` to inspect the stored transcript.

## First Milestone

- Multi-tenant restaurant onboarding
- Menu and option management
- Order capture and status workflow
- LiveKit agent service skeleton
- Hetzner-ready Docker Compose deployment

## API MVP

The API exposes the first SaaS workflows:

```text
POST /v1/onboarding
GET  /v1/restaurants
POST /v1/restaurants
GET  /v1/restaurants/:restaurantId
POST /v1/restaurants/:restaurantId/menus
GET  /v1/restaurants/:restaurantId/menus
POST /v1/menus/:menuId/categories
POST /v1/menu-categories/:categoryId/items
```

Example onboarding request:

```json
{
  "tenant": {
    "name": "Demo Restaurant GmbH",
    "slug": "demo-restaurant"
  },
  "owner": {
    "email": "owner@example.com",
    "name": "Demo Owner"
  },
  "restaurant": {
    "name": "Demo Kebab",
    "phone": "+49301234567",
    "addressLine1": "Hauptstrasse 1",
    "postalCode": "10115",
    "city": "Berlin",
    "countryCode": "DE"
  }
}
```
