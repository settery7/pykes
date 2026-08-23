import { useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import { api } from "../api.js";
import { fmtTimeAgo } from "../utils.js";

const TAG_CLASS = { update: "tag-update", idea: "tag-idea", bug: "tag-bug", shipped: "tag-shipped", release: "tag-release" };
const COMMENT_MAX = 1000;

export default function PostCard({ post, onOpenAuthor, onOpenProject, onLike, onUnlike, token, currentUserId, currentUser }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");
  const inputRef = useRef(null);

  const liked = !!post.liked_by_me;
  const author = { id: post.user_id, username: post.username, display_name: post.display_name, avatar_url: post.avatar_url };
  const growthNote =
    post.project_id && post.project_name && (post.post_type === "shipped" || post.post_type === "release")
      ? `Grew ${post.project_name} toward stage ${Math.min(5, post.project_growth_stage)}.`
      : null;

  async function toggleComments() {
    if (!showComments && comments === null) {
      setLoadingComments(true);
      try {
        const data = await api.getComments(post.id);
        setComments(data);
        setCommentCount(data.length);
      } catch {
        setComments([]);
      } finally {
        setLoadingComments(false);
      }
    }
    setShowComments((v) => !v);
    if (!showComments) setTimeout(() => inputRef.current?.focus(), 60);
  }

  async function submitComment(e) {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setCommentError("");
    try {
      const created = await api.createComment(token, { postId: post.id, content: trimmed });
      setComments((prev) => [...(prev ?? []), created]);
      setCommentCount((c) => c + 1);
      setCommentText("");
    } catch (err) {
      setCommentError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteComment(id) {
    setCommentError("");
    try {
      await api.deleteComment(token, id);
      setComments((prev) => prev.filter((c) => c.id !== id));
      setCommentCount((c) => Math.max(0, c - 1));
    } catch (err) {
      setCommentError(err.message);
    }
  }

  const charsLeft = COMMENT_MAX - commentText.length;

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
            <div className="post-time">{fmtTimeAgo(post.created_at)}</div>
          </div>
        </div>
        <span className={`tag ${TAG_CLASS[post.post_type]}`}>{post.post_type}</span>
      </div>

      <p className="post-content">{post.content}</p>

      {post.media_url && (
        <img className="post-photo" src={post.media_url} alt={`Photo by ${post.display_name || post.username}`} />
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
          onClick={toggleComments}
          aria-expanded={showComments}
        >
          <span aria-hidden="true">💬</span>
          <span>{commentCount} {commentCount === 1 ? "comment" : "comments"}</span>
        </button>
      </div>

      {showComments && (
        <div className="comment-thread" role="region" aria-label="Comments">
          {loadingComments && (
            <p className="comment-loading">Loading comments…</p>
          )}

          {!loadingComments && comments !== null && (
            <>
              {comments.length === 0 && (
                <p className="comment-empty">No comments yet. Be the first!</p>
              )}

              {comments.length > 0 && (
                <ul className="comment-list" aria-label="Comment list">
                  {comments.map((c) => {
                    const cAuthor = { id: c.user_id, username: c.username, display_name: c.display_name, avatar_url: c.avatar_url };
                    return (
                      <li key={c.id} className="comment-item">
                        <Avatar user={cAuthor} size={26} />
                        <div className="comment-body">
                          <div className="comment-meta">
                            <span className="comment-author">{c.display_name || c.username}</span>
                            <span className="comment-time">{fmtTimeAgo(c.created_at)}</span>
                          </div>
                          <p className="comment-text">{c.content}</p>
                        </div>
                        {c.user_id === currentUserId && (
                          <button
                            type="button"
                            className="comment-delete"
                            aria-label="Delete comment"
                            onClick={() => deleteComment(c.id)}
                          >
                            ×
                          </button>
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
                <button
                  type="submit"
                  className="btn btn-primary comment-submit"
                  disabled={!commentText.trim() || submitting}
                >
                  {submitting ? "…" : "Post"}
                </button>
              </form>

              {commentError && (
                <p className="auth-error" role="alert" style={{ margin: "4px 0 0" }}>{commentError}</p>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
