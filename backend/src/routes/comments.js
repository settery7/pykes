import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { ah } from "../middleware/asyncHandler.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const commentsRouter = Router();

const COMMENT_MAX_LEN = 1000;
const commentRateLimit = rateLimit({ keyPrefix: "commentrate", max: 10, windowS: 60, keyFn: (req) => req.userId });

// GET /api/comments/post/:postId — public, oldest-first thread order
commentsRouter.get("/post/:postId", ah(async (req, res) => {
  const result = await pool.query(
    `SELECT c.id, c.content, c.created_at, c.edited_at,
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
commentsRouter.post("/", requireAuth, commentRateLimit, ah(async (req, res) => {
  const { postId, content } = req.body;

  if (!postId) return res.status(400).json({ error: "postId is required" });

  const trimmed = typeof content === "string" ? content.trim() : "";
  if (!trimmed) return res.status(400).json({ error: "content is required" });
  if (trimmed.length > COMMENT_MAX_LEN) {
    return res.status(400).json({ error: `Comment must be ${COMMENT_MAX_LEN} characters or fewer` });
  }

  // Verify the post exists (prevents orphaned comments + IDOR via bogus postId)
  const postCheck = await pool.query("SELECT id FROM posts WHERE id = $1", [postId]);
  if (!postCheck.rows[0]) return res.status(404).json({ error: "Post not found" });

  const result = await pool.query(
    `INSERT INTO comments (post_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, post_id, content, created_at, edited_at`,
    [postId, req.userId, trimmed]
  );

  // Attach author info — INSERT can't JOIN, so one extra indexed lookup
  const authorRes = await pool.query(
    "SELECT id AS user_id, username, display_name, avatar_url FROM users WHERE id = $1",
    [req.userId]
  );

  res.status(201).json({ ...result.rows[0], ...authorRes.rows[0] });
}));

// PATCH /api/comments/:id — edit content, author-only. Snapshots the
// pre-edit content into comment_edits first; a no-change save is skipped.
commentsRouter.patch("/:id", requireAuth, ah(async (req, res) => {
  const trimmed = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!trimmed) return res.status(400).json({ error: "content is required" });
  if (trimmed.length > COMMENT_MAX_LEN) {
    return res.status(400).json({ error: `Comment must be ${COMMENT_MAX_LEN} characters or fewer` });
  }

  const existing = await pool.query(
    "SELECT content FROM comments WHERE id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );
  if (!existing.rows[0]) {
    return res.status(404).json({ error: "Comment not found or not yours" });
  }

  if (trimmed === existing.rows[0].content) {
    const unchanged = await pool.query(
      "SELECT id, post_id, content, created_at, edited_at FROM comments WHERE id = $1",
      [req.params.id]
    );
    return res.json(unchanged.rows[0]);
  }

  await pool.query(
    "INSERT INTO comment_edits (comment_id, content) VALUES ($1, $2)",
    [req.params.id, existing.rows[0].content]
  );

  const result = await pool.query(
    `UPDATE comments SET content = $1, edited_at = now() WHERE id = $2 AND user_id = $3
     RETURNING id, post_id, content, created_at, edited_at`,
    [trimmed, req.params.id, req.userId]
  );

  res.json(result.rows[0]);
}));

// GET /api/comments/:id/history — a comment's edit history, most recent first
commentsRouter.get("/:id/history", ah(async (req, res) => {
  const result = await pool.query(
    "SELECT id, content, edited_at FROM comment_edits WHERE comment_id = $1 ORDER BY edited_at DESC",
    [req.params.id]
  );
  res.json(result.rows);
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
