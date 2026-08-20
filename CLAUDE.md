## Commands

### Frontend (`frontend/`)
- Dev server: `npm run dev` (port 5173, proxies `/api` → `:4000`)
- Build: `npm run build`
- Preview: `npm run preview`

### Backend (`backend/`)
- Dev server: `npm run dev` (requires `.env.local`, uses `--watch`)
- Start: `npm start`

### Full stack (Docker)
- Start all services: `docker compose up --build`
- Services: Caddy (80/443), Frontend, Backend (:4000), Postgres (:5432), Redis (:6379), MinIO (:9000/:9001)

## Architecture Notes
- Monorepo: `frontend/` (React 18 + Vite) + `backend/` (Express + pg + redis)
- Auth: JWT via `jsonwebtoken` + `bcryptjs`; rate-limited on `/api/auth/*` (Redis, per-IP)
- File storage: MinIO (S3-compatible), accessed via `@aws-sdk/client-s3`
- Real-time: WebSocket server at `/ws?token=<jwt>` via `ws` — connections require a
  valid JWT. Delivery goes through Redis pub/sub (`backend/src/wsHub.js`), not
  direct socket writes, so `broadcast`/`sendToUser` work correctly across more
  than one backend replica
- Reverse proxy: Caddy — see `Caddyfile`
- DB schema: `backend/src/db/schema.sql` bootstraps a brand-new Postgres volume
  (via `docker-entrypoint-initdb.d`); `backend/migrations/` (node-pg-migrate,
  runs automatically on boot) is the source of truth for every schema change
  after that — new changes are new migration files, not edits to schema.sql

## Testing
- E2E: Playwright, in `e2e/` — see its section in README.md for how to run it
- No unit/integration test suite for the backend yet
