import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { ah } from "../middleware/asyncHandler.js";

export const projectsRouter = Router();

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Explore — every project, most-grown first, with owner display info
projectsRouter.get("/", requireAuth, ah(async (req, res) => {
  const result = await pool.query(
    `SELECT p.id, p.owner_id, p.slug, p.name, p.description, p.growth_stage, p.created_at,
            u.username, u.display_name
     FROM projects p JOIN users u ON u.id = p.owner_id
     ORDER BY p.growth_stage DESC, p.created_at DESC`
  );
  res.json(result.rows);
}));

// Create a project
projectsRouter.post("/", requireAuth, async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const slug = slugify(name);

  try {
    const result = await pool.query(
      `INSERT INTO projects (owner_id, slug, name, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, owner_id, slug, name, description, growth_stage, created_at`,
      [req.userId, slug, name, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "You already have a project with that name" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// List a user's projects
projectsRouter.get("/user/:userId", ah(async (req, res) => {
  const result = await pool.query(
    `SELECT id, owner_id, slug, name, description, growth_stage, created_at
     FROM projects WHERE owner_id = $1 ORDER BY created_at DESC`,
    [req.params.userId]
  );
  res.json(result.rows);
}));

// Get a single project (by owner + slug) with its recent posts
projectsRouter.get("/:ownerId/:slug", requireAuth, ah(async (req, res) => {
  const { ownerId, slug } = req.params;

  const projectResult = await pool.query(
    `SELECT id, owner_id, slug, name, description, growth_stage, created_at
     FROM projects WHERE owner_id = $1 AND slug = $2`,
    [ownerId, slug]
  );

  const project = projectResult.rows[0];
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const postsResult = await pool.query(
    `SELECT p.id, p.user_id, p.post_type, p.content, p.media_url, p.created_at,
            u.username, u.display_name, u.avatar_url,
            (SELECT count(*)::int FROM likes WHERE post_id = p.id) AS like_count,
            (SELECT count(*)::int FROM comments WHERE post_id = p.id) AS comment_count,
            EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $2) AS liked_by_me
     FROM posts p
     JOIN users u ON u.id = p.user_id
     WHERE p.project_id = $1
     ORDER BY p.created_at DESC LIMIT 50`,
    [project.id, req.userId]
  );

  res.json({ ...project, posts: postsResult.rows });
}));
