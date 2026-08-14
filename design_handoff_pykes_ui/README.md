# Handoff: Pykes Frontend UI/UX

## Overview
A full frontend design for Pykes — a self-hosted build-in-public platform. Covers auth, home feed, post composer (with photo attach), project pages with a signature pixel-art "garden" that grows on shipped/release posts, explore, following, and profile (with editable avatar/bio). Target codebase: **settery7/pykes** (React + Vite frontend, Node/Express + ws backend, Postgres + Redis).

## About the Design Files
The files in this bundle (`Pykes.dc.html`, `PostCard.dc.html`, `ProjectCard.dc.html`, `gardenRenderer.js`, `mockData.js`) are **design references built in a prototyping tool** — they render standalone in a browser and simulate the backend with mock data and a fake WebSocket. They are NOT production code to copy in. The task is to **recreate this design as real React components in the existing `frontend/src`**, wired to the real Express API and the real `/ws` WebSocket — reusing the project's existing patterns (Vite, plain fetch, JWT in `Authorization: Bearer`) rather than introducing new tooling.

## Fidelity
**High-fidelity.** Colors, spacing, type, and copy below are final — implement them as-is. Layout structure (sidebar widths, breakpoints, card padding) is also final. The one area to treat as reference-only is the garden's pixel art: the algorithm (deterministic, canvas-drawn, layered by growth stage) is final, but you're free to refine individual sprite shapes if you improve on them visually.

## Design tokens

Colors (all oklch, dark warm-neutral base):
- Background: `oklch(0.18 0.014 55)` (page), `oklch(0.2-0.22 0.014 55)` (panels/cards), `oklch(0.27 0.015 55)` (hover/elevated)
- Border: `oklch(0.33 0.016 55)`
- Text: `oklch(0.94 0.01 70)` (primary), `oklch(0.74 0.014 70)` (secondary), `oklch(0.54 0.014 70)` (tertiary/muted)
- Accent green (growth / primary CTA): `oklch(0.72 0.16 150)`
- Accent amber (release milestones): `oklch(0.76 0.15 70)`
- Danger (bug tag only): `oklch(0.64 0.13 25)`

Type: Inter (UI text, weights 400/500/600/700/800), JetBrains Mono (slug preview, small technical labels). Base UI text 13-15px, page titles 19-24px.

Radius: 8-10px on inputs/buttons, 12px on cards, 16px on the garden panel. Avatars are circles.

Breakpoint: single JS breakpoint at 760px width — below it, hide both sidebars and switch to a 5-item bottom tab bar + top bar with logo and avatar; above it, 3-column shell (sidebar / feed / right rail). Right rail additionally requires ≥1180px and only shows on Home/Explore.

## Screens

### 1. Auth (login / register)
Centered card, max-width 380px, on the page background. Logo mark: a 2x2 grid of 4 small colored squares (green / amber / dark-green / muted-grey) + "Pykes" wordmark, 18-22px bold. Tagline: "Post your progress. Watch your project grow." Card has a segmented Login/Sign up tab control, email/password fields (+username on Sign up), inline error text in danger color, a full-width green submit button, and a muted "Try the demo · novadev@pykes.dev / password" link.
- Maps to `POST /api/auth/login` and `POST /api/auth/register`. Store the returned JWT and send as `Authorization: Bearer <token>` on every subsequent request (see `backend/src/middleware/auth.js`). On 401, clear the token and return to this screen.

### 2. App shell
Left sidebar (desktop, 224px): logo, 5 nav items (Home, Explore, Projects, Following, Profile → own profile), a green "New post" CTA pinned above a "Log out" link. Right rail (296px, Home/Explore only): "Your gardens" (mini live garden previews of the user's own projects, click through), "Trending projects" (top-growth-stage projects not owned by the user), "Suggested creators" (not-yet-followed users with an inline Follow button).

### 3. Home feed
Title "Home". Skeleton loading state: three pulsing 120px placeholder blocks. Empty state: centered muted line nudging the user to follow people or post. Otherwise a vertical list of post cards (see Post card below), newest first, from the user + people they follow.

### 4. Post composer (modal)
Centered modal, max-width 480px, dark card. Project chip-select (pill buttons, "No project" + the user's own projects), post-type chip-select (update / idea / bug / shipped / release), a hint line that changes copy+color depending on whether the selected type grows the garden ("Shipped and Release posts grow your project's garden." in green vs a neutral note otherwise), an optional "+ Add photo" toggle that reveals a drop-target image well (removable), a content textarea, and a full-width Publish button (disabled until there's content).
- Maps to `POST /api/posts` with `{content, projectId, postType, mediaUrl}`. Per the backend, only `shipped`/`release` posts against a project increment `growth_stage` and broadcast `project_growth` over `/ws` — the UI hint text must stay accurate to that rule.

### 5. Post card (reused everywhere: feed, project timeline, profile)
Header row: circular avatar (initial-on-color-background if no photo), display name, @handle, optional "· Project name" link, timestamp right-aligned as a small uppercase post-type tag (colored per type, see below). Body: post content (preserve line breaks), optional attached photo (rounded, ~220px tall, full width), an optional green "Grew {project} toward stage {n}." note for shipped/release posts. Footer: a heart toggle with like count, and a comment-count readout (read-only — comments have a DB table but no route/UI yet per the repo's README, so don't build comment entry until that endpoint exists).
- Post-type visual treatment (no left-border accent stripes, no heavy badges):
  - **update**: plain card, muted grey tag text.
  - **idea**: dashed card border, muted violet-ish tag.
  - **bug**: plain card, danger-red tag only.
  - **shipped**: subtle green-tinted background + border, green tag.
  - **release**: subtle amber-tinted background + border, amber tag.
- Maps to `POST /api/posts/:id/like` on heart click (optimistic toggle).

### 6. Project page
Back-to-feed link. Header: project name (24px bold), small owner avatar+name+"started {time ago}", description. Owner sees a green "Post an update" button (opens composer pre-scoped to this project); everyone else sees a Follow/Following button for the owner.
**Garden panel** (centerpiece): a 160×160 canvas rendered at `image-rendering: pixelated` next to a stat block — stage label (Bare soil / Sprouting / Blooming / Growing wild / Small woods / Full garden), a 5-segment progress bar, "Stage N of 5 · grows when you post Shipped or Release updates", and post/shipped/follower counts.
Below: "Timeline" — the project's posts as post cards.
- Maps to `GET /api/projects/:ownerId/:slug`. `growth_stage` from the API is uncapped (increments forever); clamp to `min(growth_stage, 5)` for garden stage and the progress bar.

### 7. Pixel garden (the signature piece)
Deterministic, canvas-drawn (not an image), same project always renders the same layout. See `gardenRenderer.js` — port this algorithm directly:
- A seeded integer hash of the project id drives all placement (no external randomness), so the layout is stable across reloads.
- Layers are cumulative and stage-gated: sky+soil always; stage≥1 adds grass/sprouts; ≥2 adds flowers/small plants; ≥3 adds rocks/bushes; ≥4 adds a tree + small shed; ≥5 adds a fence, pond, and extra detail.
- All lower-stage layers render at full opacity/scale; only the **newest** layer (the one that just unlocked) animates in via `progress` (0→1 over ~900ms): alpha ramps 0.2→1 and each sprite scales in from 0.55→1 from its own center, plus a brief sparkle burst (small yellow/green pixels, alpha following a sine curve peaking mid-animation).
- Drawing is all `ctx.fillRect` blocks on a 20-cell grid with `imageSmoothingEnabled = false` — no bitmaps, no SVG.

### 8. Growth animation via WebSocket
On receiving a real `project_growth` event from `/ws` (shape: `{type:'project_growth', project:{id, slug, growth_stage}}` per `backend/src/wsHub.js`), update that project's `growth_stage` in state and kick off the same rAF-driven grow-in animation on its garden canvas (see `startGrowth`/`drawOne` in `Pykes.dc.html`'s logic — the prototype simulates this event client-side with a `setTimeout` after posting Shipped/Release; production should instead listen on the real socket). Also surface a short toast: "Your garden grew."

### 9. Project creation
Simple form: Name, live slug preview (`/{username}/{slugified-name}`, monospace, muted), Description, Create/Cancel. On success, navigate to the new project's page.
- Maps to `POST /api/projects` with `{name, description}` (backend derives the slug itself — don't send one).

### 10. Explore
"Projects" grid (project cards: mini garden thumbnail, name, owner, 2-line description clamp, stage label) + "Creators" list (avatar, name, handle, Follow/Following button).

### 11. Following
List of followed creators with an Unfollow button; empty state nudges to Explore.

### 12. Profile
Header: large avatar (editable photo drop-target on your own profile only; colored-initial circle on others), display name, handle, follower/following counts, bio. Your own profile shows an "Edit profile" button that swaps name+bio into inline text inputs with Save/Cancel (no separate route). Below: a "Projects" grid and a "Recent posts" list (same post card / project card components as elsewhere).

## Design tokens for post-type tags (as CSS/hex if you don't use oklch elsewhere)
Keep it to the 2 accent hues above plus the 1 functional danger red — don't introduce more brand colors for post types; differentiate via tag text, border style (dashed for idea), and background tint (shipped/release only).

## Assets
No external images. Avatars are a colored circle (deterministic hue per user — `oklch(0.5 0.09 {hue})`) with the first letter of the display name, unless the user has dropped a real photo (profile avatar, post photos) — those are plain `<img>`/background-image once you have real upload storage (MinIO is already in the stack per the README; wire `media_url` on posts and a new avatar_url update endpoint to it).

## State & data needed client-side
- Current user + JWT (persisted, e.g. localStorage), feed posts, the user's own + followed users' projects, follow graph, per-post like state, composer draft (project/type/content/photo), a single active WebSocket connection with reconnect-on-drop handling (backend requirement: "handle expired/invalid JWT gracefully" and "WebSocket disconnect" per the original brief — show a small reconnecting indicator rather than failing silently).

## Files in this bundle
- `Pykes.dc.html` — main app (all screens, state, and the WebSocket-simulation/growth-animation logic to port)
- `PostCard.dc.html`, `ProjectCard.dc.html` — reusable card markup/styles
- `gardenRenderer.js` — the garden drawing algorithm, framework-agnostic canvas code, portable as-is into a React `useEffect` + `<canvas>` ref
- `mockData.js` — shape reference only (mirrors the real `users`/`projects`/`posts`/`follows` tables) — do not ship this data, it's for the prototype only
- `image-slot.js` — prototype-only drag/drop image placeholder; replace with a real file-input + upload-to-MinIO flow in production
