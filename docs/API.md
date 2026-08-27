# API Reference

Base URL: `/api` (Caddy/Vite proxy both route this to the backend on `:4000`).

All request/response bodies are JSON unless noted. Authenticated routes require:

```
Authorization: Bearer <jwt>
```

Tokens are issued by `/auth/register` and `/auth/login`, expire after 7 days, and carry the
user id as `sub` (`req.userId` in route handlers — see `backend/src/middleware/auth.js`).

Errors are always `{ "error": "message" }` with a non-2xx status.

---

## Auth (`/api/auth`)

| Method | Path        | Auth | Body                                            | Notes |
|--------|-------------|------|--------------------------------------------------|-------|
| POST   | `/register` | –    | `username, email, password, displayName?`       | Returns `{ user, token }`, `user.email_verified: false`. Fires a verification email (via Resend) in the background — a Resend outage doesn't fail registration. 409 if username/email taken. |
| POST   | `/login`    | –    | `email, password`                                | Returns `{ user, token }`. 401 on bad credentials. |
| POST   | `/verify`   | –    | `token`                                          | Public — the link is opened from an email client, often logged out. Marks the account verified. 400 if the token is invalid/expired. |
| POST   | `/resend-verification` | ✓ | –                                          | Rate-limited to 3/hour per user. 400 if already verified. Returns 204. |
| POST   | `/forgot-password` | –    | `email`                                          | Always returns the identical `200 {message}` whether or not the email is registered, to avoid leaking account existence (mirrors `/login`'s identical-401 precedent). Sends a reset link (1-hour expiry) via Resend, fire-and-forget, only if it matched. Rate-limited to 5/hour per IP. |
| POST   | `/reset-password` | –    | `token, newPassword`                             | Public, token-based (mirrors `/verify`, no rate limit). Returns `{ user, token }` — logs the caller in immediately, since a locked-out user has no working credentials to retry with. 400 if the token is invalid/expired. Pre-existing sessions (JWTs issued before the reset) stay valid — there's no revocation store, an accepted limitation consistent with this project's current auth model. |

## Posts (`/api/posts`)

| Method | Path             | Auth | Body / Params | Notes |
|--------|------------------|------|----------------|-------|
| POST   | `/`              | ✓    | `content, projectId?, mediaUrl?, postType?` | `postType` ∈ `update, shipped, bug, idea, release` (default `update`). A `shipped`/`release` post against a project increments that project's `growth_stage` and broadcasts a `project_growth` WebSocket event. Invalidates the caller's feed cache. |
| GET    | `/feed`          | ✓    | –              | Posts from the caller and everyone they follow, newest first, max 50. Cached in Redis per-user for 30s (`feed:<userId>`). |
| GET    | `/user/:userId`  | ✓    | –              | A single user's posts, newest first, max 50. |
| POST   | `/:postId/like`  | ✓    | –              | Idempotent (`ON CONFLICT DO NOTHING`). Returns 204. |

## Projects (`/api/projects`)

| Method | Path                | Auth | Body / Params | Notes |
|--------|---------------------|------|----------------|-------|
| GET    | `/`                 | ✓    | –              | Explore feed — every project, most-grown first. |
| POST   | `/`                 | ✓    | `name, description?` | Slug is derived from `name`. 409 if the caller already has a project with that slug. |
| GET    | `/user/:userId`     | –    | –              | A user's projects, newest first. |
| GET    | `/:ownerId/:slug`   | ✓    | –              | Project detail plus its 50 most recent posts. 404 if not found. |

## Users (`/api/users`)

| Method | Path    | Auth | Body / Params | Notes |
|--------|---------|------|----------------|-------|
| GET    | `/`     | ✓    | –              | Explore / suggested creators (everyone except the caller). |
| PATCH  | `/me`   | ✓    | `displayName?, bio?, avatarUrl?` | Only provided fields are updated (`COALESCE`). |
| PATCH  | `/me/email` | ✓ | `newEmail, password` | Requires the current password (re-auth, since this is the classic account-takeover vector). Resets `email_verified` to false and sends a fresh verification link to the new address. Rate-limited to 5/hour per user. 401 on wrong password, 409 if the email is already in use. |
| GET    | `/:id`  | –    | –              | Public profile with `follower_count` / `following_count`. 404 if not found. |

## Follows (`/api/follows`)

| Method | Path           | Auth | Notes |
|--------|----------------|------|-------|
| GET    | `/following`   | ✓    | Users the caller follows. |
| POST   | `/:userId`     | ✓    | Follow a user. 400 if following self. Idempotent. Invalidates the caller's feed cache. |
| DELETE | `/:userId`     | ✓    | Unfollow. Invalidates the caller's feed cache. |

## Comments (`/api/comments`)

| Method | Path             | Auth | Body / Params | Notes |
|--------|------------------|------|----------------|-------|
| GET    | `/post/:postId`  | –    | –              | Oldest-first thread for a post. |
| POST   | `/`              | ✓    | `postId, content` | Max 1000 chars. Rate-limited to 10 comments/60s per user (429 when exceeded, via Redis `INCR`+`EXPIRE`). 404 if `postId` doesn't exist. |
| DELETE | `/:id`           | ✓    | –              | Author-only; returns 404 (not 403) for someone else's comment, to avoid leaking existence. Returns 204. |

## Uploads (`/api/uploads`)

| Method | Path | Auth | Body | Notes |
|--------|------|------|------|-------|
| POST   | `/`  | ✓    | `multipart/form-data`, field `file` | PNG/JPEG/WebP only, 5MB max (`multer` memory storage). Stored in MinIO under `uploads/<userId>/<uuid>.<ext>`. Returns `{ url }`. |

## Internal (`/api/internal`)

Service-to-service only — not called by the frontend. Guarded by an
`x-internal-secret` header (checked against `INTERNAL_SECRET`) instead of a
user JWT, since there's no logged-in user making the call.

| Method | Path                     | Auth               | Notes |
|--------|--------------------------|---------------------|-------|
| POST   | `/send-follower-digests` | `x-internal-secret` | Meant to be triggered on a schedule by an external tool (Make/Zapier's free "Schedule" trigger — see README). Emails everyone who gained a follower since their last digest, via Resend. Returns `{ sent, failed }`. Rate-limited to 1 call/60s globally as a safety net against a misconfigured scenario looping. |

## Misc

| Method | Path          | Auth | Notes |
|--------|---------------|------|-------|
| GET    | `/api/health` | –    | `{ status: "ok" }` liveness check. |
| WS     | `/ws`         | –    | On connect, sends `{ type: "connected" }`. Pushes `{ type: "project_growth", project }` when a project's growth stage advances (see `backend/src/wsHub.js`). Inbound messages are currently just echoed — no auth or routing yet. |

---

## Data model

See `backend/src/db/schema.sql` for the authoritative schema (`users`, `projects`, `posts`,
`likes`, `comments`, `follows`). It's loaded into Postgres automatically on first container
start.
