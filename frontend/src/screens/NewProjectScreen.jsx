import { useState } from "react";
import { useApp } from "../AppContext.js";
import { api } from "../api.js";
import { slugify } from "../utils.js";

export default function NewProjectScreen() {
  const { session, goTo, refreshMyProjects } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    try {
      const project = await api.createProject(session.token, { name: name.trim(), description: description.trim() || null });
      await refreshMyProjects();
      goTo("project", { ownerId: project.owner_id, slug: project.slug });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="new-project-page">
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px 0" }}>New project</h1>
      <p className="page-sub">Every project starts as bare soil. Ship things to grow it.</p>

      <div className="field">
        <label>Name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="e.g. Tideline"
        />
      </div>
      <div className="slug-preview">{name.trim() ? `/${session.user.username}/${slugify(name)}` : ""}</div>

      <div className="field">
        <label>Description</label>
        <textarea className="input" style={{ height: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it?" />
      </div>

      {error && <p className="auth-error">{error}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={create}>Create project</button>
        <button type="button" className="btn btn-secondary" onClick={() => goTo("projects")}>Cancel</button>
      </div>
    </div>
  );
}
