import bcrypt from "bcryptjs";
import { pool } from "./db/pool.js";

// The auth screen's design advertises a demo login — make it real rather
// than a dead link. Idempotent: safe to run on every boot.
export async function ensureDemoUser() {
  const passwordHash = await bcrypt.hash("password", 10);
  await pool.query(
    `INSERT INTO users (username, email, password_hash, display_name, bio)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO NOTHING`,
    ["novadev", "novadev@pykes.dev", passwordHash, "Nova Reyes", "Solo dev building small useful things in public."]
  );
}
