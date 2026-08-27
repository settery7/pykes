import { useEffect, useState } from "react";
import { useApp } from "./AppContext.js";
import { api } from "./api.js";
import Avatar from "./components/Avatar.jsx";
import PykesMark from "./components/PykesMark.jsx";
import VerifyBanner from "./components/VerifyBanner.jsx";
import GardenCanvas from "./garden/GardenCanvas.jsx";
import { STAGE_LABELS } from "./utils.js";

const NAV = [
  { key: "feed", label: "Home" },
  { key: "explore", label: "Explore" },
  { key: "projects", label: "Projects" },
  { key: "following", label: "Following" },
  { key: "profile", label: "Profile" },
];

function effectiveStage(project, growthEvents) {
  return Math.min(5, Math.max(project.growth_stage, growthEvents[project.id] ?? 0));
}

export default function AppShell({ children }) {
  const { session, route, goTo, isMobile, showRightRail, myProjects, followingIds, toggleFollow, growthEvents, openComposer, logout } = useApp();
  const [trending, setTrending] = useState([]);
  const [suggested, setSuggested] = useState([]);

  // followingIds is intentionally not a dependency here: this should filter
  // out already-followed people once, when the list loads, not re-filter
  // (and make someone vanish mid-view) every time you follow one of them
  // from this exact widget — the button below reflects the current state
  // in place instead.
  useEffect(() => {
    if (!showRightRail) return;
    api.exploreProjects(session.token).then((projects) => {
      setTrending(projects.filter((p) => p.owner_id !== session.user.id).slice(0, 3));
    });
    api.exploreUsers(session.token).then((users) => {
      setSuggested(users.filter((u) => !followingIds.has(u.id)).slice(0, 3));
    });
  }, [showRightRail, session]);

  const isProfileActive = route.name === "profile" && route.params.userId === session.user.id;

  return (
    <div className="app-shell">
      {isMobile && (
        <div className="topbar-mobile">
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <PykesMark size={16} decorative />
            <span className="wordmark">Pykes</span>
          </div>
          <Avatar user={session.user} size={30} onClick={() => goTo("profile", { userId: session.user.id })} />
        </div>
      )}

      <VerifyBanner />

      <div className="shell-body">
        {!isMobile && (
          <div className="sidebar">
            <button type="button" className="sidebar-logo" onClick={() => goTo("feed")}>
              <PykesMark size={18} decorative />
              <span className="wordmark">Pykes</span>
            </button>
            {NAV.map((item) => {
              const active = item.key === "profile" ? isProfileActive : route.name === item.key;
              return (
                <button
                  type="button"
                  key={item.key}
                  className={`nav-item ${active ? "is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => goTo(item.key === "profile" ? "profile" : item.key, item.key === "profile" ? { userId: session.user.id } : {})}
                >
                  {item.label}
                </button>
              );
            })}
            <div className="sidebar-spacer" />
            <button type="button" className="btn btn-primary" onClick={() => openComposer(myProjects[0]?.id)}>New post</button>
            <button type="button" className="sidebar-logout" onClick={logout}>Log out</button>
          </div>
        )}

        <div className="main-scroll">
          <div className={`page-inner ${isMobile ? "is-mobile" : "is-desktop"}`}>{children}</div>
        </div>

        {showRightRail && (
          <div className="right-rail">
            <div>
              <div className="eyebrow">Your gardens</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {myProjects.slice(0, 3).map((p) => (
                  <button type="button" key={p.id} className="rail-item card-style" onClick={() => goTo("project", { ownerId: p.owner_id, slug: p.slug })}>
                    <GardenCanvas projectId={p.id} stage={effectiveStage(p, growthEvents)} displaySize={44} />
                    <div>
                      <div className="meta-name">{p.name}</div>
                      <div className="meta-sub">{STAGE_LABELS[effectiveStage(p, growthEvents)]}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="eyebrow">Trending projects</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {trending.map((p) => (
                  <button type="button" key={p.id} className="rail-item" onClick={() => goTo("project", { ownerId: p.owner_id, slug: p.slug })}>
                    <GardenCanvas projectId={p.id} stage={effectiveStage(p, growthEvents)} displaySize={36} />
                    <div>
                      <div className="meta-name">{p.name}</div>
                      <div className="meta-sub">by {p.display_name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="eyebrow">Suggested creators</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {suggested.map((u) => {
                  const following = followingIds.has(u.id);
                  return (
                    <div key={u.id} className="suggested-row">
                      <Avatar user={u} size={28} onClick={() => goTo("profile", { userId: u.id })} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="meta-name truncate">{u.display_name}</div>
                        <div className="meta-sub truncate">@{u.username}</div>
                      </div>
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
          </div>
        )}
      </div>

      {isMobile && (
        <div className="bottom-tabs">
          {NAV.map((item) => {
            const active = item.key === "profile" ? isProfileActive : route.name === item.key;
            return (
              <button
                type="button"
                key={item.key}
                className={`bottom-tab ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => goTo(item.key === "profile" ? "profile" : item.key, item.key === "profile" ? { userId: session.user.id } : {})}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
