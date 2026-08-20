// Pub/sub so route handlers (posts.js, etc.) can push events to connected
// WebSocket clients without importing the server/index.js directly — and so
// it still works once the backend runs as more than one replica. A user's
// socket lives on whichever pod they happened to connect to; the HTTP
// request that triggers an event (e.g. a follow) can land on a *different*
// pod. Publishing through Redis instead of writing to local sockets
// directly means every pod's own subscriber hears every event and delivers
// it only to the clients actually connected to that pod.
import { redisClient } from "./db/redis.js";

const BROADCAST_CHANNEL = "ws:broadcast";
const DIRECT_CHANNEL = "ws:direct";

let wssRef = null;
const connectionsByUser = new Map(); // userId -> Set<ws>
const subscriber = redisClient.duplicate(); // pub/sub requires a dedicated connection

subscriber.on("error", (err) => console.error("wsHub subscriber error:", err));

export async function initPubSub() {
  await subscriber.connect();
  await subscriber.subscribe(BROADCAST_CHANNEL, (payload) => {
    deliverToAllLocal(payload);
  });
  await subscriber.subscribe(DIRECT_CHANNEL, (message) => {
    const { userId, payload } = JSON.parse(message);
    deliverToUserLocal(userId, payload);
  });
}

export async function closePubSub() {
  if (subscriber.isOpen) await subscriber.quit();
}

export function registerWss(wss) {
  wssRef = wss;
}

export function registerConnection(userId, ws) {
  if (!connectionsByUser.has(userId)) connectionsByUser.set(userId, new Set());
  connectionsByUser.get(userId).add(ws);
}

export function unregisterConnection(userId, ws) {
  const sockets = connectionsByUser.get(userId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) connectionsByUser.delete(userId);
}

function deliverToAllLocal(payload) {
  if (!wssRef) return;
  for (const client of wssRef.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  }
}

function deliverToUserLocal(userId, payload) {
  const sockets = connectionsByUser.get(userId);
  if (!sockets) return;
  for (const client of sockets) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  }
}

export async function broadcast(event) {
  await redisClient.publish(BROADCAST_CHANNEL, JSON.stringify(event));
}

// Targeted push — e.g. a new-follower notice that only the followed user
// should see, as opposed to broadcast() which every connected client gets.
export async function sendToUser(userId, event) {
  await redisClient.publish(DIRECT_CHANNEL, JSON.stringify({ userId, payload: JSON.stringify(event) }));
}
