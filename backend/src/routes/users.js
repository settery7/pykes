import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { ah } from "../middleware/asyncHandler.js";

export const usersRouter = Router();

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
