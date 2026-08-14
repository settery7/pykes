import Avatar from "./Avatar.jsx";
import { fmtTimeAgo } from "../utils.js";

const TAG_CLASS = { update: "tag-update", idea: "tag-idea", bug: "tag-bug", shipped: "tag-shipped", release: "tag-release" };

export default function PostCard({ post, onOpenAuthor, onOpenProject, onLike }) {
  const liked = !!post.liked_by_me;
  const author = { id: post.user_id, username: post.username, display_name: post.display_name, avatar_url: post.avatar_url };
  const growthNote =
    post.project_id && post.project_name && (post.post_type === "shipped" || post.post_type === "release")
      ? `Grew ${post.project_name} toward stage ${Math.min(5, post.project_growth_stage)}.`
      : null;

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
        <img className="post-photo" src={post.media_url} alt={`Photo attached to ${post.display_name || post.username}'s post`} />
      )}

      {growthNote && <div className="growth-note">{growthNote}</div>}

      <div className="post-foot">
        <button
          type="button"
          className={`like-btn ${liked ? "is-liked" : ""}`}
          onClick={() => !liked && onLike(post.id)}
          disabled={liked}
          aria-pressed={liked}
          aria-label={liked ? `You liked this post (${post.like_count} likes)` : `Like this post (${post.like_count} likes)`}
        >
          <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
          <span aria-hidden="true">{post.like_count}</span>
        </button>
        <div className="comment-count">
          <span>{post.comment_count}</span>
          <span>comments</span>
        </div>
      </div>
    </article>
  );
}
