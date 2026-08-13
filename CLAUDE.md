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
- Auth: JWT via `jsonwebtoken` + `bcryptjs`
- File storage: MinIO (S3-compatible), accessed via `@aws-sdk/client-s3`
- Real-time: WebSocket server at `/ws` via `ws` library
- Reverse proxy: Caddy — see `Caddyfile`
- DB schema: `backend/src/db/schema.sql` (auto-loaded into Postgres on first run)

## No test suite yet
