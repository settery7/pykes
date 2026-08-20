import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const backendDir = fileURLToPath(new URL("..", import.meta.url));

// Same localhost-hostname env used by `npm run dev` (see README's "Local dev
// without Docker" section) — tests run against Postgres/Redis/MinIO already
// started via `docker compose up -d postgres redis minio`, the same
// prerequisite e2e/playwright.config.js documents for the full stack.
config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)) });

const PORT = process.env.PORT || "4000";
export const BASE_URL = `http://localhost:${PORT}`;

let child;

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `Backend never became healthy at ${BASE_URL}/api/health within ${timeoutMs}ms ` +
      `(is \`docker compose up -d postgres redis minio\` running?). Last error: ${lastError}`
  );
}

// Clears leftover auth rate-limit keys from a previous test run so the
// rate-limit test below isn't at the mercy of when this suite last ran
// against the same dev Redis (see backend/src/routes/auth.js's rateLimit).
async function resetAuthRateLimits() {
  const { redisClient, connectRedis } = await import("../src/db/redis.js");
  await connectRedis();
  const keys = await redisClient.keys("authrate:*");
  if (keys.length) await redisClient.del(keys);
  await redisClient.quit();
}

// Boots the real backend as a child process, the same way
// e2e/playwright.config.js's webServer entry does for the full stack — so
// `npm test` alone is enough once the datastores are up.
export async function startServer() {
  await resetAuthRateLimits();

  child = spawn(process.execPath, ["src/index.js"], {
    cwd: backendDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => process.stderr.write(`[backend] ${chunk}`));

  await waitForHealth(30_000);
}

export async function stopServer() {
  if (!child) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await exited;
  child = null;
}
