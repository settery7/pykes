import { Router } from "express";
import { pool } from "../db/pool.js";
import { redisClient } from "../db/redis.js";
import { requireAuth } from "../middleware/auth.js";
import { ah } from "../middleware/asyncHandler.js";

export const followsRouter = Router();

// Users the caller follows, with display info (for the Following screen)
followsRouter.get("/following", requireAuth, ah(async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.bio, u.avatar_url
     FROM follows f JOIN users u ON u.id = f.following_id
     WHERE f.follower_id = $1
     ORDER BY f.created_at DESC`,
    [req.userId]
  );
  res.json(result.rows);
}));

followsRouter.post("/:userId", requireAuth, ah(async (req, res) => {
  if (req.userId === req.params.userId) {
    return res.status(400).json({ error: "Cannot follow yourself" });
  }

  await pool.query(
    `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [req.userId, req.params.userId]
  );

  await redisClient.del(`feed:${req.userId}`);
  res.status(204).end();
}));

followsRouter.delete("/:userId", requireAuth, ah(async (req, res) => {
  await pool.query(
    `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
    [req.userId, req.params.userId]
  );

  await redisClient.del(`feed:${req.userId}`);
  res.status(204).end();
}));
