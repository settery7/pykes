import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer } from "./setup.js";
import { apiRequest, makeUser, registerUser } from "./helpers.js";

before(startServer);
after(stopServer);

describe("GET /api/health", () => {
  test("reports ok", async () => {
    const { status, data } = await apiRequest("/api/health");
    assert.equal(status, 200);
    assert.equal(data.status, "ok");
  });
});

describe("POST /api/auth/register", () => {
  test("creates a user and returns a token", async () => {
    const user = makeUser("reg");
    const { status, data } = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(user),
    });
    assert.equal(status, 201);
    assert.equal(data.user.username, user.username);
    assert.equal(data.user.email, user.email);
    assert.equal(data.user.password_hash, undefined);
    assert.ok(data.token);
  });

  test("rejects a missing password", async () => {
    const { status, data } = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: "nopass", email: "nopass@test.local" }),
    });
    assert.equal(status, 400);
    assert.ok(data.error);
  });

  test("rejects a duplicate email", async () => {
    const user = makeUser("dup");
    await apiRequest("/api/auth/register", { method: "POST", body: JSON.stringify(user) });

    const { status, data } = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...user, username: `${user.username}_2` }),
    });
    assert.equal(status, 409);
    assert.ok(data.error);
  });
});

describe("POST /api/auth/login", () => {
  test("logs in with correct credentials", async () => {
    const user = makeUser("login");
    await apiRequest("/api/auth/register", { method: "POST", body: JSON.stringify(user) });

    const { status, data } = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    assert.equal(status, 200);
    assert.ok(data.token);
    assert.equal(data.user.email, user.email);
  });

  test("rejects a wrong password", async () => {
    const user = makeUser("badpw");
    await apiRequest("/api/auth/register", { method: "POST", body: JSON.stringify(user) });

    const { status, data } = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: user.email, password: "wrong-password" }),
    });
    assert.equal(status, 401);
    assert.ok(data.error);
  });

  test("rejects an unknown email", async () => {
    const { status, data } = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "nobody-here@test.local", password: "whatever" }),
    });
    assert.equal(status, 401);
    assert.ok(data.error);
  });
});

describe("requireAuth middleware", () => {
  test("rejects a request with no Authorization header", async () => {
    const { status } = await apiRequest("/api/posts/feed");
    assert.equal(status, 401);
  });

  test("rejects an invalid token", async () => {
    const { status } = await apiRequest("/api/posts/feed", {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    assert.equal(status, 401);
  });

  test("accepts a valid token", async () => {
    const { token } = await registerUser("authok");
    const { status, data } = await apiRequest("/api/posts/feed", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
  });
});

// Deliberately last: this exhausts the per-IP register quota for the rest
// of the rate-limit window, so every test above that needs a successful
// registration has to run — and does run — before this one.
describe("auth rate limiting", () => {
  // Self-exhausting rather than a fixed request count, so this doesn't care
  // how much of the per-minute quota earlier tests in this file already
  // used (see backend/src/routes/auth.js: RATE_LIMIT_MAX=10 per IP+path).
  test("rate-limits repeated register attempts from the same IP", async () => {
    let sawRateLimit = false;
    for (let i = 0; i < 15; i++) {
      const { status } = await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(makeUser("rl")),
      });
      if (status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    assert.ok(sawRateLimit, "expected a 429 within 15 rapid register attempts");
  });
});
