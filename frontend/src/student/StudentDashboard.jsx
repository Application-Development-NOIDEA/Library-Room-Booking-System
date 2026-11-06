import { useEffect, useState } from "react";
import "./StudentDashboard.css";

/* ---------- Sample data (replace with Supabase queries later) ---------- */

// Matches the sample bookings on the My Bookings page
const sampleBookings = [
  {
    id: "BK-001",
    room: "Discussion Room 01",
    type: "DISCUSSION ROOM",
    start: "2026-11-12T10:00:00",
    end: "2026-11-12T12:00:00",
  },
  {
    id: "BK-002",
    room: "Carrel Room 08",
    type: "CARREL ROOM",
    start: "2026-11-13T14:00:00",
    end: "2026-11-13T16:00:00",
  },
];

const sampleWaiting = { room: "Discussion Room 01", position: 2 };

const sampleAvailability = [
  { type: "Carrel", free: 3, total: 8 },
  { type: "Discussion", free: 1, total: 4 },
  { type: "Meeting", free: 0, total: 2 },
];

const sampleNotifications = [
  { id: 1, tone: "gold", title: "Booking confirmed", text: "Carrel Room 08 · 13 Nov, 2:00 PM. Your QR code is ready." },
  { id: 2, tone: "maroon", title: "Waiting list update", text: "You moved up to #2 for Discussion Room 01." },
  { id: 3, tone: "muted", title: "Reminder", text: "You'll get a reminder 30 minutes before each booking." },
];

const rules = [
  "Check in at the counter within 15 minutes of your start time, or the booking is cancelled.",
  "Show your QR code to collect the room key, and return it when you check out.",
  "Extensions are allowed only if nobody has booked the next slot.",
];

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

/* ---------- Page ---------- */

export default function StudentDashboard({ onNavigate, userName = "Student" }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const upcoming = sampleBookings
    .filter((booking) => new Date(booking.end) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const next = upcoming[0];

  const freeNow = sampleAvailability.reduce((sum, item) => sum + item.free, 0);
  const totalRooms = sampleAvailability.reduce((sum, item) => sum + item.total, 0);
  const firstName = userName.trim().split(/\s+/)[0];

  const go = (page) => onNavigate?.(page);

  return (
    <div className="student-dashboard">
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
        <span className="dash-preview">Sample data</span>
      </div>

      {/* Next booking */}
      {next ? (
        <section className="dash-next" aria-label="Your next booking">
          <div className="dash-next-top">
            <span className="dash-category">YOUR NEXT BOOKING · {next.type}</span>
            <span className="dash-pill">{startsIn(next.start, now)}</span>
          </div>

          <h2>{next.room}</h2>
          <p className="dash-next-meta">
            {formatDate(next.start)} · {formatTime(next.start)} – {formatTime(next.end)}
            <span> · Ref {next.id}</span>
          </p>

          <div className="dash-next-note">
            Check in at the library counter within 15 minutes of {formatTime(next.start)} or the room is
            released to the waiting list.
          </div>

          <div className="dash-actions">
            <button type="button" className="dash-button primary" onClick={() => go("bookings")}>
              View QR Code
            </button>
            <button type="button" className="dash-button secondary" onClick={() => go("bookings")}>
              Manage Bookings
            </button>
          </div>
        </section>
      ) : (
        <section className="dash-next empty">
          <h2>No upcoming bookings</h2>
          <p className="dash-next-meta">Find a carrel, discussion or meeting room for your next study session.</p>
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
          <strong>{sampleWaiting ? `#${sampleWaiting.position}` : "None"}</strong>
          <span className="dash-stat-hint">
            {sampleWaiting ? `for ${sampleWaiting.room}` : "Join a queue →"}
          </span>
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
                  <small>Carrel, discussion or meeting room</small>
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
              {sampleAvailability.map((item) => (
                <li key={item.type}>
                  <div className="dash-availability-row">
                    <span>{item.type} rooms</span>
                    <span className={item.free === 0 ? "full" : ""}>
                      {item.free === 0 ? "Fully booked" : `${item.free} of ${item.total} free`}
                    </span>
                  </div>
                  <div className="dash-bar" aria-hidden="true">
                    <span style={{ width: `${(item.free / item.total) * 100}%` }} />
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
              {sampleNotifications.map((item) => (
                <li key={item.id}>
                  <span className={`dash-dot ${item.tone}`} aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
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
        Frontend preview: bookings, availability and notifications are sample data until Supabase is connected.
      </p>
    </div>
  );
}