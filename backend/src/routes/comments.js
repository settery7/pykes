import { Router } from "express";
import { pool } from "../db/pool.js";
import { redisClient } from "../db/redis.js";
import { requireAuth } from "../middleware/auth.js";
import { ah } from "../middleware/asyncHandler.js";

export const commentsRouter = Router();

const COMMENT_MAX_LEN = 1000;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_S = 60;

// GET /api/comments/post/:postId — public, oldest-first thread order
commentsRouter.get("/post/:postId", ah(async (req, res) => {
  const result = await pool.query(
    `SELECT c.id, c.content, c.created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_url
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC`,
    [req.params.postId]
  );
  res.json(result.rows);
}));

// POST /api/comments — create a comment (auth required)
commentsRouter.post("/", requireAuth, ah(async (req, res) => {
  const { postId, content } = req.body;

  if (!postId) return res.status(400).json({ error: "postId is required" });

  const trimmed = typeof content === "string" ? content.trim() : "";
  if (!trimmed) return res.status(400).json({ error: "content is required" });
  if (trimmed.length > COMMENT_MAX_LEN) {
    return res.status(400).json({ error: `Comment must be ${COMMENT_MAX_LEN} characters or fewer` });
  }

  // Per-user rate limit: RATE_LIMIT_MAX comments per RATE_LIMIT_WINDOW_S seconds
  const rateKey = `comment_rate:${req.userId}`;
  const rateCount = await redisClient.incr(rateKey);
  if (rateCount === 1) await redisClient.expire(rateKey, RATE_LIMIT_WINDOW_S);
  if (rateCount > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Too many comments — please wait a moment." });
  }

  // Verify the post exists (prevents orphaned comments + IDOR via bogus postId)
  const postCheck = await pool.query("SELECT id FROM posts WHERE id = $1", [postId]);
  if (!postCheck.rows[0]) return res.status(404).json({ error: "Post not found" });

  const result = await pool.query(
    `INSERT INTO comments (post_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, post_id, content, created_at`,
    [postId, req.userId, trimmed]
  );

  // Attach author info — INSERT can't JOIN, so one extra indexed lookup
  const authorRes = await pool.query(
    "SELECT id AS user_id, username, display_name, avatar_url FROM users WHERE id = $1",
    [req.userId]
  );

  res.status(201).json({ ...result.rows[0], ...authorRes.rows[0] });
}));

// DELETE /api/comments/:id — author-only; returns 404 to avoid leaking existence
commentsRouter.delete("/:id", requireAuth, ah(async (req, res) => {
  const result = await pool.query(
    "DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.id, req.userId]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: "Comment not found or not yours" });
  }

  res.status(204).end();
}));
