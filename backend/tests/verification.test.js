import { before, after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, resetAuthRateLimits } from "./setup.js";
import { apiRequest, registerUser } from "./helpers.js";
import { pool } from "../src/db/pool.js";

before(startServer);
after(stopServer);
// This file registers several users across its own tests, same reasoning
// as posts.test.js/comments.test.js — reset between tests rather than let
// the volume trip the real per-IP register limiter this file isn't testing.
beforeEach(resetAuthRateLimits);

// The verification token is deliberately never returned by any API
// response (it only goes out via email) — reaching into the DB directly is
// the same pattern backend/tests/setup.js already uses to reset rate
// limits, just applied here to read a token for testing.
async function getVerificationToken(email) {
  const { rows } = await pool.query("SELECT verification_token FROM users WHERE email = $1", [email]);
  return rows[0]?.verification_token;
}

async function expireVerificationToken(email) {
  await pool.query("UPDATE users SET verification_token_expires_at = now() - interval '1 hour' WHERE email = $1", [email]);
}

async function getLastFollowerDigestAt(userId) {
  const { rows } = await pool.query("SELECT last_follower_digest_at FROM users WHERE id = $1", [userId]);
  return rows[0]?.last_follower_digest_at;
}

describe("POST /api/auth/register", () => {
  test("issues an unverified user with a verification token stored", async () => {
    const email = `regtoken_${Date.now()}@test.local`;
    const { status, data } = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: `regtoken_${Date.now()}`, email, password: "TestPass123!" }),
    });
    assert.equal(status, 201);
    assert.equal(data.user.email_verified, false);
    assert.equal(data.user.verification_token, undefined, "token should never be returned in the API response");

    const token = await getVerificationToken(email);
    assert.ok(token);
  });
});

describe("POST /api/auth/verify", () => {
  test("rejects a garbage token", async () => {
    const { status, data } = await apiRequest("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token: "not-a-real-token" }),
    });
    assert.equal(status, 400);
    assert.ok(data.error);
  });

  test("accepts a valid token and marks the account verified", async () => {
    const { user } = await registerUser("verifyok");
    const token = await getVerificationToken(user.email);

    const { status, data } = await apiRequest("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    assert.equal(status, 200);
    assert.equal(data.user.email_verified, true);

    const login = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    assert.equal(login.data.user.email_verified, true);
  });

  test("rejects an expired token", async () => {
    const { user } = await registerUser("verifyexpired");
    await expireVerificationToken(user.email);
    const token = await getVerificationToken(user.email);

    const { status } = await apiRequest("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    assert.equal(status, 400);
  });

  test("a token can't be reused after it's already verified an account", async () => {
    const { user } = await registerUser("verifyreuse");
    const token = await getVerificationToken(user.email);

    const first = await apiRequest("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) });
    assert.equal(first.status, 200);

    const second = await apiRequest("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) });
    assert.equal(second.status, 400);
  });
});

describe("POST /api/auth/resend-verification", () => {
  test("requires auth", async () => {
    const { status } = await apiRequest("/api/auth/resend-verification", { method: "POST" });
    assert.equal(status, 401);
  });

  test("rejects an already-verified account", async () => {
    const { user, token } = await registerUser("resendverified");
    const verifyToken = await getVerificationToken(user.email);
    await apiRequest("/api/auth/verify", { method: "POST", body: JSON.stringify({ token: verifyToken }) });

    const { status } = await apiRequest("/api/auth/resend-verification", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(status, 400);
  });

  test("issues a fresh token and invalidates the old one", async () => {
    const { user, token } = await registerUser("resendfresh");
    const originalToken = await getVerificationToken(user.email);

    const resend = await apiRequest("/api/auth/resend-verification", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resend.status, 204);

    const newToken = await getVerificationToken(user.email);
    assert.ok(newToken);
    assert.notEqual(newToken, originalToken);

    const oldStillWorks = await apiRequest("/api/auth/verify", { method: "POST", body: JSON.stringify({ token: originalToken }) });
    assert.equal(oldStillWorks.status, 400);

    const newWorks = await apiRequest("/api/auth/verify", { method: "POST", body: JSON.stringify({ token: newToken }) });
    assert.equal(newWorks.status, 200);
  });

  test("rate-limits repeated resend requests", async () => {
    const { token } = await registerUser("resendrate");
    let sawRateLimit = false;
    for (let i = 0; i < 5; i++) {
      const { status } = await apiRequest("/api/auth/resend-verification", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    assert.ok(sawRateLimit, "expected a 429 within 5 rapid resend attempts (limit is 3/hour)");
  });
});

describe("POST /api/internal/send-follower-digests", () => {
  test("rejects requests without the internal secret", async () => {
    const { status } = await apiRequest("/api/internal/send-follower-digests", { method: "POST" });
    assert.equal(status, 401);
  });

  test("rejects requests with the wrong secret", async () => {
    const { status } = await apiRequest("/api/internal/send-follower-digests", {
      method: "POST",
      headers: { "x-internal-secret": "wrong-secret" },
    });
    assert.equal(status, 401);
  });

  test("emails and advances the cursor only for users who gained a follower", async () => {
    const owner = await registerUser("digestowner");
    const follower = await registerUser("digestfollower");
    const bystander = await registerUser("digestbystander");

    await apiRequest(`/api/follows/${owner.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${follower.token}` },
    });

    assert.equal(await getLastFollowerDigestAt(owner.id), null);

    const { status, data } = await apiRequest("/api/internal/send-follower-digests", {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_SECRET },
    });
    assert.equal(status, 200);
    assert.ok(data.sent >= 1, `expected at least 1 sent, got ${JSON.stringify(data)}`);

    // The owner (who actually gained a follower) has an advanced cursor;
    // the bystander (who gained none) is untouched by this run.
    assert.ok(await getLastFollowerDigestAt(owner.id));
    assert.equal(await getLastFollowerDigestAt(bystander.id), null);
  });
});
