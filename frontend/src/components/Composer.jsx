import { useEffect, useRef, useState } from "react";
import { POST_TYPES } from "../utils.js";
import { api } from "../api.js";

const TYPE_HINT = {
  update: "Share a progress update — what happened today?",
  idea: "What idea are you exploring? Rough is fine.",
  bug: "What broke? Log it before you forget.",
  shipped: "You shipped something — this grows your garden.",
  release: "A full release — this grows your garden too.",
};

export default function Composer({ session, projects, defaultProjectId, onClose, onPublish }) {
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [postType, setPostType] = useState(defaultProjectId ? "shipped" : "update");
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const CONTENT_MAX = 2000;
  const growsGarden = postType === "shipped" || postType === "release";
  const charsLeft = CONTENT_MAX - content.length;
  const publishDisabled = !content.trim() || uploading || publishing;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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
    } finally {
      setUploading(false);
    }
  }

  function removeMedia() {
    setMediaUrl(null);
    setMediaPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function publish() {
    if (publishDisabled) return;
    setPublishing(true);
    setError("");
    try {
      await onPublish({ content: content.trim(), projectId: projectId || null, postType, mediaUrl });
    } catch (err) {
      setError(err.message);
      setPublishing(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="title" id="composer-title">New post</div>
          <button type="button" className="btn-text" onClick={onClose} aria-label="Close composer">✕</button>
        </div>

        <textarea
          ref={textareaRef}
          data-testid="composer-content"
          className="input composer-textarea"
          placeholder="What did you build, break, or learn?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={CONTENT_MAX}
        />

        <div className="composer-settings">
          {projects.length > 0 && (
            <div className="field">
              <label id="composer-project-label">Project</label>
              <div className="chip-row" role="group" aria-labelledby="composer-project-label">
                <button
                  type="button"
                  className={`chip ${projectId === "" ? "is-active" : ""}`}
                  aria-pressed={projectId === ""}
                  onClick={() => setProjectId("")}
                >
                  None
                </button>
                {projects.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`chip ${projectId === p.id ? "is-active" : ""}`}
                    aria-pressed={projectId === p.id}
                    onClick={() => setProjectId(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label id="composer-type-label">Type</label>
            <div className="chip-row" role="group" aria-labelledby="composer-type-label">
              {POST_TYPES.map((type) => (
                <button
                  type="button"
                  key={type}
                  className={`chip type-chip type-${type} ${postType === type ? "is-active" : ""}`}
                  aria-pressed={postType === type}
                  onClick={() => setPostType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`composer-hint ${growsGarden ? "grows" : "neutral"}`}>
          {TYPE_HINT[postType]}
        </div>

        {mediaPreview ? (
          <div className="media-well">
            <img src={mediaPreview} alt="" />
            {uploading && <div className="post-time">Uploading…</div>}
            <button type="button" className="media-remove" onClick={removeMedia}>Remove</button>
          </div>
        ) : (
          <button
            type="button"
            className="add-photo-link"
            onClick={() => fileInputRef.current?.click()}
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

        <div className="composer-footer">
          <span className={`composer-char ${content.length > 1600 ? "is-warning" : ""}`}>
            {content.length > 1400 ? `${charsLeft} left` : ""}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={publishDisabled}
            onClick={publish}
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
