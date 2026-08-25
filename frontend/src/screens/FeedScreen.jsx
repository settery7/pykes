import { useEffect, useState } from "react";
import { useApp } from "../AppContext.js";
import { api } from "../api.js";
import PostCard from "../components/PostCard.jsx";

export default function FeedScreen() {
  const { session, isMobile, goTo, openComposer, myProjects, dataVersion } = useApp();
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getFeed(session.token).then((data) => { if (!cancelled) setPosts(data); });
    return () => { cancelled = true; };
  }, [session, dataVersion]);

  async function handleLike(postId) {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, liked_by_me: true, like_count: p.like_count + 1 } : p)));
    try {
      await api.likePost(session.token, postId);
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, liked_by_me: false, like_count: p.like_count - 1 } : p)));
    }
  }

  async function handleUnlike(postId) {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, liked_by_me: false, like_count: p.like_count - 1 } : p)));
    try {
      await api.unlikePost(session.token, postId);
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, liked_by_me: true, like_count: p.like_count + 1 } : p)));
    }
  }

  async function handleEditPost(postId, content) {
    const updated = await api.updatePost(session.token, postId, { content });
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, content: updated.content, edited_at: updated.edited_at } : p)));
  }

  async function handleDeletePost(postId) {
    await api.deletePost(session.token, postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  return (
    <div>
      <div className="page-header">
        <h1>Home</h1>
        {isMobile && (
          <button type="button" className="btn btn-primary" onClick={() => openComposer(myProjects[0]?.id)}>New post</button>
        )}
      </div>

      {posts === null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="skeleton" />
          <div className="skeleton" style={{ animationDelay: "0.15s" }} />
          <div className="skeleton" style={{ animationDelay: "0.3s" }} />
        </div>
      )}

      {posts !== null && posts.length === 0 && (
        <div className="empty-state">Your feed is quiet. Follow a few creators from Explore, or post your first update.</div>
      )}

      {posts !== null && posts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpenAuthor={(userId) => goTo("profile", { userId })}
              onOpenProject={({ ownerId, slug }) => goTo("project", { ownerId, slug })}
              onLike={handleLike}
              onUnlike={handleUnlike}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              token={session.token}
              currentUserId={session.user.id}
              currentUser={session.user}
            />
          ))}
        </div>
      )}
    </div>
  );
}
