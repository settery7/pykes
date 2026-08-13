import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

export const projectsRouter = Router();

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

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
projectsRouter.get("/user/:userId", async (req, res) => {
  const result = await pool.query(
    `SELECT id, owner_id, slug, name, description, growth_stage, created_at
     FROM projects WHERE owner_id = $1 ORDER BY created_at DESC`,
    [req.params.userId]
  );
  res.json(result.rows);
});

// Get a single project (by owner + slug) with its recent posts
projectsRouter.get("/:ownerId/:slug", async (req, res) => {
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
    `SELECT id, user_id, post_type, content, media_url, created_at
     FROM posts WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [project.id]
  );

  res.json({ ...project, posts: postsResult.rows });
});
