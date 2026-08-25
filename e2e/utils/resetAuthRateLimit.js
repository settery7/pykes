import { createClient } from "redis";

// The register/login rate limiter (backend/src/routes/auth.js) is keyed
// per-IP, not per-user — unlike the comment/post/like limiters, a fresh
// test user each test doesn't sidestep it, since every registerViaUI/
// registerViaApi call still shares the same budget (10/60s from this
// machine's IP). A handful of tests never brushed it; a full suite run
// now registers enough users to hit it mid-run. Mirrors the identical fix
// already used by backend/tests/setup.js's resetAuthRateLimits, just
// reachable from the e2e side, which has no server process of its own to
// reset it from.
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export async function resetAuthRateLimit() {
  const client = createClient({ url: REDIS_URL });
  try {
    await client.connect();
    const keys = await client.keys("authrate:*");
    if (keys.length) await client.del(keys);
  } finally {
    await client.quit();
  }
}
