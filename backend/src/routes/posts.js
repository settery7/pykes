import { Router } from "express";
import { pool } from "../db/pool.js";
import { redisClient } from "../db/redis.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcast } from "../wsHub.js";
import { ah } from "../middleware/asyncHandler.js";

export const postsRouter = Router();

// Create a post
postsRouter.post("/", requireAuth, ah(async (req, res) => {
  const { content, mediaUrl, projectId, postType } = req.body;

  if (!content) {
    return res.status(400).json({ error: "content is required" });
  }

  const type = postType || "update";
  const validTypes = ["update", "shipped", "bug", "idea", "release"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `postType must be one of: ${validTypes.join(", ")}` });
  }

  const result = await pool.query(
    `INSERT INTO posts (user_id, project_id, post_type, content, media_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, project_id, post_type, content, media_url, created_at`,
    [req.userId, projectId || null, type, content, mediaUrl || null]
  );

  // "shipped" and "release" posts are the ones that visibly grow a project's
  // pixel-garden state — everything else (update/bug/idea) doesn't advance it.
  if (projectId && (type === "shipped" || type === "release")) {
    const growthResult = await pool.query(
      `UPDATE projects SET growth_stage = growth_stage + 1
       WHERE id = $1 AND owner_id = $2
       RETURNING id, slug, growth_stage`,
      [projectId, req.userId]
    );
    if (growthResult.rows[0]) {
      broadcast({ type: "project_growth", project: growthResult.rows[0] });
    }
  }

  // Invalidate the follower feed caches lazily — simplest approach for v1.
  // (A fan-out-on-write worker is the next upgrade once this gets real traffic.)
  await redisClient.del(`feed:${req.userId}`);

  res.status(201).json(result.rows[0]);
}));

// Home feed: posts from people you follow, plus your own, newest first
postsRouter.get("/feed", requireAuth, ah(async (req, res) => {
  const cacheKey = `feed:${req.userId}`;
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  const result = await pool.query(
    `SELECT p.id, p.content, p.media_url, p.project_id, p.post_type, p.created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_url,
            pr.name AS project_name, pr.slug AS project_slug, pr.owner_id AS project_owner_id,
            pr.growth_stage AS project_growth_stage,
            (SELECT count(*) FROM likes WHERE post_id = p.id) AS like_count,
            (SELECT count(*) FROM comments WHERE post_id = p.id) AS comment_count,
            EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $1) AS liked_by_me
     FROM posts p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN projects pr ON pr.id = p.project_id
     WHERE p.user_id = $1
        OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
     ORDER BY p.created_at DESC
     LIMIT 50`,
    [req.userId]
  );

  await redisClient.set(cacheKey, JSON.stringify(result.rows), { EX: 30 });
  res.json(result.rows);
}));

// A user's posts, for their profile page
postsRouter.get("/user/:userId", requireAuth, ah(async (req, res) => {
  const result = await pool.query(
    `SELECT p.id, p.content, p.media_url, p.project_id, p.post_type, p.created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_url,
            pr.name AS project_name, pr.slug AS project_slug, pr.owner_id AS project_owner_id,
            pr.growth_stage AS project_growth_stage,
            (SELECT count(*) FROM likes WHERE post_id = p.id) AS like_count,
            (SELECT count(*) FROM comments WHERE post_id = p.id) AS comment_count,
            EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $2) AS liked_by_me
     FROM posts p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN projects pr ON pr.id = p.project_id
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC
     LIMIT 50`,
    [req.params.userId, req.userId]
  );
  res.json(result.rows);
}));

// Like a post
postsRouter.post("/:postId/like", requireAuth, ah(async (req, res) => {
  await pool.query(
    `INSERT INTO likes (user_id, post_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [req.userId, req.params.postId]
  );
  res.status(204).end();
}));
