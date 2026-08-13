import { Router } from "express";
import { pool } from "../db/pool.js";
import { redisClient } from "../db/redis.js";
import { requireAuth } from "../middleware/auth.js";

export const followsRouter = Router();

followsRouter.post("/:userId", requireAuth, async (req, res) => {
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
});

followsRouter.delete("/:userId", requireAuth, async (req, res) => {
  await pool.query(
    `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
    [req.userId, req.params.userId]
  );

  await redisClient.del(`feed:${req.userId}`);
  res.status(204).end();
});
