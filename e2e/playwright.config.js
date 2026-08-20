import { defineConfig, devices } from "@playwright/test";

// This app has real per-user rate limits (10 comments/60s), so tests run
// serially in a single worker rather than hammering the dev backend in
// parallel.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:5173",
    // Recording is intentionally always-on (not "on-first-retry") — these
    // runs are meant to be reviewed, not just reduced to a pass/fail count.
    trace: "on",
    video: "on",
    screenshot: "on",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Brings up the whole stack so `npx playwright test` alone is enough,
  // against the already-running Postgres/Redis/MinIO containers.
  // `reuseExistingServer: true` so re-running locally during iteration
  // doesn't fight over ports 4000/5173.
  webServer: [
    {
      command: "npm run dev",
      cwd: "../backend",
      url: "http://localhost:4000/api/health",
      reuseExistingServer: true,
      // The backend connects to Postgres/Redis/MinIO (and ensures the S3
      // bucket exists) on boot, so give it real breathing room.
      timeout: 30_000,
    },
    {
      command: "npm run dev",
      cwd: "../frontend",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
