import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import CommentThread from "./CommentThread.jsx";
import PostModal from "./PostModal.jsx";
import EditHistoryModal from "./EditHistoryModal.jsx";
import { api } from "../api.js";
import { fmtTimeAgo } from "../utils.js";

const TAG_CLASS = { update: "tag-update", idea: "tag-idea", bug: "tag-bug", shipped: "tag-shipped", release: "tag-release" };
const CONTENT_MAX = 2000;

export default function PostCard({ post, onOpenAuthor, onOpenProject, onLike, onUnlike, onEditPost, onDeletePost, token, currentUserId, currentUser }) {
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [showModal, setShowModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const menuRef = useRef(null);

  const liked = !!post.liked_by_me;
  const isOwner = post.user_id === currentUserId;
  const author = { id: post.user_id, username: post.username, display_name: post.display_name, avatar_url: post.avatar_url };
  const growthNote =
    post.project_id && post.project_name && (post.post_type === "shipped" || post.post_type === "release")
      ? `Grew ${post.project_name} toward stage ${Math.min(5, post.project_growth_stage)}.`
      : null;

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function startEdit() {
    setEditContent(post.content);
    setEditError("");
    setEditing(true);
    setMenuOpen(false);
  }

  async function saveEdit() {
    const trimmed = editContent.trim();
    if (!trimmed && !post.media_url) {
      setEditError("Add some text or a photo.");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    try {
      await onEditPost(post.id, trimmed);
      setEditing(false);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  function openModal() {
    setShowComments(false);
    setShowModal(true);
  }

  async function handleDelete() {
    setMenuOpen(false);
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    await onDeletePost(post.id);
  }

  return (
    <article className={`card post-card type-${post.post_type}`}>
      <div className="post-head">
        <div className="identity">
          <Avatar user={author} size={38} onClick={() => onOpenAuthor(post.user_id)} />
          <div>
            <div className="who">
              <button type="button" className="name" onClick={() => onOpenAuthor(post.user_id)}>{post.display_name || post.username}</button>
              <span className="handle">@{post.username}</span>
              {post.project_name && (
                <>
                  <span className="dot">&middot;</span>
                  <button
                    type="button"
                    className="project-link"
                    onClick={() => onOpenProject({ ownerId: post.project_owner_id, slug: post.project_slug })}
                  >
                    {post.project_name}
                  </button>
                </>
              )}
            </div>
            <div className="post-time">
              {fmtTimeAgo(post.created_at)}
              {post.edited_at && (
                <button type="button" className="edited-badge" onClick={() => setShowHistory(true)}>Edited</button>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`tag ${TAG_CLASS[post.post_type]}`}>{post.post_type}</span>
          {isOwner && (
            <div className="post-options" ref={menuRef}>
              <button
                type="button"
                className="options-trigger"
                aria-label="Post options"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="options-menu" role="menu">
                  <button type="button" role="menuitem" onClick={startEdit}>Edit</button>
                  <button type="button" role="menuitem" className="is-danger" onClick={handleDelete}>Delete</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="post-edit">
          <textarea
            className="input composer-textarea"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            maxLength={CONTENT_MAX}
            autoFocus
          />
          {editError && <p className="auth-error" role="alert">{editError}</p>}
          <div className="post-edit-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={savingEdit}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {post.content && (
            <p className="post-content post-open-trigger" onClick={openModal}>{post.content}</p>
          )}
          {post.media_url && (
            <img
              className="post-photo post-open-trigger"
              src={post.media_url}
              alt={`Photo by ${post.display_name || post.username}`}
              onClick={openModal}
            />
          )}
        </>
      )}

      {growthNote && <div className="growth-note">{growthNote}</div>}

      <div className="post-foot">
        <button
          type="button"
          className={`like-btn ${liked ? "is-liked" : ""}`}
          onClick={() => (liked ? onUnlike(post.id) : onLike(post.id))}
          aria-pressed={liked}
          aria-label={liked ? `Unlike this post (${post.like_count} likes)` : `Like this post (${post.like_count} likes)`}
        >
          <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
          <span aria-hidden="true">{post.like_count}</span>
        </button>

        <button
          type="button"
          className={`comment-toggle ${showComments ? "is-open" : ""}`}
          onClick={() => setShowComments((v) => !v)}
          aria-expanded={showComments}
        >
          <span aria-hidden="true">💬</span>
          <span>{commentCount} {commentCount === 1 ? "comment" : "comments"}</span>
        </button>
      </div>

      {showComments && (
        <CommentThread
          postId={post.id}
          token={token}
          currentUserId={currentUserId}
          currentUser={currentUser}
          onCountChange={setCommentCount}
        />
      )}

      {showModal && (
        <PostModal
          post={{ ...post, comment_count: commentCount }}
          onClose={() => setShowModal(false)}
          onOpenAuthor={onOpenAuthor}
          onOpenProject={onOpenProject}
          onLike={onLike}
          onUnlike={onUnlike}
          onCommentCountChange={setCommentCount}
          token={token}
          currentUserId={currentUserId}
          currentUser={currentUser}
        />
      )}

      {showHistory && (
        <EditHistoryModal
          title="Post edit history"
          fetchHistory={() => api.getPostHistory(token, post.id)}
          onClose={() => setShowHistory(false)}
        />
      )}
    </article>
  );
}
