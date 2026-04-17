# Architecture

## Goal

The platform lets restaurants onboard themselves, connect a phone ordering workflow, and receive structured orders captured by an AI voice agent.

## Runtime Components

- Web dashboard: restaurant onboarding, menu management, orders, calls, settings.
- API: multi-tenant business logic and integration endpoints.
- Agent worker: LiveKit voice agent runtime and restaurant-specific tools.
- PostgreSQL: tenants, restaurants, menus, calls, orders, billing state.
- Redis: queues, short-lived state, future LiveKit support services.
- SIP/LiveKit: telephony and realtime audio layer.

## Request Flow

```text
Restaurant user
  -> web dashboard
  -> API
  -> PostgreSQL

Caller
  -> phone number / SIP provider
  -> LiveKit SIP
  -> LiveKit room
  -> agent worker
  -> API tools
  -> order
  -> restaurant dashboard / notification
```

## Tenancy

Every restaurant belongs to a tenant. All tenant-owned data must carry either `tenantId` directly or be reachable through a restaurant that belongs to a tenant. API handlers must always scope reads and writes by the authenticated tenant.

## Agent Rules

The voice agent should never invent menu items, prices, delivery zones, or opening hours. It must use backend tools for:

- menu search
- cart updates
- price calculation
- opening hour checks
- delivery zone checks
- order creation
- human handoff

## LiveKit Hosting Strategy

For the MVP, keep the SaaS platform deployable on Hetzner and support LiveKit through configuration. Start with LiveKit Cloud or a separately managed LiveKit deployment, then move to self-hosting once call volume and operational requirements justify it.

