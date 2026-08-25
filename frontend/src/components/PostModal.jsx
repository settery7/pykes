import { useEffect, useState } from "react";
import Avatar from "./Avatar.jsx";
import CommentThread from "./CommentThread.jsx";
import EditHistoryModal from "./EditHistoryModal.jsx";
import { api } from "../api.js";
import { fmtTimeAgo } from "../utils.js";

// Detail view opened by clicking a post's photo or caption: photo full-size
// up top (object-fit: contain, so nothing gets cropped like the feed-card
// thumbnail does), the caption and like/comment counts below it, then the
// full always-open comment thread.
export default function PostModal({ post, onClose, onOpenAuthor, onOpenProject, onLike, onUnlike, onCommentCountChange, token, currentUserId, currentUser }) {
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [showHistory, setShowHistory] = useState(false);
  const liked = !!post.liked_by_me;

  function handleCountChange(count) {
    setCommentCount(count);
    onCommentCountChange?.(count);
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal post-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head post-modal-head">
          <div className="identity">
            <Avatar user={{ id: post.user_id, username: post.username, display_name: post.display_name, avatar_url: post.avatar_url }} size={32} onClick={() => onOpenAuthor(post.user_id)} />
            <div>
              <div className="who">
                <button type="button" className="name" onClick={() => onOpenAuthor(post.user_id)}>{post.display_name || post.username}</button>
                {post.project_name && (
                  <>
                    <span className="dot">&middot;</span>
                    <button type="button" className="project-link" onClick={() => onOpenProject({ ownerId: post.project_owner_id, slug: post.project_slug })}>
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
          <button type="button" className="btn-text" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="post-modal-scroll">
          {post.media_url && (
            <img className="post-modal-photo" src={post.media_url} alt={`Photo by ${post.display_name || post.username}`} />
          )}

          <div className="post-modal-body">
            {post.content && <p className="post-content">{post.content}</p>}

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
              <span className="comment-toggle" aria-hidden="true">
                <span>💬</span>
                <span>{commentCount} {commentCount === 1 ? "comment" : "comments"}</span>
              </span>
            </div>

            <CommentThread
              postId={post.id}
              token={token}
              currentUserId={currentUserId}
              currentUser={currentUser}
              onCountChange={handleCountChange}
              autoFocus
            />
          </div>
        </div>
      </div>

      {showHistory && (
        <EditHistoryModal
          title="Post edit history"
          fetchHistory={() => api.getPostHistory(token, post.id)}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
