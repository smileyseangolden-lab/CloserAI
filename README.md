# CloserAI — Autonomous AI Sales Platform

CloserAI is a full-stack SaaS platform that automates the entire B2B sales lifecycle, from business/ICP analysis through lead generation, multi-agent outreach, AI-driven nurture cadences, and deal closing (AI or human handoff).

## What's inside

| Layer | Stack |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Zustand + React Router 7 |
| Backend | Node.js + Express + TypeScript + Drizzle ORM |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 + BullMQ |
| AI | Anthropic Claude (Opus 4.6 / Haiku 4.5) |
| Infra | Docker Compose (Nginx + VPS-ready for production) |

## Repository layout

```
.
├── docker-compose.yml
├── .env.example
├── packages/
│   ├── server/   # Express API + job workers + Drizzle schema
│   └── client/   # React + Vite SPA
└── scripts/      # One-off scripts (seeding, migrations)
```

## Quick start

```bash
# 1. Copy environment file and fill in Anthropic key
cp .env.example .env

# 2. Boot the whole stack
docker compose up --build

# 3. Run migrations + seed demo data (in another terminal)
docker compose exec server npm run db:migrate
docker compose exec server npm run db:seed

# 4. Open the app
open http://localhost:3000
```

The default seeded login is `demo@closerai.local` / `demopassword`.

## Phase map

This repo follows the phased build order described in the product brief:

1. **Database foundation** — all Phase 1 tables exist in `packages/server/src/db/schema.ts`.
2. **Auth + multi-tenancy** — JWT with refresh token rotation, RBAC middleware.
3. **Business profile + ICP** — CRUD plus Claude-driven analysis.
4. **Leads + contacts** — CRUD, CSV import, bulk actions, deduplication.
5. **Agent profiles + knowledge base** — personality configuration and message testing.
6. **Campaigns + cadences** — campaign builder, cadence steps, A/B variants.
7. **Message engine** — AI generation, queued sending, inbox sync, reply classification.
8. **Campaign execution engine** — BullMQ worker that advances active campaign leads.
9. **Opportunities + closing** — deal pipeline, closing agent, handoff logic.
10. **Analytics** — funnel metrics, campaign + agent performance.
11. **Frontend** — dashboard, leads, campaigns, agents, opportunities, settings pages.
12. **Integrations** — adapter interfaces (stubs) for enrichment, LinkedIn, CRM, calendar, scraping.

## Development

```bash
# Run server only (requires local Postgres + Redis)
npm --workspace @closerai/server run dev

# Run client only
npm --workspace @closerai/client run dev

# Generate a new Drizzle migration after editing schema
npm --workspace @closerai/server run db:generate

# Apply migrations
npm --workspace @closerai/server run db:migrate
```

## Security notes

- Passwords: bcrypt cost 12
- JWT: 15-minute access tokens, 7-day rotating refresh tokens
- SMTP credentials encrypted with AES-256-GCM at rest
- API keys are shown once and stored as SHA-256 hashes
- Rate limiting enforced per user and per organization
- All queries parameterized through Drizzle (SQL-injection safe)

## License

Proprietary - all rights reserved.
