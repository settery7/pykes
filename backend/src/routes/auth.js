import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { redisClient } from "../db/redis.js";

export const authRouter = Router();

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_S = 60;

// Per-IP, per-route limit — register/login have no user id to key on yet
// (that's the whole problem these two routes solve), so req.ip is the only
// signal available. Requires app.set("trust proxy", ...) upstream, or every
// request behind Caddy/Traefik would share one IP and rate-limit each other.
async function rateLimit(req, res, next) {
  const key = `authrate:${req.path}:${req.ip}`;
  const count = await redisClient.incr(key);
  if (count === 1) await redisClient.expire(key, RATE_LIMIT_WINDOW_S);
  if (count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Too many attempts — please wait a moment." });
  }
  next();
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

authRouter.post("/register", rateLimit, async (req, res) => {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "username, email, and password are required" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, display_name, created_at`,
      [username, email, passwordHash, displayName || username]
    );

    const user = result.rows[0];
    const token = signToken(user.id);

    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username or email already taken" });
    }
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

authRouter.post("/login", rateLimit, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken(user.id);
    delete user.password_hash;

    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});
