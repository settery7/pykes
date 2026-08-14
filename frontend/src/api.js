const API = "/api";

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

export function connectGrowthSocket(onGrowth) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "project_growth") onGrowth(msg.project);
    } catch {
      // ignore non-JSON / unrelated frames
    }
  });

  return () => socket.close();
}
