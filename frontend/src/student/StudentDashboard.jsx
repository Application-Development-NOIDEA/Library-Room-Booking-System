import { useCallback, useEffect, useState } from "react";
import "./StudentDashboard.css";
import { useAuth } from "../auth/AuthContext";
import { USE_MOCK_AUTH } from "../auth/authService";
import { SAMPLE_DASHBOARD, fetchDashboard } from "./dashboardService";
import NextBookingCard from "./NextBookingCard";

/* ---------- Helpers ---------- */

function greeting(date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function startsIn(iso, now) {
  const minutes = Math.round((new Date(iso) - now) / 60000);
  if (minutes <= 0) return "Happening now";
  if (minutes < 60) return `Starts in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Starts in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `In ${days} day${days === 1 ? "" : "s"}`;
}

const REFRESH_EVERY_MS = 2 * 60 * 1000;

/* ---------- Page ---------- */

export default function StudentDashboard({ onNavigate, userName = "Student" }) {
  const { token } = useAuth();
  const [now, setNow] = useState(new Date());
  const [data, setData] = useState(USE_MOCK_AUTH ? SAMPLE_DASHBOARD : null);
  const [loading, setLoading] = useState(!USE_MOCK_AUTH);
  const [error, setError] = useState("");
  const [lastLoaded, setLastLoaded] = useState(null);

  const load = useCallback(async () => {
    if (USE_MOCK_AUTH) return;
    setLoading(true);
    setError("");
    try {
      setData(await fetchDashboard(token));
      setLastLoaded(new Date());
    } catch (err) {
      setError(err.message || "Could not load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Tick the clock every minute, reload the data every 2 minutes
  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 60 * 1000);
    const refresh = USE_MOCK_AUTH ? null : window.setInterval(load, REFRESH_EVERY_MS);
    return () => {
      window.clearInterval(clock);
      if (refresh) window.clearInterval(refresh);
    };
  }, [load]);

  const firstName = userName.trim().split(/\s+/)[0];
  const go = (page) => onNavigate?.(page);

  const heading = (
    <div className="dash-heading">
      <div>
        <p className="page-eyebrow">STUDENT WORKSPACE</p>
        <h1 className="page-title">
          {greeting(now)}, {firstName}
        </h1>
        <p className="page-description">
          {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {" · "}Perpustakaan Sultanah Zanariah
        </p>
      </div>
      {USE_MOCK_AUTH ? (
        <span className="dash-preview">Sample data</span>
      ) : (
        <button type="button" className="dash-refresh" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      )}
    </div>
  );

  // First load: nothing to show yet
  if (!data) {
    return (
      <div className="student-dashboard">
        {heading}
        {error ? (
          <div className="dash-error" role="alert">
            <strong>Couldn't load your dashboard.</strong>
            <p>{error}</p>
            <button type="button" className="dash-button primary" onClick={load}>
              Try again
            </button>
          </div>
        ) : (
          <div className="dash-loading">Loading your dashboard…</div>
        )}
      </div>
    );
  }

  // Drop bookings that ended since the last refresh
  const upcoming = data.bookings.filter((booking) => new Date(booking.end) > now);
  const next = upcoming[0];
  const { waiting, availability, notifications, rules } = data;
  const freeNow = availability.reduce((sum, item) => sum + item.free, 0);
  const totalRooms = availability.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="student-dashboard">
      {heading}

      {error && (
        <p className="dash-inline-error" role="alert">
          Showing your last loaded data. {error}
        </p>
      )}

      {/* Next booking */}
      {next ? (
        <NextBookingCard booking={next} token={token} onChanged={load} onNavigate={go} />
      ) : (
        <section className="dash-next empty">
          <h2>No upcoming bookings</h2>
          <p className="dash-next-meta">Find a carrel, discussion or seminar room for your next study session.</p>
          <div className="dash-actions">
            <button type="button" className="dash-button primary" onClick={() => go("rooms")}>
              Book a Room
            </button>
          </div>
        </section>
      )}

      {/* Stat tiles */}
      <div className="dash-stats">
        <button type="button" className="dash-stat" onClick={() => go("bookings")}>
          <span className="dash-stat-label">Upcoming bookings</span>
          <strong>{upcoming.length}</strong>
          <span className="dash-stat-hint">View all bookings →</span>
        </button>

        <button type="button" className="dash-stat" onClick={() => go("waiting-list")}>
          <span className="dash-stat-label">Waiting list</span>
          <strong>{waiting ? `#${waiting.position}` : "None"}</strong>
          <span className="dash-stat-hint">{waiting ? `for ${waiting.room}` : "Join a queue →"}</span>
        </button>

        <button type="button" className="dash-stat" onClick={() => go("rooms")}>
          <span className="dash-stat-label">Rooms free now</span>
          <strong>
            {freeNow}
            <small> / {totalRooms}</small>
          </strong>
          <span className="dash-stat-hint">Browse rooms →</span>
        </button>
      </div>

      <div className="dash-columns">
        {/* Left column */}
        <div className="dash-column">
          <section className="dash-card">
            <h3>Quick actions</h3>
            <div className="dash-quick">
              <button type="button" onClick={() => go("rooms")}>
                <span aria-hidden="true">▦</span>
                <div>
                  <strong>Book a Room</strong>
                  <small>Carrel, discussion or seminar room</small>
                </div>
              </button>
              <button type="button" onClick={() => go("waiting-list")}>
                <span aria-hidden="true">◷</span>
                <div>
                  <strong>Join Waiting List</strong>
                  <small>Get the next free room today</small>
                </div>
              </button>
              <button type="button" onClick={() => go("feedback")}>
                <span aria-hidden="true">✎</span>
                <div>
                  <strong>Report an Issue</strong>
                  <small>Broken lamp, furniture, aircon…</small>
                </div>
              </button>
            </div>
          </section>

          <section className="dash-card">
            <h3>Room availability now</h3>
            <ul className="dash-availability">
              {availability.length === 0 && <li className="dash-empty">No rooms found.</li>}
              {availability.map((item) => (
                <li key={item.type}>
                  <div className="dash-availability-row">
                    <span>{item.type} rooms</span>
                    <span className={item.free === 0 ? "full" : ""}>
                      {item.total === 0
                        ? "None open"
                        : item.free === 0
                          ? "Fully booked"
                          : `${item.free} of ${item.total} free`}
                    </span>
                  </div>
                  <div className="dash-bar" aria-hidden="true">
                    <span style={{ width: `${item.total ? (item.free / item.total) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right column */}
        <div className="dash-column">
          <section className="dash-card">
            <h3>Notifications</h3>
            <ul className="dash-notifications">
              {notifications.length === 0 && <li className="dash-empty">No notifications yet.</li>}
              {notifications.map((item) => (
                <li key={item.id} className={item.read ? "" : "is-unread"}>
                  <span className={`dash-dot ${item.tone}`} aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                    {item.created_at && (
                      <time dateTime={item.created_at}>
                        {formatDate(item.created_at)} · {formatTime(item.created_at)}
                      </time>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="dash-card dash-rules">
            <h3>Room rules</h3>
            <ol>
              {rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <p className="dash-footnote">
        {USE_MOCK_AUTH
          ? "Demo mode: this is sample data. Set VITE_USE_MOCK_AUTH=false to see your real bookings."
          : `Live data from the PSZ database · last updated ${lastLoaded ? formatTime(lastLoaded.toISOString()) : "—"}.`}
      </p>
    </div>
  );
}