import { useState } from "react";
import { useApp } from "../AppContext.js";
import { api } from "../api.js";

// Purely informational — nothing in the app is gated on email_verified
// today (there's no password reset to protect), so this is a nudge, not a
// wall. Dismissal is session-only (component state, not persisted) so it
// reappears next session until the user actually verifies.
export default function VerifyBanner() {
  const { session } = useApp();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (dismissed || session.user.email_verified) return null;

  async function resend() {
    setSending(true);
    try {
      await api.resendVerification(session.token);
      setSent(true);
    } catch {
      // Not critical enough to interrupt the banner with an error state —
      // the resend button just stays available to try again.
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="verify-banner" role="region" aria-label="Email verification">
      <span>{sent ? "Verification email sent — check your inbox." : "Verify your email to secure your account."}</span>
      <div className="verify-banner-actions">
        {!sent && (
          <button type="button" className="btn-text" onClick={resend} disabled={sending}>
            {sending ? "Sending…" : "Resend email"}
          </button>
        )}
        <button type="button" className="btn-text verify-banner-dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
