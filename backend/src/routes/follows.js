import { Router } from "express";
import { pool } from "../db/pool.js";
import { redisClient } from "../db/redis.js";
import { requireAuth } from "../middleware/auth.js";
import { ah } from "../middleware/asyncHandler.js";
import { sendToUser } from "../wsHub.js";

export const followsRouter = Router();

const FEED_MAX = 50;

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

  const inserted = await pool.query(
    `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING follower_id`,
    [req.userId, req.params.userId]
  );

  // Only a genuinely new follow needs a backfill + notification — a repeat
  // click that hits ON CONFLICT DO NOTHING shouldn't re-fire either.
  if (inserted.rows[0]) {
    const recentPosts = await pool.query(
      `SELECT id, created_at FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.params.userId, FEED_MAX]
    );
    if (recentPosts.rows.length) {
      const key = `feedline:${req.userId}`;
      const multi = redisClient.multi();
      for (const row of recentPosts.rows) {
        multi.zAdd(key, { score: new Date(row.created_at).getTime(), value: row.id });
      }
      multi.zRemRangeByRank(key, 0, -(FEED_MAX + 1));
      await multi.exec();
    }

    const followerInfo = await pool.query(
      "SELECT id, username, display_name, avatar_url FROM users WHERE id = $1",
      [req.userId]
    );
    await sendToUser(req.params.userId, { type: "new_follower", follower: followerInfo.rows[0] });
  }

  res.status(204).end();
}));

followsRouter.delete("/:userId", requireAuth, ah(async (req, res) => {
  await pool.query(
    `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
    [req.userId, req.params.userId]
  );

  // Purge the unfollowed user's posts from the feed line. Bounded to their
  // most recent FEED_MAX posts is enough — the feed line only ever holds
  // that many entries per user anyway, so nothing older could be in it.
  const recentPosts = await pool.query(
    `SELECT id FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [req.params.userId, FEED_MAX]
  );
  if (recentPosts.rows.length) {
    await redisClient.zRem(`feedline:${req.userId}`, recentPosts.rows.map((r) => r.id));
  }

  res.status(204).end();
}));
