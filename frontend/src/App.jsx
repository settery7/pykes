import { useCallback, useEffect, useMemo, useState } from "react";
import { AppContext } from "./AppContext.js";
import { api, connectSocket } from "./api.js";
import AuthScreen from "./screens/AuthScreen.jsx";
import AppShell from "./AppShell.jsx";
import Composer from "./components/Composer.jsx";
import FeedScreen from "./screens/FeedScreen.jsx";
import ExploreScreen from "./screens/ExploreScreen.jsx";
import ProjectsScreen from "./screens/ProjectsScreen.jsx";
import FollowingScreen from "./screens/FollowingScreen.jsx";
import ProfileScreen from "./screens/ProfileScreen.jsx";
import ProjectScreen from "./screens/ProjectScreen.jsx";
import NewProjectScreen from "./screens/NewProjectScreen.jsx";

function loadSession() {
  const token = localStorage.getItem("token");
  const userRaw = localStorage.getItem("user");
  if (!token || !userRaw) return null;
  try {
    return { token, user: JSON.parse(userRaw) };
  } catch {
    return null;
  }
}

function renderScreen(route) {
  switch (route.name) {
    case "feed": return <FeedScreen />;
    case "explore": return <ExploreScreen />;
    case "projects": return <ProjectsScreen />;
    case "following": return <FollowingScreen />;
    case "profile": return <ProfileScreen userId={route.params.userId} />;
    case "project": return <ProjectScreen ownerId={route.params.ownerId} slug={route.params.slug} />;
    case "newProject": return <NewProjectScreen />;
    default: return <FeedScreen />;
  }
}

export default function App() {
  const [session, setSession] = useState(loadSession);
  const [route, setRoute] = useState({ name: "feed", params: {} });
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [myProjects, setMyProjects] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [growthEvents, setGrowthEvents] = useState({});
  const [composer, setComposer] = useState({ open: false, projectId: "" });
  const [toast, setToast] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);

  const isMobile = viewportWidth < 760;
  const showRightRail = !isMobile && viewportWidth >= 1180 && (route.name === "feed" || route.name === "explore");

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Verification links have nowhere else to land — this app has no real
  // client-side router, so a "/?verify=<token>" URL is handled here, once,
  // on first mount. Works whether or not the browser already has a session
  // (the link is typically opened fresh from an email client), so this
  // can't live inside the `if (!session)` branch below.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("verify");
    if (!token) return;
    window.history.replaceState({}, "", window.location.pathname);

    api.verifyEmail(token)
      .then(({ user }) => {
        setSession((s) => {
          if (!s || s.user.id !== user.id) return s;
          const updated = { ...s.user, email_verified: true };
          localStorage.setItem("user", JSON.stringify(updated));
          return { ...s, user: updated };
        });
        setToast("Email verified.");
        setTimeout(() => setToast(null), 3200);
      })
      .catch((err) => {
        setToast(err.message);
        setTimeout(() => setToast(null), 3200);
      });
  }, []);

  const refreshMyProjects = useCallback(async () => {
    if (!session) return;
    const projects = await api.getUserProjects(session.token, session.user.id);
    setMyProjects(projects);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    refreshMyProjects();
    api.getFollowing(session.token).then((users) => setFollowingIds(new Set(users.map((u) => u.id))));
  }, [session, refreshMyProjects]);

  useEffect(() => {
    if (!session) return;
    let toastTimer;
    const disconnect = connectSocket(session.token, (msg) => {
      if (msg.type === "project_growth") {
        const project = msg.project;
        setGrowthEvents((prev) => ({ ...prev, [project.id]: project.growth_stage }));
        setMyProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, growth_stage: project.growth_stage } : p)));
        if (project.owner_id === session.user.id) {
          setToast("Your garden grew.");
          clearTimeout(toastTimer);
          toastTimer = setTimeout(() => setToast(null), 3200);
        }
      } else if (msg.type === "new_follower") {
        setToast(`${msg.follower.display_name || msg.follower.username} started following you.`);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => setToast(null), 3200);
      } else if (msg.type === "post_liked") {
        setToast(`${msg.liker.display_name || msg.liker.username} liked your post.`);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => setToast(null), 3200);
      }
    });
    return () => {
      clearTimeout(toastTimer);
      disconnect();
    };
  }, [session]);

  function handleAuth(user, token) {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setSession({ token, user });
    setRoute({ name: "feed", params: {} });
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setSession(null);
    setMyProjects([]);
    setFollowingIds(new Set());
    setGrowthEvents({});
    setRoute({ name: "feed", params: {} });
  }

  function setSessionUser(updatedUser) {
    setSession((s) => {
      const user = { ...s.user, ...updatedUser };
      localStorage.setItem("user", JSON.stringify(user));
      return { ...s, user };
    });
  }

  const goTo = useCallback((name, params = {}) => setRoute({ name, params }), []);

  async function toggleFollow(userId, isFollowing) {
    setFollowingIds((prev) => {
      const next = new Set(prev);
      isFollowing ? next.delete(userId) : next.add(userId);
      return next;
    });
    try {
      if (isFollowing) await api.unfollow(session.token, userId);
      else await api.follow(session.token, userId);
    } catch (err) {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        isFollowing ? next.add(userId) : next.delete(userId);
        return next;
      });
      throw err;
    }
  }

  function openComposer(projectId) {
    setComposer({ open: true, projectId: projectId || "" });
  }
  function closeComposer() {
    setComposer({ open: false, projectId: "" });
  }

  async function handlePublish(postData) {
    await api.createPost(session.token, postData);
    closeComposer();
    // "shipped"/"release" posts against a project trigger a project_growth
    // broadcast (see posts.js) that lands the more specific "Your garden
    // grew." toast — skip "Posted." here so it can't clobber that toast,
    // whichever of the two arrives first.
    const triggersGrowth = postData.projectId && (postData.postType === "shipped" || postData.postType === "release");
    if (!triggersGrowth) {
      setToast("Posted.");
      setTimeout(() => setToast(null), 3200);
    }
    setDataVersion((v) => v + 1);
  }

  const contextValue = useMemo(
    () => ({
      session,
      route,
      goTo,
      isMobile,
      showRightRail,
      myProjects,
      refreshMyProjects,
      followingIds,
      toggleFollow,
      growthEvents,
      openComposer,
      closeComposer,
      showToast: (msg) => { setToast(msg); setTimeout(() => setToast(null), 3200); },
      logout,
      setSessionUser,
      dataVersion,
    }),
    [session, route, goTo, isMobile, showRightRail, myProjects, refreshMyProjects, followingIds, growthEvents, dataVersion]
  );

  if (!session) {
    return (
      <>
        <AuthScreen onAuth={handleAuth} />
        {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      </>
    );
  }

  return (
    <AppContext.Provider value={contextValue}>
      <AppShell>{renderScreen(route)}</AppShell>

      {composer.open && (
        <Composer
          session={session}
          projects={myProjects}
          defaultProjectId={composer.projectId}
          onClose={closeComposer}
          onPublish={handlePublish}
        />
      )}

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </AppContext.Provider>
  );
}
