import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext.js";
import { api } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import ProjectCard from "../components/ProjectCard.jsx";
import PostCard from "../components/PostCard.jsx";

export default function ProfileScreen({ userId }) {
  const { session, goTo, isMobile, followingIds, toggleFollow, setSessionUser, dataVersion } = useApp();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [posts, setPosts] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const fileRef = useRef(null);

  const isSelf = userId === session.user.id;

  useEffect(() => {
    setUser(null);
    api.getUser(session.token, userId).then(setUser);
    api.getUserProjects(session.token, userId).then(setProjects);
    api.getUserPosts(session.token, userId).then(setPosts);
  }, [session, userId, dataVersion]);

  function startEdit() {
    setEditName(user.display_name || "");
    setEditBio(user.bio || "");
    setEditing(true);
  }

  async function saveProfile() {
    const updated = await api.updateMe(session.token, { displayName: editName, bio: editBio });
    setUser((u) => ({ ...u, display_name: updated.display_name, bio: updated.bio }));
    setSessionUser(updated);
    setEditing(false);
  }

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSavingAvatar(true);
    try {
      const url = await api.uploadImage(session.token, file);
      const updated = await api.updateMe(session.token, { avatarUrl: url });
      setUser((u) => ({ ...u, avatar_url: updated.avatar_url }));
      setSessionUser(updated);
    } finally {
      setSavingAvatar(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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

  async function handleFollowToggle() {
    const isFollowing = followingIds.has(userId);
    setUser((u) => ({ ...u, follower_count: Number(u.follower_count) + (isFollowing ? -1 : 1) }));
    try {
      await toggleFollow(userId, isFollowing);
    } catch {
      setUser((u) => ({ ...u, follower_count: Number(u.follower_count) + (isFollowing ? 1 : -1) }));
    }
  }

  if (!user) return null;

  const following = followingIds.has(userId);
  const gridCols = isMobile ? "1fr" : "repeat(2, 1fr)";

  return (
    <div>
      <div className="profile-head">
        {isSelf ? (
          <div className="avatar-upload">
            <Avatar user={user} size={64} />
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAvatarFile}
              disabled={savingAvatar}
            />
          </div>
        ) : (
          <Avatar user={user} size={64} />
        )}

        <div style={{ flex: 1 }}>
          {editing ? (
            <>
              <input
                className="input"
                style={{ maxWidth: 280, marginBottom: 8, fontWeight: 700 }}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Display name"
              />
              <textarea
                className="input"
                style={{ maxWidth: 400, height: 60, marginBottom: 10 }}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Bio"
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-primary" style={{ padding: "7px 14px" }} onClick={saveProfile}>Save</button>
                <button type="button" className="btn btn-secondary" style={{ padding: "7px 14px" }} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="profile-name-row">
                <h1>{user.display_name}</h1>
                {!isSelf && (
                  <button
                    type="button"
                    className={`follow-btn ${following ? "" : "is-not-following"}`}
                    onClick={() => handleFollowToggle()}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                )}
                {isSelf && (
                  <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={startEdit}>
                    Edit profile
                  </button>
                )}
              </div>
              <div className="profile-handle">@{user.username}</div>
              <p className="profile-bio">{user.bio}</p>
            </>
          )}
          <div className="profile-counts">
            <span><strong>{user.follower_count}</strong> followers</span>
            <span><strong>{user.following_count}</strong> following</span>
          </div>
        </div>
      </div>

      <div className="eyebrow">Projects</div>
      <div className="cards-grid" style={{ gridTemplateColumns: gridCols, marginBottom: 28 }}>
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} size={88} onClick={() => goTo("project", { ownerId: p.owner_id, slug: p.slug })} />
        ))}
      </div>

      <div className="eyebrow">Recent posts</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onOpenAuthor={(uid) => goTo("profile", { userId: uid })}
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
    </div>
  );
}
