import { expect } from "@playwright/test";

/** A short, collision-resistant suffix for usernames/emails/content so
 * repeated runs against the same disposable dev DB never collide. */
export function uniqueSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

export function makeUser(prefix = "e2e") {
  const suffix = uniqueSuffix();
  return {
    username: `${prefix}_${suffix}`,
    email: `${prefix}_${suffix}@e2e.test`,
    password: "TestPass123!",
  };
}

function isConnectedFrame(frame) {
  try {
    return JSON.parse(frame.payload).type === "connected";
  } catch {
    return false;
  }
}

/** Sets up a listener for the app's `/ws` socket and waits for the
 * server's initial `{ type: "connected" }` frame, which only arrives
 * after the server has already indexed the connection by userId
 * (registerConnection runs before that frame is sent) — so once this
 * resolves, `wsHub.sendToUser`/`broadcast` are guaranteed to reach it.
 *
 * The `framereceived` listener is attached synchronously inside the
 * `page.on("websocket", ...)` callback — i.e. before any `await` — because
 * the "connected" frame arrives within milliseconds of the socket opening.
 * Waiting for `action()` to finish first (e.g. filling out the rest of the
 * auth form) before attaching the listener loses the race against that
 * frame far more often than not once the dev servers are warm, and Node's
 * EventEmitter doesn't replay missed events to late listeners. */
async function withSocketReady(page, action) {
  let wsHandle = null;
  let resolveFrame;
  const framePromise = new Promise((resolve) => {
    resolveFrame = resolve;
  });

  function onWebSocket(ws) {
    if (!ws.url().includes("/ws")) return;
    wsHandle = ws;
    ws.on("framereceived", (frame) => {
      if (isConnectedFrame(frame)) resolveFrame();
    });
  }

  page.on("websocket", onWebSocket);
  try {
    await action();
    await framePromise;
  } finally {
    page.off("websocket", onWebSocket);
  }
  return wsHandle;
}

/** Registers a brand-new user through the real Auth UI (Sign up tab) and
 * returns the live WebSocket handle once the server has acked the
 * connection, so callers can assert on targeted/broadcast WS events. */
export async function registerViaUI(page, user) {
  return withSocketReady(page, async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.locator("#auth-username").fill(user.username);
    await page.locator("#auth-email").fill(user.email);
    await page.locator("#auth-password").fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });
}

/** Logs in an existing user through the real Auth UI (Log in tab, the
 * default view) and waits for the WS connection to be acked. */
export async function loginViaUI(page, user) {
  return withSocketReady(page, async () => {
    await page.goto("/");
    await page.locator("#auth-email").fill(user.email);
    await page.locator("#auth-password").fill(user.password);
    // Scoped to the form — "Log in" also matches the (already-active) tab
    // button on this view, which is a strict-mode violation otherwise.
    await page.locator("form").getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });
}

export async function logoutViaUI(page) {
  await page.getByRole("button", { name: "Log out" }).click();
  // Not `getByRole("button", { name: "Log in" })` — that matches both the
  // "Log in" tab and the "Log in" submit button on the login view (strict
  // mode violation). The email field is unambiguous.
  await expect(page.locator("#auth-email")).toBeVisible();
}

/** Registers a user directly against the API (fast, no UI flakiness) for
 * incidental/secondary actors in a scenario — e.g. "some other logged-in
 * user who isn't involved in the thing being tested." Returns { user, token }. */
export async function registerViaApi(request, user) {
  const res = await request.post("/api/auth/register", { data: user });
  if (!res.ok()) {
    throw new Error(`API register failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

/** Hydrates a browser context with an already-issued session (from
 * registerViaApi) by writing localStorage directly and reloading, then
 * waits for the WS connection to be acked — same guarantee as
 * registerViaUI/loginViaUI, without re-driving the auth form. */
export async function hydrateSession(page, session) {
  await page.goto("/");
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
  }, session);
  return withSocketReady(page, async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  });
}

export async function goToNav(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

export async function openComposer(page) {
  await page.getByRole("button", { name: "New post", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "New post" })).toBeVisible();
}

/** Fills and publishes a post through the real Composer modal. `postType`
 * and `projectName` (when given) are selected via their chip buttons. */
export async function publishPost(page, { content, postType, projectName }) {
  await openComposer(page);
  const dialog = page.getByRole("dialog", { name: "New post" });
  await dialog.getByTestId("composer-content").fill(content);

  if (projectName) {
    await dialog.getByRole("group", { name: "Project" }).getByRole("button", { name: projectName, exact: true }).click();
  }
  if (postType) {
    await dialog.getByRole("group", { name: "Type" }).getByRole("button", { name: postType, exact: true }).click();
  }

  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

/** Creates a project through the real "New project" flow (sidebar -> New
 * post's project picker doesn't create projects, so this drives
 * NewProjectScreen directly via the Projects nav + its own affordance). */
export async function createProject(page, { name, description }) {
  await goToNav(page, "Projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.locator("input.input").first().fill(name);
  if (description) {
    await page.locator("textarea.input").fill(description);
  }
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

/** Finds a user by username in the Explore screen's creator list and
 * clicks their Follow/Following toggle button, waiting for the click's
 * request to resolve (button label flips). */
export async function toggleFollowInExplore(page, username, { expectFollowing }) {
  await goToNav(page, "Explore");
  const row = page.locator(".creator-row").filter({ hasText: `@${username}` });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: expectFollowing ? "Follow" : "Following", exact: true }).click();
  await expect(row.getByRole("button", { name: expectFollowing ? "Following" : "Follow", exact: true })).toBeVisible();
}

/** Locates a post-card by its (unique) content text, scoped so
 * like/comment actions target the right post among several. */
export function postCardByContent(page, content) {
  return page.locator("article.post-card").filter({ hasText: content });
}

/** Waits (briefly, deterministically) to see whether a toast appears at
 * all. Used for negative assertions ("user X should NOT see this toast")
 * — callers should first prove, via a WS frame or an equivalent causally
 * later signal, that the event that *would* trigger the toast has already
 * reached the page, so this window only has to cover React's own render. */
export async function toastAppeared(page, timeout = 1500) {
  try {
    await page.getByRole("status").waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

export function isFrameOfType(frame, type) {
  try {
    return JSON.parse(frame.payload).type === type;
  } catch {
    return false;
  }
}
