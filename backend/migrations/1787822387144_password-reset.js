// Separate from verification_token/verification_token_expires_at on
// purpose — sharing a column would let a pending email-verification token
// get silently clobbered by a password-reset request, or vice versa.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN IF EXISTS reset_token;
    ALTER TABLE users DROP COLUMN IF EXISTS reset_token_expires_at;
  `);
};
