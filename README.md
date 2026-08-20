# Pykes

A self-hosted build-in-public platform for indie devs and creators. Post updates
tied to your projects, and watch each project's pixel-art "garden" grow every
time you ship. Zero paid services — everything runs in Docker.

## Stack

| Piece      | Tool                          |
|------------|--------------------------------|
| Proxy/TLS  | Caddy (free auto-HTTPS)        |
| Frontend   | React + Vite, static via Nginx |
| Backend    | Node.js + Express + ws         |
| Database   | PostgreSQL                     |
| Cache      | Redis                          |
| Media      | MinIO (self-hosted, S3-compatible) |

## Running it

```bash
cp backend/.env.example backend/.env   # already done for you in this scaffold
docker compose up --build
```

Then visit `http://localhost` (Caddy listens on 80/443). The frontend talks to
`/api/*` and `/ws`, which Caddy routes to the backend container.

## What's implemented

- JWT-based auth (register/login), projects, posts (with `growth_stage`-advancing
  `shipped`/`release` post types), likes, follows, comments (with per-user rate
  limiting), and image uploads to MinIO
- A live pixel-garden: `<canvas>` rendering by growth stage
  (`frontend/src/garden/`), animated in real time over the `/ws` WebSocket
- A full React UI: auth, feed, composer (with post type + image upload),
  project creation and detail pages, comments, profiles
- Fan-out-on-write feed: new posts are pushed into each follower's Redis
  `feedline:<userId>` sorted set at write time (with follow-time backfill and
  unfollow-time purge), so `GET /posts/feed` reads a pre-built list instead of
  joining `follows` on every request
- Authenticated, per-user-targeted WebSocket: `/ws?token=<jwt>` rejects
  invalid/missing tokens, and `wsHub.sendToUser` delivers direct notifications
  (e.g. new-follower) to one user instead of every connected client. Delivery
  goes through Redis pub/sub rather than direct socket writes, so it stays
  correct if the backend ever runs as more than one replica
- Production hardening: per-IP rate limiting on `/api/auth/*`, a sanitized
  error handler (no internal error details leak to clients), Postgres/Redis/
  MinIO bound to localhost only, graceful shutdown on `SIGTERM`/`SIGINT`, and
  schema migrations (`backend/migrations/`, via node-pg-migrate) instead of
  manual DB changes
- Full endpoint list and request/response shapes: [`docs/API.md`](docs/API.md)

## What's next (roughly in priority order)

1. **Deploy for free** — Oracle Cloud's Always-Free tier (a small ARM VM) or a
   free-tier Fly.io app can run this whole Compose stack publicly at no cost.

## Local dev without Docker (faster iteration)

Run Postgres/Redis/MinIO in Docker, but run the app processes on your host:

```bash
docker compose up postgres redis minio -d
cd backend
npm.cmd install
npm.cmd run dev          # loads backend/.env.local (localhost hostnames)
```

In a second terminal:

```bash
cd frontend
npm.cmd install
npm.cmd run dev           # Vite dev server, proxies /api and /ws to :4000
```

Note: `backend/.env` (Docker hostnames) and `backend/.env.local` (localhost
hostnames) are separate on purpose — `npm run dev` always loads `.env.local`,
so running the backend on your host never collides with the Docker Compose
version of the same service.

## Running the E2E tests

End-to-end tests live in `e2e/` (Playwright, Chromium only) and cover auth,
posting, the garden-growth toast (including the owner-only regression test),
the follow lifecycle (backfill, targeted WS notifications, fan-out, unfollow
purge), likes, and comments — see `e2e/tests/`.

```bash
docker compose up -d postgres redis minio   # if not already running
cd e2e
npm install
npx playwright install chromium             # first time only
npx playwright test
```

`npx playwright test` alone brings up both the backend and frontend dev
servers for you (see the `webServer` config in `e2e/playwright.config.js`) —
no need to start them manually first. If they're already running on
:4000/:5173 (e.g. from the "Local dev without Docker" workflow above),
they're reused instead of started again.

Every run records a full trace and video for every test (not just
failures), since these runs are meant to be reviewed, not just reduced to a
pass/fail count. After a run:

```bash
npx playwright show-report   # opens an HTML report with embedded
                              # video/trace links per test
```

Raw artifacts (screenshots, videos, `trace.zip`) also live under
`e2e/test-results/<test-name>/` if you want them without the report UI —
`npx playwright show-trace <path-to-trace.zip>` opens the trace viewer
directly.

## Running it on local Kubernetes (kind)

For practicing real k8s workflows (`kubectl`, Deployments, rollouts) against
this app, using the manifests in `k8s/`. Postgres/Redis/MinIO stay in Docker
Compose — only the frontend and backend run in the cluster, reaching the
datastores via `host.docker.internal`.

**One-time setup:**

```bash
docker compose up -d postgres redis minio
kind create cluster --name pykes-dev

kubectl create secret generic backend-env \
  --from-literal=PORT=4000 \
  --from-literal=DATABASE_URL="postgres://pykes:pykes@host.docker.internal:5432/pykes" \
  --from-literal=REDIS_URL="redis://host.docker.internal:6379" \
  --from-literal=JWT_SECRET="change-this-to-something-long-and-random" \
  --from-literal=S3_ENDPOINT="http://host.docker.internal:9000" \
  --from-literal=S3_ACCESS_KEY="pykesadmin" \
  --from-literal=S3_SECRET_KEY="pykessecret" \
  --from-literal=S3_BUCKET="pykes-media"
```

**Every time you change code:**

```bash
docker build -t pykes-backend:dev ./backend
docker build -t pykes-frontend:dev ./frontend
kind load docker-image pykes-backend:dev --name pykes-dev
kind load docker-image pykes-frontend:dev --name pykes-dev
kubectl apply -f k8s/
kubectl rollout restart deployment/backend deployment/frontend
```

The manifests use `imagePullPolicy: Never`, so the cluster only ever runs an
image you explicitly loaded — skip the reload/restart after a rebuild and
you're just looking at stale code.

**Access it:**

```bash
kubectl port-forward svc/frontend 8080:80   # http://localhost:8080
kubectl port-forward svc/backend 4000:4000  # http://localhost:4000/api/health
```

**Tear down:**

```bash
kind delete cluster --name pykes-dev
```

