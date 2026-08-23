// Same-origin by default (relative path) — true for local dev (Vite's proxy)
// and the self-hosted Compose/Caddy setup. Set VITE_API_URL at build time
// when the frontend and backend are deployed to different origins/domains
// (e.g. Cloudflare Pages + Render), so this points at the real backend URL.
const API_BASE = import.meta.env.VITE_API_URL || "";
const API = `${API_BASE}/api`;

async function request(path, { token, ...options } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  register: (body) => request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),

  getFeed: (token) => request("/posts/feed", { token }),
  getUserPosts: (token, userId) => request(`/posts/user/${userId}`, { token }),
  createPost: (token, body) => request("/posts", { method: "POST", token, body: JSON.stringify(body) }),
  likePost: (token, postId) => request(`/posts/${postId}/like`, { method: "POST", token }),

  exploreProjects: (token) => request("/projects", { token }),
  getUserProjects: (token, userId) => request(`/projects/user/${userId}`, { token }),
  getProject: (token, ownerId, slug) => request(`/projects/${ownerId}/${slug}`, { token }),
  createProject: (token, body) => request("/projects", { method: "POST", token, body: JSON.stringify(body) }),

  getUser: (token, id) => request(`/users/${id}`, { token }),
  exploreUsers: (token) => request("/users", { token }),
  updateMe: (token, body) => request("/users/me", { method: "PATCH", token, body: JSON.stringify(body) }),

  getFollowing: (token) => request("/follows/following", { token }),
  follow: (token, userId) => request(`/follows/${userId}`, { method: "POST", token }),
  unfollow: (token, userId) => request(`/follows/${userId}`, { method: "DELETE", token }),

  getComments: (postId) => request(`/comments/post/${postId}`),
  createComment: (token, body) => request("/comments", { method: "POST", token, body: JSON.stringify(body) }),
  deleteComment: (token, commentId) => request(`/comments/${commentId}`, { method: "DELETE", token }),

  async uploadImage(token, file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Upload failed: ${res.status}`);
    return data.url;
  },
};

// Reconnects automatically (2s delay) if the socket drops for any reason —
// a page reload racing the initial connection, a network blip, or Render's
// free tier putting the backend to sleep after inactivity. Without this,
// a dropped connection stayed dropped until the user manually refreshed,
// silently killing live notifications until then.
export function connectSocket(token, onMessage) {
  const wsBase = API_BASE
    ? API_BASE.replace(/^http/, "ws")
    : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;

  let socket;
  let reconnectTimer;
  let closedByCaller = false;

  function connect() {
    socket = new WebSocket(`${wsBase}/ws?token=${encodeURIComponent(token)}`);

    socket.addEventListener("message", (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        // ignore non-JSON frames
      }
    });

    socket.addEventListener("close", () => {
      if (closedByCaller) return;
      reconnectTimer = setTimeout(connect, 2000);
    });
  }

  connect();

  return () => {
    closedByCaller = true;
    clearTimeout(reconnectTimer);
    socket.close();
  };
}
