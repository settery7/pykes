import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

// Local Postgres needs no SSL; managed providers like Neon require it and
// put `sslmode=require` in the connection string they give you — detect
// that instead of hardcoding a provider-specific flag. `rejectUnauthorized:
// false` because Node doesn't ship these providers' intermediate CA by
// default; the connection itself is still encrypted either way.
export const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});
