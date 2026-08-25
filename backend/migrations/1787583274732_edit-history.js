// Each row is a snapshot of a post's/comment's content taken right before an
// edit overwrote it, so a row's edited_at is "when this version stopped
// being current" — the current content lives on posts/comments itself, not
// in these tables. posts.edited_at / comments.edited_at track only the most
// recent edit time, for a cheap "(edited)" badge without joining history.

export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS post_edits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS comment_edits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_post_edits_post_id ON post_edits(post_id);
    CREATE INDEX IF NOT EXISTS idx_comment_edits_comment_id ON comment_edits(comment_id);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS post_edits, comment_edits;
    ALTER TABLE posts DROP COLUMN IF EXISTS edited_at;
    ALTER TABLE comments DROP COLUMN IF EXISTS edited_at;
  `);
};
