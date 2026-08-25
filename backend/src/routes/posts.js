import { Router } from "express";
import { pool } from "../db/pool.js";
import { redisClient } from "../db/redis.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcast, sendToUser } from "../wsHub.js";
import { ah } from "../middleware/asyncHandler.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const postsRouter = Router();

const FEED_MAX = 50;
const CONTENT_MAX_LEN = 5000;
// Looser than comments' 10/60s — liking/following is a quick tap, not
// typing, so a normal person scrolling and liking several posts in a row
// should never brush against this.
const postRateLimit = rateLimit({ keyPrefix: "postrate", max: 20, windowS: 60, keyFn: (req) => req.userId });
const likeRateLimit = rateLimit({ keyPrefix: "likerate", max: 30, windowS: 60, keyFn: (req) => req.userId });

const FEED_SELECT = `
  SELECT p.id, p.content, p.media_url, p.project_id, p.post_type, p.created_at, p.edited_at,
         u.id AS user_id, u.username, u.display_name, u.avatar_url,
         pr.name AS project_name, pr.slug AS project_slug, pr.owner_id AS project_owner_id,
         pr.growth_stage AS project_growth_stage,
         (SELECT count(*)::int FROM likes WHERE post_id = p.id) AS like_count,
         (SELECT count(*)::int FROM comments WHERE post_id = p.id) AS comment_count,
         EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $2) AS liked_by_me
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN projects pr ON pr.id = p.project_id
`;

// Push a newly-created post's id into the feed line (a capped, newest-first
// Redis sorted set) of the author and everyone who follows them. This is the
// "fan-out-on-write" half of the feed: work happens once here, at write time,
// so GET /feed can just read a pre-built list instead of re-joining follows
// on every request.
async function fanOutPost(post) {
  const followerRows = await pool.query(
    "SELECT follower_id FROM follows WHERE following_id = $1",
    [post.user_id]
  );
  const recipients = [post.user_id, ...followerRows.rows.map((r) => r.follower_id)];
  const score = new Date(post.created_at).getTime();

  const multi = redisClient.multi();
  for (const userId of recipients) {
    const key = `feedline:${userId}`;
    multi.zAdd(key, { score, value: post.id });
    multi.zRemRangeByRank(key, 0, -(FEED_MAX + 1));
  }
  await multi.exec();
}

// Create a post
postsRouter.post("/", requireAuth, postRateLimit, ah(async (req, res) => {
  const { content, mediaUrl, projectId, postType } = req.body;
  const trimmedContent = typeof content === "string" ? content.trim() : "";

  if (!trimmedContent && !mediaUrl) {
    return res.status(400).json({ error: "content or a photo is required" });
  }
  if (trimmedContent.length > CONTENT_MAX_LEN) {
    return res.status(400).json({ error: `content must be ${CONTENT_MAX_LEN} characters or fewer` });
  }

  const type = postType || "update";
  const validTypes = ["update", "shipped", "bug", "idea", "release"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `postType must be one of: ${validTypes.join(", ")}` });
  }

  const result = await pool.query(
    `INSERT INTO posts (user_id, project_id, post_type, content, media_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, project_id, post_type, content, media_url, created_at, edited_at`,
    [req.userId, projectId || null, type, trimmedContent, mediaUrl || null]
  );
  const post = result.rows[0];

  // "shipped" and "release" posts are the ones that visibly grow a project's
  // pixel-garden state — everything else (update/bug/idea) doesn't advance it.
  if (projectId && (type === "shipped" || type === "release")) {
    const growthResult = await pool.query(
      `UPDATE projects SET growth_stage = growth_stage + 1
       WHERE id = $1 AND owner_id = $2
       RETURNING id, owner_id, slug, growth_stage`,
      [projectId, req.userId]
    );
    if (growthResult.rows[0]) {
      // Broadcast (not sendToUser) — anyone currently viewing this project's
      // page should see it grow live, not just the owner. owner_id lets
      // clients tell "my garden grew" from "a garden I'm watching grew".
      await broadcast({ type: "project_growth", project: growthResult.rows[0] });
    }
  }

  await fanOutPost(post);

  res.status(201).json(post);
}));

// Home feed: posts from people you follow, plus your own, newest first.
// Reads the pre-built feed line; a user with no feed line yet (never fanned
// into, e.g. first login after this shipped) falls back to the original
// join-based query once and warms the feed line from its result.
postsRouter.get("/feed", requireAuth, ah(async (req, res) => {
  const key = `feedline:${req.userId}`;
  const size = await redisClient.zCard(key);

  if (size === 0) {
    const result = await pool.query(
      FEED_SELECT +
        `WHERE p.user_id = $1
            OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
         ORDER BY p.created_at DESC
         LIMIT ${FEED_MAX}`,
      [req.userId, req.userId]
    );

    if (result.rows.length) {
      const multi = redisClient.multi();
      for (const row of result.rows) {
        multi.zAdd(key, { score: new Date(row.created_at).getTime(), value: row.id });
      }
      await multi.exec();
    }

    return res.json(result.rows);
  }

  const ids = await redisClient.zRange(key, 0, FEED_MAX - 1, { REV: true });
  if (ids.length === 0) return res.json([]);

  const hydrated = await pool.query(
    FEED_SELECT + `WHERE p.id = ANY($1::uuid[])`,
    [ids, req.userId]
  );

  // ANY($1) doesn't preserve order, so re-sort to match the feed line's order.
  const byId = new Map(hydrated.rows.map((row) => [row.id, row]));
  res.json(ids.map((id) => byId.get(id)).filter(Boolean));
}));

// A user's posts, for their profile page
postsRouter.get("/user/:userId", requireAuth, ah(async (req, res) => {
  const result = await pool.query(
    FEED_SELECT + `WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT ${FEED_MAX}`,
    [req.params.userId, req.userId]
  );
  res.json(result.rows);
}));

// Like a post
postsRouter.post("/:postId/like", requireAuth, likeRateLimit, ah(async (req, res) => {
  const inserted = await pool.query(
    `INSERT INTO likes (user_id, post_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING post_id`,
    [req.userId, req.params.postId]
  );

  // Only a genuinely new like notifies — RETURNING is empty on a repeat
  // click (ON CONFLICT DO NOTHING), same guard used for follow notices.
  if (inserted.rows[0]) {
    const postRes = await pool.query("SELECT user_id FROM posts WHERE id = $1", [req.params.postId]);
    const authorId = postRes.rows[0]?.user_id;
    if (authorId && authorId !== req.userId) {
      const likerInfo = await pool.query(
        "SELECT id, username, display_name, avatar_url FROM users WHERE id = $1",
        [req.userId]
      );
      await sendToUser(authorId, { type: "post_liked", postId: req.params.postId, liker: likerInfo.rows[0] });
    }
  }

  res.status(204).end();
}));

// Unlike a post
postsRouter.delete("/:postId/like", requireAuth, ah(async (req, res) => {
  await pool.query(
    "DELETE FROM likes WHERE user_id = $1 AND post_id = $2",
    [req.userId, req.params.postId]
  );
  res.status(204).end();
}));

// Edit a post's caption (author-only). Deliberately content-only — project,
// type, and photo aren't editable here, since post_type can carry
// already-applied growth-stage side effects that shouldn't be re-triggered
// by an edit. The pre-edit content is snapshotted into post_edits first, so
// a no-change save (identical trimmed content) is skipped to avoid noise.
postsRouter.patch("/:id", requireAuth, ah(async (req, res) => {
  const trimmedContent = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (trimmedContent.length > CONTENT_MAX_LEN) {
    return res.status(400).json({ error: `content must be ${CONTENT_MAX_LEN} characters or fewer` });
  }

  const existing = await pool.query(
    "SELECT content, media_url FROM posts WHERE id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );
  if (!existing.rows[0]) {
    return res.status(404).json({ error: "Post not found or not yours" });
  }
  if (!trimmedContent && !existing.rows[0].media_url) {
    return res.status(400).json({ error: "content or a photo is required" });
  }

  if (trimmedContent === existing.rows[0].content) {
    const unchanged = await pool.query(
      `SELECT id, user_id, project_id, post_type, content, media_url, created_at, edited_at
       FROM posts WHERE id = $1`,
      [req.params.id]
    );
    return res.json(unchanged.rows[0]);
  }

  await pool.query(
    "INSERT INTO post_edits (post_id, content) VALUES ($1, $2)",
    [req.params.id, existing.rows[0].content]
  );

  const result = await pool.query(
    `UPDATE posts SET content = $1, edited_at = now() WHERE id = $2 AND user_id = $3
     RETURNING id, user_id, project_id, post_type, content, media_url, created_at, edited_at`,
    [trimmedContent, req.params.id, req.userId]
  );
  res.json(result.rows[0]);
}));

// A post's edit history — the content each edit overwrote, most recent first.
postsRouter.get("/:id/history", requireAuth, ah(async (req, res) => {
  const result = await pool.query(
    "SELECT id, content, edited_at FROM post_edits WHERE post_id = $1 ORDER BY edited_at DESC",
    [req.params.id]
  );
  res.json(result.rows);
}));

// Delete a post (author-only). Likes/comments cascade via FK; a stray id
// left behind in Redis feed lines is harmless — the feed hydration query
// inner-joins posts, so it just drops off silently on the next read.
postsRouter.delete("/:id", requireAuth, ah(async (req, res) => {
  const result = await pool.query(
    "DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.id, req.userId]
  );
  if (!result.rows[0]) {
    return res.status(404).json({ error: "Post not found or not yours" });
  }
  res.status(204).end();
}));
