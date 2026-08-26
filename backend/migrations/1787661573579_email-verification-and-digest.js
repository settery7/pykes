// email_verified is informational only today (nothing gates on it — no
// password reset exists yet), populated by the verification link flow in
// auth.js. last_follower_digest_at tracks the cursor for the Make/Zapier-
// triggered follower digest in routes/internal.js: NULL means "never sent,
// use created_at as the lookback start" so a brand-new account isn't
// emailed about every follower it ever had on the very first run.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_follower_digest_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
    ALTER TABLE users DROP COLUMN IF EXISTS verification_token;
    ALTER TABLE users DROP COLUMN IF EXISTS verification_token_expires_at;
    ALTER TABLE users DROP COLUMN IF EXISTS last_follower_digest_at;
  `);
};
