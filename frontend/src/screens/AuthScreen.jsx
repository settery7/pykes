import { useState, useEffect } from "react";
import { api } from "../api.js";
import PykesMark from "../components/PykesMark.jsx";

// Free-tier backend hosting (Render) spins the server down after 15 min
// idle, so the first request after a lull can take up to ~a minute to
// wake it. A bare "Please wait…" reads as broken past a couple seconds —
// this swaps in an explanation once the wait is clearly not a normal
// request.
const SLOW_REQUEST_HINT_MS = 4000;

export default function AuthScreen({ onAuth, resetToken, onResetTokenConsumed }) {
  const [view, setView] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), SLOW_REQUEST_HINT_MS);
    return () => clearTimeout(t);
  }, [loading]);

  // A ?reset=<token> link lands here via App.jsx's resetToken prop —
  // jumps straight to the "set new password" form regardless of whatever
  // view was showing before.
  useEffect(() => {
    if (resetToken) setView("reset");
  }, [resetToken]);

  async function submit(e) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    try {
      if (view === "login") {
        const data = await api.login({ email, password });
        onAuth(data.user, data.token);
      } else if (view === "register") {
        const data = await api.register({ username, email, password });
        onAuth(data.user, data.token);
      } else if (view === "forgot") {
        const data = await api.forgotPassword(email);
        setInfo(data.message);
      } else if (view === "reset") {
        const data = await api.resetPassword(resetToken, password);
        onResetTokenConsumed();
        onAuth(data.user, data.token);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onDemoLogin() {
    setLoading(true);
    setError("");
    setView("login");
    setEmail("novadev@pykes.dev");
    setPassword("password");
    try {
      const data = await api.login({ email: "novadev@pykes.dev", password: "password" });
      onAuth(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="auth-logo">
          <PykesMark size={22} decorative />
          <span className="wordmark">Pykes</span>
        </div>
        <p className="auth-tagline">Post your progress. Watch your project grow.</p>

        <div className="auth-card">
          {view === "login" || view === "register" ? (
            <div className="tabs">
              <button type="button" className={`tab ${view === "login" ? "is-active" : ""}`} onClick={() => { setView("login"); setError(""); setInfo(""); }}>
                Log in
              </button>
              <button type="button" className={`tab ${view === "register" ? "is-active" : ""}`} onClick={() => { setView("register"); setError(""); setInfo(""); }}>
                Sign up
              </button>
            </div>
          ) : (
            <p className="auth-tagline" style={{ marginTop: 0 }}>
              {view === "forgot" ? "Reset your password" : "Set a new password"}
            </p>
          )}

          <form onSubmit={submit}>
            {view === "register" && (
              <div className="field">
                <label htmlFor="auth-username">Username</label>
                <input
                  id="auth-username"
                  className="input"
                  style={{ marginBottom: 8 }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            )}
            {view !== "reset" && (
              <div className="field">
                <label htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  className="input"
                  style={{ marginBottom: 8 }}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}
            {view !== "forgot" && (
              <div className="field">
                <label htmlFor="auth-password">{view === "reset" ? "New password" : "Password"}</label>
                <input
                  id="auth-password"
                  className="input"
                  style={{ marginBottom: 8 }}
                  type="password"
                  autoComplete={view === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}

            {view === "login" && (
              <button type="button" className="auth-link" onClick={() => { setView("forgot"); setError(""); setInfo(""); }}>
                Forgot password?
              </button>
            )}

            {error && <p className="auth-error" role="alert">{error}</p>}
            {info && <p className="auth-hint" role="status">{info}</p>}
            {slow && (
              <p className="auth-hint" role="status">
                Waking up the server — this runs on free hosting that sleeps when idle, so the first request can take up to a minute.
              </p>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading
                ? (slow ? "Waking up…" : "Please wait…")
                : view === "login" ? "Log in"
                : view === "register" ? "Create account"
                : view === "forgot" ? "Send reset link"
                : "Set new password"}
            </button>
          </form>

          {view === "login" && (
            <button type="button" className="auth-demo" onClick={onDemoLogin}>Try the demo &middot; novadev@pykes.dev / password</button>
          )}
          {(view === "forgot" || view === "reset") && (
            <button
              type="button"
              className="auth-demo"
              onClick={() => { setView("login"); setError(""); setInfo(""); onResetTokenConsumed(); }}
            >
              Back to log in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
