import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { USE_MOCK_AUTH } from "../auth/authService";
import "./NotificationBell.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");
const CHECK_EVERY_MS = 60 * 1000; // waiting-list offers only last 10 minutes, so check often

const SAMPLE = [
  {
    id: 1,
    title: "A room is free for you",
    text: "Discussion Room 2 is held for you until 3:10 PM. Accept it on the Waiting List page.",
    read: false,
    urgent: true,
    action: { label: "Accept the room", page: "waiting-list" },
    created_at: new Date(Date.now() - 2 * 60000).toISOString(),
  },
  {
    id: 2,
    title: "Your booking starts soon",
    text: "Carrel Room 4 starts at 4:00 PM. Check in at the counter within 15 minutes.",
    read: true,
    urgent: false,
    action: { label: "Show my QR", page: "dashboard" },
    created_at: new Date(Date.now() - 90 * 60000).toISOString(),
  },
];

async function call(path, token, method = "GET") {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

function ago(iso) {
  const minutes = Math.round((Date.now() - new Date(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The bell in the student header: unread count, list, mark as read, and a button to act on each one. */
export default function NotificationBell({ onNavigate }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(USE_MOCK_AUTH ? SAMPLE : []);
  const [unread, setUnread] = useState(USE_MOCK_AUTH ? SAMPLE.filter((n) => !n.read).length : 0);
  const [error, setError] = useState("");
  const box = useRef(null);

  const load = useCallback(async () => {
    if (USE_MOCK_AUTH || !token) return;
    try {
      const data = await call("/notifications", token);
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
      setError("");
    } catch {
      setError("Couldn't load notifications.");
    }
  }, [token]);

  // Load now, then check every minute
  useEffect(() => {
    load();
    const timer = window.setInterval(load, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open) load(); // fresh list every time it opens
    setOpen(!open);
  }

  async function markRead(item) {
    if (item.read) return;
    setItems((list) => list.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    setUnread((count) => Math.max(0, count - 1));
    if (USE_MOCK_AUTH) return;
    try {
      const data = await call(`/notifications/${item.id}/read`, token, "POST");
      setUnread(data.unread ?? 0);
    } catch {
      load(); // put the real state back
    }
  }

  async function markAll() {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    setUnread(0);
    if (USE_MOCK_AUTH) return;
    try {
      await call("/notifications/read-all", token, "POST");
    } catch {
      load();
    }
  }

  function act(item) {
    markRead(item);
    setOpen(false);
    onNavigate?.(item.action.page);
  }

  const hasUrgent = items.some((n) => n.urgent && !n.read);

  return (
    <div className="notification-bell" ref={box}>
      <button
        type="button"
        className={`bell-button ${hasUrgent ? "is-urgent" : ""}`}
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="bell-link" onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>

          {error && <p className="bell-empty">{error}</p>}

          {!error && items.length === 0 && <p className="bell-empty">You're all caught up.</p>}

          <ul className="bell-list">
            {items.map((item) => (
              <li key={item.id} className={`bell-item ${item.read ? "" : "is-unread"} ${item.urgent ? "is-urgent" : ""}`}>
                <button type="button" className="bell-item-body" onClick={() => markRead(item)}>
                  <span className="bell-dot" aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <span className="bell-text">{item.text}</span>
                    <small>
                      {ago(item.created_at)}
                      {!item.read && " · tap to mark as read"}
                    </small>
                  </span>
                </button>
                {item.action && (
                  <button type="button" className="bell-action" onClick={() => act(item)}>
                    {item.action.label} →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}