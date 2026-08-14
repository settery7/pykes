import { useEffect, useState } from "react";
import { useApp } from "../AppContext.js";
import { api } from "../api.js";
import Avatar from "../components/Avatar.jsx";

export default function FollowingScreen() {
  const { session, goTo, followingIds, toggleFollow } = useApp();
  const [users, setUsers] = useState(null);

  useEffect(() => {
    api.getFollowing(session.token).then(setUsers);
  }, [session, followingIds]);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 16px 0" }}>Following</h1>

      {users !== null && users.length === 0 && (
        <div className="empty-state">You're not following anyone yet. Check Explore to find creators.</div>
      )}

      <div className="creator-list">
        {(users || []).map((u) => (
          <div key={u.id} className="creator-row">
            <button type="button" className="identity" onClick={() => goTo("profile", { userId: u.id })}>
              <Avatar user={u} size={32} />
              <div>
                <div className="meta-name">{u.display_name}</div>
                <div className="meta-sub">@{u.username}</div>
              </div>
            </button>
            <button type="button" className="follow-btn" onClick={() => toggleFollow(u.id, true)}>Following</button>
          </div>
        ))}
      </div>
    </div>
  );
}
