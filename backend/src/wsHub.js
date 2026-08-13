// Tiny pub/sub so route handlers (posts.js, etc.) can push events to all
// connected WebSocket clients without importing the server/index.js directly.

let wssRef = null;

export function registerWss(wss) {
  wssRef = wss;
}

export function broadcast(event) {
  if (!wssRef) return;
  const payload = JSON.stringify(event);
  for (const client of wssRef.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  }
}
