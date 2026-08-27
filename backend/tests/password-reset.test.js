import { before, after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, resetAuthRateLimits } from "./setup.js";
import { apiRequest, registerUser } from "./helpers.js";
import { pool } from "../src/db/pool.js";

before(startServer);
after(stopServer);
beforeEach(resetAuthRateLimits);

async function getResetToken(email) {
  const { rows } = await pool.query("SELECT reset_token FROM users WHERE email = $1", [email]);
  return rows[0]?.reset_token;
}

async function expireResetToken(email) {
  await pool.query("UPDATE users SET reset_token_expires_at = now() - interval '1 hour' WHERE email = $1", [email]);
}

describe("POST /api/auth/forgot-password", () => {
  test("requires an email", async () => {
    const { status } = await apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({}) });
    assert.equal(status, 400);
  });

  test("returns the identical response for a registered and an unregistered email", async () => {
    const { user } = await registerUser("forgotexists");

    const exists = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: user.email }),
    });
    const doesNotExist = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: `nobody_${Date.now()}@test.local` }),
    });

    assert.equal(exists.status, 200);
    assert.equal(doesNotExist.status, 200);
    assert.deepEqual(exists.data, doesNotExist.data);
  });

  test("stores a reset token only for a matching account", async () => {
    const { user } = await registerUser("forgottoken");
    await apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: user.email }) });

    const token = await getResetToken(user.email);
    assert.ok(token);
  });

  test("rate-limits repeated requests", async () => {
    let sawRateLimit = false;
    for (let i = 0; i < 7; i++) {
      const { status } = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: `rate_${i}_${Date.now()}@test.local` }),
      });
      if (status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    assert.ok(sawRateLimit, "expected a 429 within 7 rapid forgot-password attempts (limit is 5/hour)");
  });
});

describe("POST /api/auth/reset-password", () => {
  test("rejects a garbage token", async () => {
    const { status, data } = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: "not-a-real-token", newPassword: "NewPass123!" }),
    });
    assert.equal(status, 400);
    assert.ok(data.error);
  });

  test("rejects an expired token", async () => {
    const { user } = await registerUser("resetexpired");
    await apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: user.email }) });
    await expireResetToken(user.email);
    const token = await getResetToken(user.email);

    const { status } = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword: "NewPass123!" }),
    });
    assert.equal(status, 400);
  });

  test("accepts a valid token, logs the user in, and the new password works while the old one doesn't", async () => {
    const { user } = await registerUser("resetok");
    await apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: user.email }) });
    const token = await getResetToken(user.email);

    const reset = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword: "NewPass123!" }),
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.data.user.email, user.email);
    assert.ok(reset.data.token);

    const newLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: user.email, password: "NewPass123!" }),
    });
    assert.equal(newLogin.status, 200);

    const oldLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    assert.equal(oldLogin.status, 401);
  });

  test("a reset token can't be reused after a successful reset", async () => {
    const { user } = await registerUser("resetreuse");
    await apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: user.email }) });
    const token = await getResetToken(user.email);

    const first = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword: "FirstPass123!" }),
    });
    assert.equal(first.status, 200);

    const second = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword: "SecondPass123!" }),
    });
    assert.equal(second.status, 400);
  });
});
