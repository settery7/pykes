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

- `POST /api/auth/register`, `POST /api/auth/login` — JWT-based auth
- `POST /api/projects`, `GET /api/projects/user/:userId`, `GET /api/projects/:ownerId/:slug`
  — projects are the core entity; posts attach to them
- `POST /api/posts` — takes `content`, optional `projectId`, and `postType`
  (`update` | `shipped` | `bug` | `idea` | `release`). Posting `shipped` or
  `release` against a project increments that project's `growth_stage` and
  broadcasts a `project_growth` WebSocket event.
- `GET /api/posts/feed` (Redis-cached, 30s TTL), `POST /api/posts/:id/like`
- `POST /api/follows/:userId`, `DELETE /api/follows/:userId`
- WebSocket endpoint at `/ws` — now pushes real `project_growth` events via
  `src/wsHub.js`, not just an echo stub
- A minimal React UI: sign up, post, see your feed

## What's next (roughly in priority order)

1. **Pixel-garden rendering** — this is the actual gimmick. Build a `/garden/:ownerId/:slug`
   page (or embed it on the project page) with a `<canvas>` that renders a
   sprite based on `growth_stage`, and subscribes to `/ws` for live
   `project_growth` events to animate in real time. Aseprite-export a handful
   of growth-stage sprite frames (seedling → sprout → small structure →
   bigger structure) to start.
2. **Project creation UI** — the backend route exists; the React app needs a
   "new project" form and a way to pick a project when composing a post.
3. **Media uploads** — wire the backend to MinIO via the S3 SDK (`@aws-sdk/client-s3`
   points at `S3_ENDPOINT` fine) so posts can carry images.
4. **Comments UI + route** — the `comments` table already exists in the schema;
   just needs a route and a UI component.
5. **Fan-out feed strategy** — right now the feed is computed on read and cached
   for 30s. Fine at small scale; once you have real users, switch to fan-out-on-write.
6. **Deploy for free** — Oracle Cloud's Always-Free tier (a small ARM VM) or a
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

