import { useEffect, useState } from "react";
import { useApp } from "../AppContext.js";
import { api } from "../api.js";
import ProjectCard from "../components/ProjectCard.jsx";
import Avatar from "../components/Avatar.jsx";

export default function ExploreScreen() {
  const { session, isMobile, goTo, followingIds, toggleFollow } = useApp();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    api.exploreProjects(session.token).then((data) => setProjects(data.filter((p) => p.owner_id !== session.user.id)));
    api.exploreUsers(session.token).then(setUsers);
  }, [session]);

  const gridCols = isMobile ? "1fr" : "repeat(2, 1fr)";

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px 0" }}>Explore</h1>
      <p className="page-sub">Projects and creators building in public right now.</p>

      <div className="eyebrow">Projects</div>
      <div className="cards-grid" style={{ gridTemplateColumns: gridCols, marginBottom: 28 }}>
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onClick={() => goTo("project", { ownerId: p.owner_id, slug: p.slug })} />
        ))}
      </div>

      <div className="eyebrow">Creators</div>
      <div className="creator-list">
        {users.map((u) => {
          const following = followingIds.has(u.id);
          return (
            <div key={u.id} className="creator-row">
              <button type="button" className="identity" onClick={() => goTo("profile", { userId: u.id })}>
                <Avatar user={u} size={32} />
                <div>
                  <div className="meta-name">{u.display_name}</div>
                  <div className="meta-sub">@{u.username}</div>
                </div>
              </button>
              <button
                type="button"
                className={`follow-btn ${following ? "" : "is-not-following"}`}
                onClick={() => toggleFollow(u.id, following)}
              >
                {following ? "Following" : "Follow"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
