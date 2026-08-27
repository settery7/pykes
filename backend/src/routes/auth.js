import { Router } from "express";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedNotice } from "../email.js";
import { isValidEmail } from "../validation.js";

export const authRouter = Router();

const VERIFICATION_TOKEN_TTL_HOURS = 24;
const PASSWORD_RESET_TOKEN_TTL_HOURS = 1;

// Per-IP, per-route limit — register/login have no user id to key on yet
// (that's the whole problem these two routes solve), so req.ip is the only
// signal available. Requires app.set("trust proxy", ...) upstream, or every
// request behind Caddy/Traefik would share one IP and rate-limit each other.
const authRateLimit = rateLimit({
  keyPrefix: "authrate",
  max: 10,
  windowS: 60,
  keyFn: (req) => `${req.path}:${req.ip}`,
});

// Separate from authRateLimit — this is post-login (keyed on the user, not
// the IP), guarding against someone hammering "resend" into flooding their
// own inbox or burning through Resend's free-tier daily cap.
const resendVerificationRateLimit = rateLimit({
  keyPrefix: "resendverifyrate",
  max: 3,
  windowS: 60 * 60,
  keyFn: (req) => req.userId,
});

// IP-keyed like authRateLimit (no session exists pre-login), but its own
// keyPrefix so a burst of forgot-password requests doesn't also throttle
// unrelated login/register attempts from the same IP. Stricter than
// authRateLimit's 10/60s since every hit here costs a real Resend send.
const forgotPasswordRateLimit = rateLimit({
  keyPrefix: "forgotpwrate",
  max: 5,
  windowS: 60 * 60,
  keyFn: (req) => req.ip,
});

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

authRouter.post("/register", authRateLimit, async (req, res) => {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "username, email, and password are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = randomUUID();
    const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name, verification_token, verification_token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, display_name, created_at, email_verified`,
      [username, email, passwordHash, displayName || username, verificationToken, verificationExpiresAt]
    );

    const user = result.rows[0];
    const token = signToken(user.id);

    // Registration succeeds regardless of whether the email actually goes
    // out — verification is informational only right now (nothing is
    // gated on it), so a Resend outage shouldn't block signup.
    sendVerificationEmail(email, verificationToken).catch((err) => console.error("[auth] verification email failed:", err));

    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username or email already taken" });
    }
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

authRouter.post("/login", authRateLimit, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken(user.id);
    delete user.password_hash;
    delete user.verification_token;
    delete user.verification_token_expires_at;

    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Public — no JWT. The link is opened from an email client, often in a
// browser session where the user isn't logged in at all (a different
// device, a private window, etc.), so the token itself is what proves
// ownership here, not a bearer token.
authRouter.post("/verify", async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: "token is required" });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET email_verified = true, verification_token = NULL, verification_token_expires_at = NULL
       WHERE verification_token = $1 AND verification_token_expires_at > now()
       RETURNING id, username, email, display_name, created_at, email_verified`,
      [token]
    );

    if (!result.rows[0]) {
      return res.status(400).json({ error: "This verification link is invalid or has expired" });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Verification failed" });
  }
});

authRouter.post("/resend-verification", requireAuth, resendVerificationRateLimit, async (req, res) => {
  try {
    const verificationToken = randomUUID();
    const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);

    const result = await pool.query(
      `UPDATE users SET verification_token = $1, verification_token_expires_at = $2
       WHERE id = $3 AND email_verified = false
       RETURNING email`,
      [verificationToken, verificationExpiresAt, req.userId]
    );

    if (!result.rows[0]) {
      return res.status(400).json({ error: "Your email is already verified" });
    }

    await sendVerificationEmail(result.rows[0].email, verificationToken);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to resend verification email" });
  }
});

// Public. Deliberately returns the identical response whether or not the
// email is registered — /login already sets this precedent (same 401
// whether the account doesn't exist or the password is wrong). The email
// send is fire-and-forget (not awaited), mirroring /register rather than
// /resend-verification: awaiting it only on the match branch would make
// response latency itself an account-enumeration oracle.
authRouter.post("/forgot-password", forgotPasswordRateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  try {
    const resetToken = randomUUID();
    const resetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000);

    const result = await pool.query(
      `UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE email = $3 RETURNING email`,
      [resetToken, resetExpiresAt, email]
    );

    if (result.rows[0]) {
      sendPasswordResetEmail(email, resetToken).catch((err) => console.error("[auth] password reset email failed:", err));
    }

    res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// Public, token-based — no rate limiter, same posture as /verify (a
// randomUUID() token has 122 bits of entropy, so guessing isn't a
// realistic threat a limiter would meaningfully defend against here).
// Unlike /verify or /resend-verification, the caller here by definition
// has no working credentials, so this logs them straight in on success
// instead of sending them to a bare login form to retype the password
// they just set. Note: pre-existing JWTs (up to 7 days old) stay valid
// after this — there's no session-revocation store — same informational-
// only scoping this project already accepted for email verification.
authRouter.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: "token and newPassword are required" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, display_name, created_at, email_verified FROM users
       WHERE reset_token = $1 AND reset_token_expires_at > now()`,
      [token]
    );
    const user = rows[0];
    if (!user) {
      return res.status(400).json({ error: "This reset link is invalid or has expired" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL WHERE id = $2`,
      [passwordHash, user.id]
    );

    sendPasswordChangedNotice(user.email).catch((err) => console.error("[auth] password-changed notice failed:", err));

    res.json({ user, token: signToken(user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});
