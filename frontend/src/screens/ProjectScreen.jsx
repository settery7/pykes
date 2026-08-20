import { useEffect, useState } from "react";
import { useApp } from "../AppContext.js";
import { api } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import GardenCanvas from "../garden/GardenCanvas.jsx";
import PostCard from "../components/PostCard.jsx";
import { STAGE_LABELS, fmtTimeAgo } from "../utils.js";

export default function ProjectScreen({ ownerId, slug }) {
  const { session, goTo, followingIds, toggleFollow, growthEvents, openComposer, dataVersion } = useApp();
  const [project, setProject] = useState(null);
  const [owner, setOwner] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setProject(null);
    setOwner(null);
    setNotFound(false);
    api.getProject(session.token, ownerId, slug).then(setProject).catch(() => setNotFound(true));
    api.getUser(session.token, ownerId).then(setOwner);
  }, [session, ownerId, slug, dataVersion]);

  if (notFound) return <div className="empty-state">Project not found.</div>;
  if (!project || !owner) return null;

  const isOwner = ownerId === session.user.id;
  const following = followingIds.has(ownerId);
  const stage = Math.min(5, Math.max(project.growth_stage, growthEvents[project.id] ?? 0));

  async function handleLike(postId) {
    setProject((p) => ({
      ...p,
      posts: p.posts.map((post) => (post.id === postId ? { ...post, liked_by_me: true, like_count: post.like_count + 1 } : post)),
    }));
    try {
      await api.likePost(session.token, postId);
    } catch {
      setProject((p) => ({
        ...p,
        posts: p.posts.map((post) => (post.id === postId ? { ...post, liked_by_me: false, like_count: post.like_count - 1 } : post)),
      }));
    }
  }

  return (
    <div>
      <button type="button" onClick={() => goTo("feed")} style={{ fontSize: 13, color: "var(--text-tertiary)", cursor: "pointer", marginBottom: 14, display: "block" }}>
        &larr; Back to feed
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{project.name}</h1>
          <button
            type="button"
            onClick={() => goTo("profile", { userId: ownerId })}
            style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, cursor: "pointer", textAlign: "left" }}
          >
            <Avatar user={owner} size={22} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{owner.display_name}</span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>&middot; started {fmtTimeAgo(project.created_at)}</span>
          </button>
        </div>
        {isOwner ? (
          <button type="button" className="btn btn-primary" onClick={() => openComposer(project.id)}>Post an update</button>
        ) : (
          <button
            type="button"
            className={`follow-btn ${following ? "" : "is-not-following"}`}
            onClick={() => toggleFollow(ownerId, following)}
          >
            {following ? "Following" : "Follow"}
          </button>
        )}
      </div>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 560, margin: "10px 0 22px 0" }}>
        {project.description || "No description yet."}
      </p>

      <div className="garden-panel">
        <GardenCanvas projectId={project.id} stage={stage} displaySize={160} />
        <div className="stat-block">
          <div className="garden-stage-label">{STAGE_LABELS[stage]}</div>
          <div className="stage-segments">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`stage-segment ${i < stage ? "is-filled" : ""}`} />
            ))}
          </div>
          <div className="garden-stage-note">Stage {stage} of 5 &middot; grows when you post Shipped or Release updates.</div>
          <div className="stat-row">
            <div>
              <div className="stat-num">{project.posts.length}</div>
              <div className="stat-label">updates</div>
            </div>
            <div>
              <div className="stat-num">{project.posts.filter((p) => p.post_type === "shipped" || p.post_type === "release").length}</div>
              <div className="stat-label">shipped</div>
            </div>
            <div>
              <div className="stat-num">{owner.follower_count}</div>
              <div className="stat-label">followers</div>
            </div>
          </div>
        </div>
      </div>

      <div className="eyebrow">Timeline</div>
      {project.posts.length === 0 && <div className="empty-state">No updates yet.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {project.posts.map((post) => (
          <PostCard
            key={post.id}
            post={{
              ...post,
              project_id: project.id,
              project_name: project.name,
              project_slug: project.slug,
              project_owner_id: project.owner_id,
              project_growth_stage: project.growth_stage,
            }}
            onOpenAuthor={(uid) => goTo("profile", { userId: uid })}
            onOpenProject={({ ownerId: oid, slug: s }) => goTo("project", { ownerId: oid, slug: s })}
            onLike={handleLike}
            token={session.token}
            currentUserId={session.user.id}
            currentUser={session.user}
          />
        ))}
      </div>
    </div>
  );
}
