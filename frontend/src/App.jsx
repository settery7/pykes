import { useEffect, useState } from "react";

const API = "/api";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [feed, setFeed] = useState([]);
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [postContent, setPostContent] = useState("");

  useEffect(() => {
    if (token) loadFeed();
  }, [token]);

  async function loadFeed() {
    const res = await fetch(`${API}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setFeed(await res.json());
  }

  async function register() {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem("token", data.token);
      setToken(data.token);
    } else {
      alert(data.error);
    }
  }

  async function createPost() {
    const res = await fetch(`${API}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: postContent }),
    });
    if (res.ok) {
      setPostContent("");
      loadFeed();
    }
  }

  if (!token) {
    return (
      <div style={{ maxWidth: 360, margin: "60px auto", fontFamily: "sans-serif" }}>
        <h1>Pykes</h1>
        <input
          placeholder="username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <br />
        <input
          placeholder="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <br />
        <input
          type="password"
          placeholder="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <br />
        <button onClick={register}>Sign up</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Pykes</h1>
      <textarea
        placeholder="What's happening?"
        value={postContent}
        onChange={(e) => setPostContent(e.target.value)}
        style={{ width: "100%", height: 80 }}
      />
      <br />
      <button onClick={createPost}>Post</button>

      <hr />

      {feed.map((post) => (
        <div key={post.id} style={{ borderBottom: "1px solid #ddd", padding: "8px 0" }}>
          <strong>{post.display_name || post.username}</strong>
          <p>{post.content}</p>
          <small>{new Date(post.created_at).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}
