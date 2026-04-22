# Deploy CloserAI on a shared VPS (behind nginx + plain HTTP)

This is the exact sequence that gets a fresh clone running on a Linux VPS
that already has other Dockerized apps (e.g. ContractShield, ProposalManager)
alongside nginx as a reverse proxy. Everything is plain HTTP on an IP;
terminate TLS in nginx / Caddy / Cloudflare in front when you're ready.

## 1. Clone and pick a branch

```bash
cd ~
git clone https://github.com/<you>/CloserAI.git
cd CloserAI
git checkout main
```

## 2. Create `.env` — **do NOT keep the VITE_ lines**

```bash
cp .env.example .env
# Edit .env:
#   - Set ANTHROPIC_API_KEY
#   - Set JWT_SECRET (64 random bytes)
#   - Set ENCRYPTION_KEY (32 random bytes)
#   - Leave VITE_API_URL / VITE_WS_URL commented out (the client's relative
#     /api/v1 default is what you want behind the nginx proxy)
```

## 3. Create `docker-compose.override.yml` for port conflicts

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

This file is gitignored and exists specifically to remap host ports when
another app on the VPS already owns 3000 / 5432 / 6379. The template uses
`!override` on every `ports:` block so the bindings REPLACE the base file's
(otherwise Compose appends and you get Postgres exposed on 0.0.0.0:5432 —
not what you want).

Adjust the port numbers if 13000/14000/15432/16379 are taken on your host.

## 4. Configure nginx to front the app

Add a site config (e.g. `/etc/nginx/sites-available/closerai`):

```nginx
server {
    listen 3000;
    listen [::]:3000;

    # /api/* -> server container (mapped to host 14000 by the override)
    location /api/ {
        proxy_pass http://127.0.0.1:14000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # everything else -> Vite client (mapped to host 13000 by the override)
    location / {
        proxy_pass http://127.0.0.1:13000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Vite HMR websocket
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

Symlink and reload:

```bash
sudo ln -sf /etc/nginx/sites-available/closerai /etc/nginx/sites-enabled/closerai
sudo nginx -t && sudo systemctl reload nginx
```

Open the port if you use ufw:

```bash
sudo ufw allow 3000/tcp
```

## 5. Bring the stack up

```bash
cd ~/CloserAI
docker compose up -d --build
docker compose ps          # all five containers Up, postgres+redis (healthy)
```

## 6. Migrate and seed

```bash
docker compose exec server npm run db:migrate    # non-interactive; no prompts
docker compose exec server npm run db:seed       # only for demo data — skip in prod
```

## 7. Verify end-to-end

```bash
# Same-origin health check via nginx → server
curl -si http://127.0.0.1:3000/api/v1/health | head -3

# Public-IP variant (sub in your VPS IP / domain)
curl -si http://<your-vps-ip>:3000/api/v1/health | head -3
```

Both should return `HTTP/1.1 200 OK` with `{"status":"ok", ...}`.

Then open `http://<your-vps-ip>:3000/login`, sign in (seeded demo:
`demo@closerai.local` / `demopassword`), and you'll land on the Dashboard.

## 8. When you put a real domain + TLS in front

Set `FORCE_HTTPS=true` in `.env` and recreate the server container. That
re-enables HSTS + `upgrade-insecure-requests`, which Helmet omits by
default for safety over plain HTTP.

## Cron / scheduler knobs

All schedulers are env-tunable (defaults in `packages/server/src/config/env.ts`):

| Env var                            | Default  | What it controls                        |
|-----------------------------------|----------|-----------------------------------------|
| `CAMPAIGN_SCHEDULER_INTERVAL_MS`  | 30000    | How often cadence steps fire            |
| `OPTIMIZATION_SCHEDULER_INTERVAL_MIN` | 360  | Autonomous optimization analysis        |
| `MANAGER_SCHEDULER_INTERVAL_MS`   | 600000   | Sales/Marketing/CRO manager cadence tick|

Set any of them to `0` to disable that scheduler entirely.

## Kill switch

Click "Pause all outbound" in the sidebar footer (owner/admin/manager roles)
to stop every campaign-lead send instantly across the org. Surfaced via
`PATCH /api/v1/organizations/current/pause-outbound`.

## Rollback

```bash
cd ~/CloserAI
git checkout main       # or an earlier tag
docker compose down
docker compose up -d --build
docker compose exec server npm run db:migrate
```

The `db:migrate` is additive — tables added in later commits stay in the DB
but become unused. Nothing is destroyed.
