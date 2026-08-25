import { useEffect, useState } from "react";
import { fmtTimeAgo } from "../utils.js";

// Generic edit-history viewer for both posts and comments — takes an async
// fetchHistory() rather than the data itself, so it can be dropped in
// without the caller pre-loading anything just to support the "Edited"
// badge. Entries come back most-recent-first from the API.
export default function EditHistoryModal({ title, fetchHistory, onClose }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchHistory().then((data) => {
      if (!cancelled) setHistory(data);
    }).catch((err) => {
      if (!cancelled) setError(err.message);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal history-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="title">{title}</div>
          <button type="button" className="btn-text" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}
        {!error && history === null && <p className="comment-loading">Loading history…</p>}
        {!error && history !== null && history.length === 0 && (
          <p className="comment-empty">No earlier versions.</p>
        )}
        {!error && history !== null && history.length > 0 && (
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.id} className="history-item">
                <div className="history-time">{fmtTimeAgo(h.edited_at)}</div>
                <p className="history-content">{h.content || <em>No caption at this point.</em>}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
