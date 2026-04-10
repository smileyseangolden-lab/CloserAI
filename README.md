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
# 1. Copy environment file. You do NOT need to supply an Anthropic key here
#    anymore — it's managed in-app per organization.
cp .env.example .env

# 2. Boot the whole stack (prod-safe: only the internal nginx proxy is
#    bound to the host, on 127.0.0.1:14000)
docker compose up --build

# 3. Run migrations + seed demo data (in another terminal)
docker compose exec server npm run db:migrate
docker compose exec server npm run db:seed

# 4. Open the app
open http://127.0.0.1:14000

# 5. Sign in with demo@closerai.local / demopassword, then go to
#    Settings → Integrations to paste in your Anthropic API key. Changes
#    take effect immediately — no restart required.
```

For local development where you want direct loopback access to postgres,
redis, the server and the client (for debugging, psql, BullMQ dashboard,
etc.) use the dev overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

This adds host bindings on `127.0.0.1:5432`, `:6379`, `:4000`, and `:3000`
on top of the base stack.

The default seeded login is `demo@closerai.local` / `demopassword`.

## Networking / VPS deployment

The base `docker-compose.yml` is designed to sit behind a VPS-level nginx
reverse proxy. Only the internal nginx proxy container binds a host port,
and it binds to `127.0.0.1:14000` — nothing else (postgres, redis, the
express server, the vite client) is reachable from outside the docker
network.

```
Internet
   │
   ▼
VPS nginx :80/:443  (deploy/nginx.conf.example)
   │
   ▼
127.0.0.1:14000
   │
   ▼
proxy container      (deploy/proxy.nginx.conf)
   ├── /api/*        →  server:4000
   ├── /socket.io/*  →  server:4000
   └── /*            →  client:3000
```

On your VPS, drop `deploy/nginx.conf.example` into
`/etc/nginx/sites-available/closerai`, edit the `server_name` and cert
paths, symlink into `sites-enabled`, and `systemctl reload nginx`. The
only thing that ever touches the public internet is your VPS nginx on
`:443`.

### Host resource footprint (for coexisting with other VPS apps)

CloserAI is pinned to a unique docker subnet and uses predictable
names so you can audit it against other compose projects on the same
VPS without guessing.

| Resource | Value |
|---|---|
| Host port (single) | `${PROXY_BIND:-127.0.0.1}:${PROXY_PORT:-14000}` → proxy container |
| Docker network | `closerai-net` (bridge, subnet `10.89.0.0/16`) |
| Docker volumes | `closerai_pgdata`, `closerai_redis-data` |
| Container names | `closerai-{postgres,redis,server,worker,client,proxy}` |
| Compose project | `closerai` |

Internal ports (5432 postgres, 6379 redis, 4000 server, 3000 client)
live on `closerai-net` only and **do not bind to the host** — they
cannot conflict with anything else on your VPS.

If you have other docker projects running on the same VPS, they won't
collide with CloserAI as long as they don't also use host port 14000,
network name `closerai-net`, or subnet `10.89.0.0/16`.

## Anthropic API key management

Anthropic credentials are **per-organization** and are configured entirely in-app
from Settings → Integrations:

- **Owner-only** — only users with the `owner` role can set, rotate, or remove
  the key
- **Encrypted at rest** with AES-256-GCM using `ENCRYPTION_KEY` from `.env`
- **Never returned** to the client — the UI only shows the first 11 characters
  as a non-secret identifier
- **Test before save** — the UI can ping Claude with a 1-token request to
  verify a candidate key works before persisting it
- **Instant rotation** — a 60-second in-memory cache is invalidated on write,
  so a rotated key takes effect on the next AI request with no server restart

This means the typical incident response flow ("we leaked a key" / "we switched
billing accounts") is: sign in → Settings → Integrations → paste new key →
Save. No `.env` edits, no redeploys, no downtime.

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
