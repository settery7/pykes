import { Router } from "express";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { ah } from "../middleware/asyncHandler.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { isValidEmail } from "../validation.js";
import { sendVerificationEmail } from "../email.js";

export const usersRouter = Router();

const VERIFICATION_TOKEN_TTL_HOURS = 24;

// Keyed on the user, not the IP — this sends a real email to whatever
// address is given, so without a limit it'd double as a way to spam an
// arbitrary inbox with "Verify your Pykes email" messages.
const changeEmailRateLimit = rateLimit({
  keyPrefix: "changeemailrate",
  max: 5,
  windowS: 60 * 60,
  keyFn: (req) => req.userId,
});

// Explore / suggested creators — everyone except the caller
usersRouter.get("/", requireAuth, ah(async (req, res) => {
  const result = await pool.query(
    `SELECT id, username, display_name, bio, avatar_url
     FROM users WHERE id != $1 ORDER BY created_at DESC`,
    [req.userId]
  );
  res.json(result.rows);
}));

usersRouter.patch("/me", requireAuth, ah(async (req, res) => {
  const displayName = req.body.displayName ?? null;
  const bio = req.body.bio ?? null;
  const avatarUrl = req.body.avatarUrl ?? null;

  const result = await pool.query(
    `UPDATE users
     SET display_name = COALESCE($1, display_name),
         bio = COALESCE($2, bio),
         avatar_url = COALESCE($3, avatar_url)
     WHERE id = $4
     RETURNING id, username, email, display_name, bio, avatar_url, created_at`,
    [displayName, bio, avatarUrl, req.userId]
  );
  res.json(result.rows[0]);
}));

// Changing email requires the current password (this is the classic
// account-takeover vector — a stolen/left-open session shouldn't be able
// to silently redirect the account's email), and resets email_verified to
// false with a fresh token sent to the *new* address, since verifying the
// old address proves nothing about ownership of the new one.
usersRouter.patch("/me/email", requireAuth, changeEmailRateLimit, ah(async (req, res) => {
  const { newEmail, password } = req.body;
  if (!newEmail || !password) {
    return res.status(400).json({ error: "newEmail and password are required" });
  }
  if (!isValidEmail(newEmail)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }

  const current = await pool.query("SELECT email, password_hash FROM users WHERE id = $1", [req.userId]);
  const valid = await bcrypt.compare(password, current.rows[0].password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  if (newEmail === current.rows[0].email) {
    return res.status(400).json({ error: "That's already your current email" });
  }

  const verificationToken = randomUUID();
  const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  let result;
  try {
    result = await pool.query(
      `UPDATE users
       SET email = $1, email_verified = false, verification_token = $2, verification_token_expires_at = $3
       WHERE id = $4
       RETURNING id, username, email, display_name, bio, avatar_url, created_at, email_verified`,
      [newEmail, verificationToken, verificationExpiresAt, req.userId]
    );
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That email is already in use" });
    }
    throw err;
  }

  sendVerificationEmail(newEmail, verificationToken).catch((err) => console.error("[users] verification email failed:", err));
  res.json(result.rows[0]);
}));

// Public profile, with follower/following counts
usersRouter.get("/:id", ah(async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.bio, u.avatar_url, u.created_at,
            (SELECT count(*)::int FROM follows WHERE following_id = u.id) AS follower_count,
            (SELECT count(*)::int FROM follows WHERE follower_id = u.id) AS following_count
     FROM users u WHERE u.id = $1`,
    [req.params.id]
  );
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
}));
