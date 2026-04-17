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
