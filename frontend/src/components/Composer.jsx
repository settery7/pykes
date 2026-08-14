import { useRef, useState } from "react";
import { POST_TYPES } from "../utils.js";
import { api } from "../api.js";

export default function Composer({ session, projects, defaultProjectId, onClose, onPublish }) {
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [postType, setPostType] = useState(defaultProjectId ? "shipped" : "update");
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [showMediaWell, setShowMediaWell] = useState(false);
  const fileInputRef = useRef(null);

  const growsGarden = postType === "shipped" || postType === "release";

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaPreview(URL.createObjectURL(file));
    setUploading(true);
    setError("");
    try {
      const url = await api.uploadImage(session.token, file);
      setMediaUrl(url);
    } catch (err) {
      setError(err.message);
      setMediaPreview(null);
      setShowMediaWell(false);
    } finally {
      setUploading(false);
    }
  }

  function removeMedia() {
    setMediaUrl(null);
    setMediaPreview(null);
    setShowMediaWell(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function publish() {
    if (!content.trim() || uploading || publishing) return;
    setPublishing(true);
    setError("");
    try {
      await onPublish({ content: content.trim(), projectId: projectId || null, postType, mediaUrl });
    } catch (err) {
      setError(err.message);
      setPublishing(false);
    }
  }

  const publishDisabled = !content.trim() || uploading || publishing;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="title" id="composer-title">New post</div>
          <button type="button" className="btn-text" onClick={onClose}>Close</button>
        </div>

        <div className="field">
          <label id="composer-project-label">Project</label>
          <div className="chip-row" role="group" aria-labelledby="composer-project-label">
            <button type="button" className={`chip ${projectId === "" ? "is-active" : ""}`} aria-pressed={projectId === ""} onClick={() => setProjectId("")}>No project</button>
            {projects.map((p) => (
              <button type="button" key={p.id} className={`chip ${projectId === p.id ? "is-active" : ""}`} aria-pressed={projectId === p.id} onClick={() => setProjectId(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label id="composer-type-label">Type</label>
          <div className="chip-row" role="group" aria-labelledby="composer-type-label">
            {POST_TYPES.map((type) => (
              <button type="button" key={type} className={`chip ${postType === type ? "is-active" : ""}`} aria-pressed={postType === type} onClick={() => setPostType(type)}>
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className={`composer-hint ${growsGarden ? "grows" : "neutral"}`}>
          {growsGarden
            ? "Shipped and Release posts grow your project’s garden."
            : "Update, Idea, and Bug posts share progress without affecting growth."}
        </div>

        <textarea
          className="input"
          style={{ height: 100, margin: "12px 0" }}
          placeholder="What did you do?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        {showMediaWell ? (
          <div className="media-well">
            {mediaPreview && <img src={mediaPreview} alt="" />}
            {uploading && <div className="post-time">Uploading&hellip;</div>}
            <button type="button" className="media-remove" onClick={removeMedia}>Remove</button>
          </div>
        ) : (
          <button
            type="button"
            className="add-photo-link"
            onClick={() => { setShowMediaWell(true); fileInputRef.current?.click(); }}
          >
            + Add photo
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={handleFile}
        />

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="button" className="btn btn-primary" style={{ width: "100%" }} disabled={publishDisabled} onClick={publish}>
          Publish
        </button>
      </div>
    </div>
  );
}
