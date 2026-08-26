import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireInternalSecret } from "../middleware/internalAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ah } from "../middleware/asyncHandler.js";
import { sendFollowerDigest } from "../email.js";

export const internalRouter = Router();

// Global cooldown, not per-user/per-IP — this endpoint is meant to be
// called by one scheduled Make/Zapier scenario, not a normal client. The
// cooldown just protects against a misconfigured scenario looping and
// burning through Resend's free-tier daily cap.
const digestRateLimit = rateLimit({
  keyPrefix: "followerdigestrate",
  max: 1,
  windowS: 60,
  keyFn: () => "global",
});

// Triggered externally on a schedule (Make/Zapier's free "Schedule" ->
// webhook, since Render's free tier sleeps and has no built-in cron) —
// see README for the scenario setup. Emails everyone who gained at least
// one follower since their last digest (or since they joined, for a
// first-ever run), then advances their cursor so the same follow is never
// reported twice.
internalRouter.post("/send-follower-digests", requireInternalSecret, digestRateLimit, ah(async (req, res) => {
  const result = await pool.query(`
    SELECT u.id, u.email, u.display_name,
           count(f.follower_id)::int AS new_follower_count
    FROM users u
    JOIN follows f ON f.following_id = u.id
      AND f.created_at > COALESCE(u.last_follower_digest_at, u.created_at)
    GROUP BY u.id
    HAVING count(f.follower_id) > 0
  `);

  let sent = 0;
  let failed = 0;

  for (const row of result.rows) {
    try {
      await sendFollowerDigest(row.email, {
        displayName: row.display_name,
        newFollowerCount: row.new_follower_count,
      });
      await pool.query("UPDATE users SET last_follower_digest_at = now() WHERE id = $1", [row.id]);
      sent++;
    } catch (err) {
      console.error(`[internal] follower digest failed for user ${row.id}:`, err);
      failed++;
    }
  }

  res.json({ sent, failed });
}));
