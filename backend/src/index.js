import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import { connectRedis } from "./db/redis.js";
import { ensureBucket } from "./db/s3.js";
import { ensureDemoUser } from "./seed.js";
import { registerWss } from "./wsHub.js";
import { authRouter } from "./routes/auth.js";
import { postsRouter } from "./routes/posts.js";
import { followsRouter } from "./routes/follows.js";
import { projectsRouter } from "./routes/projects.js";
import { usersRouter } from "./routes/users.js";
import { uploadsRouter } from "./routes/uploads.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/posts", postsRouter);
app.use("/api/follows", followsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/users", usersRouter);
app.use("/api/uploads", uploadsRouter);

// Last-resort JSON error handler — catches multer's own next(err) path
// (e.g. file-too-large) and anything ah() forwards, so a request failure
// is always a JSON response instead of a crash or an HTML error page.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const server = http.createServer(app);

// Minimal WebSocket layer for live notifications (likes, comments, new followers).
// Clients connect to /ws and get pushed events; wire this up to actual events
// (e.g. from the posts/follows routes) as those features grow.
const wss = new WebSocketServer({ server, path: "/ws" });
registerWss(wss);

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "connected" }));

  ws.on("message", (raw) => {
    // Placeholder echo — replace with real routing (auth the socket, join rooms, etc.)
    ws.send(raw);
  });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await connectRedis();
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
