import { redisClient } from "../db/redis.js";

// This app runs on free-tier hosting with a shared Redis request budget —
// these limits exist to keep one account or IP from exhausting it, not
// because normal use comes anywhere near them. Say so in the response
// rather than a bare "too many requests" — a real user hitting this
// deserves to know it isn't arbitrary.
const REASON =
  "This site runs on free hosting with a shared request budget, so accounts " +
  "are limited to keep it available for everyone — try again in a minute.";

// Redis INCR+EXPIRE fixed-window limiter. `keyFn` extracts whatever
// identifies the caller (req.userId once requireAuth has run, req.ip
// pre-auth); `keyPrefix` keeps different limiters' Redis keys apart.
export function rateLimit({ keyPrefix, max, windowS, keyFn }) {
  return async function (req, res, next) {
    const key = `${keyPrefix}:${keyFn(req)}`;
    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, windowS);
    if (count > max) {
      return res.status(429).json({ error: REASON });
    }
    next();
  };
}
