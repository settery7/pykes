import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import { connectRedis } from "./db/redis.js";
import { registerWss } from "./wsHub.js";
import { authRouter } from "./routes/auth.js";
import { postsRouter } from "./routes/posts.js";
import { followsRouter } from "./routes/follows.js";
import { projectsRouter } from "./routes/projects.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/posts", postsRouter);
app.use("/api/follows", followsRouter);
app.use("/api/projects", projectsRouter);

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
  server.listen(PORT, () => {
    console.log(`Pykes backend listening on :${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
