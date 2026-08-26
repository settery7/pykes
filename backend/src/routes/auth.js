import { Router } from "express";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { sendVerificationEmail } from "../email.js";
import { isValidEmail } from "../validation.js";

export const authRouter = Router();

const VERIFICATION_TOKEN_TTL_HOURS = 24;

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
