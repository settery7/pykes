import "dotenv/config";
import express from "express";
import http from "http";
import jwt from "jsonwebtoken";
import multer from "multer";
import { fileURLToPath } from "url";
import { runner as runMigrations } from "node-pg-migrate";
import { WebSocketServer } from "ws";
import { pool } from "./db/pool.js";
import { connectRedis, redisClient } from "./db/redis.js";
import { ensureBucket } from "./db/s3.js";
import { ensureDemoUser } from "./seed.js";
import { registerWss, registerConnection, unregisterConnection, initPubSub, closePubSub } from "./wsHub.js";
import { authRouter } from "./routes/auth.js";
import { postsRouter } from "./routes/posts.js";
import { followsRouter } from "./routes/follows.js";
import { projectsRouter } from "./routes/projects.js";
import { usersRouter } from "./routes/users.js";
import { uploadsRouter } from "./routes/uploads.js";
import { commentsRouter } from "./routes/comments.js";

const app = express();
// Trust exactly one hop (Caddy in Compose, Traefik in k3s) so req.ip is the
// real client address, not the proxy's — the auth rate limiter keys on this.
app.set("trust proxy", 1);
// No CORS middleware: the frontend never makes a cross-origin request to
// this API. Caddy proxies /api same-origin in production, and Vite's dev
// server proxy (frontend/vite.config.js) does the same locally — so a
// permissive cors() would only add attack surface, not enable anything.
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/posts", postsRouter);
app.use("/api/follows", followsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/users", usersRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/comments", commentsRouter);

// Last-resort JSON error handler — catches multer's own next(err) path
// (e.g. file-too-large) and anything ah() forwards, so a request failure is
// always a JSON response instead of a crash or an HTML error page. Multer's
// own errors are safe, specific, user-facing text ("File too large"); any
// other error is an unexpected exception, so only a generic message goes to
// the client — the real detail is already in the console.error above it.
app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: "Internal server error" });
});

const server = http.createServer(app);

// WebSocket layer for live notifications (project growth, new followers).
// Clients connect to /ws?token=<jwt> — the handshake is rejected outright if
// the token is missing or invalid, and connections are indexed by userId so
// route handlers can target one user (wsHub.sendToUser) as well as broadcast.
const wss = new WebSocketServer({
  server,
  path: "/ws",
  verifyClient: (info, done) => {
    try {
      const token = new URL(info.req.url, "http://localhost").searchParams.get("token");
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      info.req.userId = payload.sub;
      done(true);
    } catch {
      done(false, 401, "Unauthorized");
    }
  },
});
registerWss(wss);

wss.on("connection", (ws, req) => {
  registerConnection(req.userId, ws);
  ws.send(JSON.stringify({ type: "connected" }));
  ws.on("close", () => unregisterConnection(req.userId, ws));
});

const PORT = process.env.PORT || 4000;
const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

async function start() {
  await connectRedis();
  await initPubSub();
  // Runs on every boot; migrations/ files are the source of truth for schema
  // changes going forward (schema.sql only bootstraps a brand-new Postgres
  // volume). Safe to run repeatedly, and safe across multiple replicas
  // booting at once — node-pg-migrate takes a Postgres advisory lock for
  // the duration of the run, so concurrent pods serialize instead of racing.
  await runMigrations({
    databaseUrl: process.env.DATABASE_URL,
    dir: migrationsDir,
    direction: "up",
    migrationsTable: "pgmigrations",
    log: (msg) => console.log(`[migrate] ${msg}`),
  });
  await ensureBucket();
  await ensureDemoUser();
  server.listen(PORT, () => {
    console.log(`Pykes backend listening on :${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

// Drain in-flight work instead of dying mid-request on a container stop /
// rolling k8s deploy. WS clients are closed *before* server.close() — a
// live WebSocket counts as an open connection, so server.close()'s callback
// would otherwise wait on clients that are never going to disconnect on
// their own.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);

  for (const client of wss.clients) client.close(1001, "Server shutting down");

  server.close(async () => {
    await closePubSub();
    await pool.end();
    if (redisClient.isOpen) await redisClient.quit();
    console.log("Shutdown complete");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
