import { BASE_URL } from "./setup.js";

/** A short, collision-resistant suffix for usernames/emails so repeated
 * runs against the same disposable dev DB never collide (same approach as
 * e2e/utils/helpers.js's uniqueSuffix). */
export function uniqueSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

export function makeUser(prefix = "test") {
  const suffix = uniqueSuffix();
  return {
    username: `${prefix}_${suffix}`,
    email: `${prefix}_${suffix}@test.local`,
    password: "TestPass123!",
  };
}

/** Thin fetch wrapper: returns { status, data } and always attempts to
 * parse JSON, since every route in this API responds with JSON (including
 * errors) — see backend/src/index.js's error handler. */
export async function apiRequest(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

/** Registers a brand-new user directly against the API and returns the
 * user, its issued token, and its id — for tests that need an authenticated
 * actor but aren't testing registration itself. */
export async function registerUser(prefix) {
  const user = makeUser(prefix);
  const { status, data } = await apiRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(user),
  });
  if (status !== 201) {
    throw new Error(`registerUser setup failed: ${status} ${JSON.stringify(data)}`);
  }
  return { user, token: data.token, id: data.user.id };
}

/** Creates a post as the given token's user — for tests (comments, edit
 * history, etc.) that need an existing post but aren't testing post
 * creation itself. */
export async function createPost(token, body) {
  const { status, data } = await apiRequest("/api/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (status !== 201) {
    throw new Error(`createPost setup failed: ${status} ${JSON.stringify(data)}`);
  }
  return data;
}

/** Creates a comment as the given token's user — for tests (edit history,
 * delete, etc.) that need an existing comment but aren't testing comment
 * creation itself. */
export async function createComment(token, postId, content) {
  const { status, data } = await apiRequest("/api/comments", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ postId, content }),
  });
  if (status !== 201) {
    throw new Error(`createComment setup failed: ${status} ${JSON.stringify(data)}`);
  }
  return data;
}
