import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import EditHistoryModal from "./EditHistoryModal.jsx";
import { api } from "../api.js";
import { fmtTimeAgo } from "../utils.js";

const COMMENT_MAX = 1000;

// Fetches and renders a post's comment thread, including add/edit/delete for
// the signed-in user's own comments. Mounted (and thus fetched) on demand —
// PostCard mounts it only once its inline thread is toggled open, PostModal
// mounts it immediately since the modal has no separate toggle step.
export default function CommentThread({ postId, token, currentUserId, currentUser, onCountChange, autoFocus }) {
  const [comments, setComments] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [historyForId, setHistoryForId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getComments(postId).then((data) => {
      if (cancelled) return;
      setComments(data);
    }).catch(() => {
      if (!cancelled) setComments([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [postId]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Notifying the parent belongs here, not inside setComments' updater —
  // updater functions must stay pure (React may invoke them more than once
  // to check that), so a cross-component setState call inside one trips
  // React's "update while rendering a different component" warning.
  useEffect(() => {
    if (comments !== null) onCountChange?.(comments.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments]);

  async function submitComment(e) {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const created = await api.createComment(token, { postId, content: trimmed });
      setComments((prev) => [...(prev ?? []), created]);
      setCommentText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditText(c.content);
    setError("");
  }

  async function saveEdit(id) {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setError("");
    try {
      const updated = await api.updateComment(token, id, { content: trimmed });
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, content: updated.content, edited_at: updated.edited_at } : c)));
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteComment(id) {
    setError("");
    try {
      await api.deleteComment(token, id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  const charsLeft = COMMENT_MAX - commentText.length;

  return (
    <div className="comment-thread" role="region" aria-label="Comments">
      {loading && <p className="comment-loading">Loading comments…</p>}

      {!loading && comments !== null && (
        <>
          {comments.length === 0 && <p className="comment-empty">No comments yet. Be the first!</p>}

          {comments.length > 0 && (
            <ul className="comment-list" aria-label="Comment list">
              {comments.map((c) => {
                const cAuthor = { id: c.user_id, username: c.username, display_name: c.display_name, avatar_url: c.avatar_url };
                const isEditing = editingId === c.id;
                return (
                  <li key={c.id} className="comment-item">
                    <Avatar user={cAuthor} size={26} />
                    <div className="comment-body">
                      <div className="comment-meta">
                        <span className="comment-author">{c.display_name || c.username}</span>
                        <span className="comment-time">{fmtTimeAgo(c.created_at)}</span>
                        {c.edited_at && (
                          <button type="button" className="edited-badge" onClick={() => setHistoryForId(c.id)}>Edited</button>
                        )}
                      </div>
                      {isEditing ? (
                        <div className="comment-edit">
                          <textarea
                            className="input comment-input"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            maxLength={COMMENT_MAX}
                            rows={1}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                saveEdit(c.id);
                              }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <div className="comment-edit-actions">
                            <button type="button" className="btn-text" onClick={() => setEditingId(null)}>Cancel</button>
                            <button type="button" className="btn-text is-accent" disabled={!editText.trim()} onClick={() => saveEdit(c.id)}>Save</button>
                          </div>
                        </div>
                      ) : (
                        <p className="comment-text">{c.content}</p>
                      )}
                    </div>
                    {c.user_id === currentUserId && !isEditing && (
                      <div className="comment-actions">
                        <button type="button" className="comment-action" aria-label="Edit comment" onClick={() => startEdit(c)}>✎</button>
                        <button type="button" className="comment-action" aria-label="Delete comment" onClick={() => deleteComment(c.id)}>×</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form className="comment-form" onSubmit={submitComment}>
            {currentUser && <Avatar user={currentUser} size={26} />}
            <div className="comment-input-wrap">
              <textarea
                ref={inputRef}
                data-testid="comment-input"
                className="input comment-input"
                placeholder="Add a comment… (Enter to post)"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={1}
                maxLength={COMMENT_MAX}
                disabled={submitting}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitComment(e);
                  }
                }}
              />
              {commentText.length > 800 && (
                <span className={`comment-chars ${charsLeft < 50 ? "is-warning" : ""}`}>{charsLeft}</span>
              )}
            </div>
            <button type="submit" className="btn btn-primary comment-submit" disabled={!commentText.trim() || submitting}>
              {submitting ? "…" : "Post"}
            </button>
          </form>

          {error && <p className="auth-error" role="alert" style={{ margin: "4px 0 0" }}>{error}</p>}
        </>
      )}

      {historyForId && (
        <EditHistoryModal
          title="Comment edit history"
          fetchHistory={() => api.getCommentHistory(historyForId)}
          onClose={() => setHistoryForId(null)}
        />
      )}
    </div>
  );
}
