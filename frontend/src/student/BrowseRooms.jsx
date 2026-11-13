import { useEffect, useMemo, useState } from "react";
import "./BrowseRooms.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");
const TYPES = ["All", "Study", "Discussion", "Meeting", "Events"];

export default function BrowseRooms({ onBook }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("All");
  const [bookableOnly, setBookableOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

      fetch(`${API_URL}/rooms`, { headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(`Server replied ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setRooms(data);
      })
      .catch((err) => {
        if (!cancelled) setError(`Could not load rooms (${err.message}). Is the back-end running?`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const visibleRooms = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rooms.filter((room) => {
      if (type !== "All" && room.type !== type) return false;
      if (bookableOnly && !room.bookable) return false;
      if (term && !`${room.name} ${room.description}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rooms, search, type, bookableOnly]);

  function handleBook(room) {
    if (onBook) {
      onBook(room);
    } else {
      setNotice(`The booking form for "${room.name}" is coming next.`);
    }
  }

  return (
    <div className="browse-rooms">
      <p className="page-eyebrow">STUDENT WORKSPACE</p>
      <h1 className="page-title">Browse Rooms</h1>
      <p className="page-description">
        Explore spaces for individual and group study at Perpustakaan Sultanah Zanariah.
      </p>

      <div className="rooms-toolbar">
        <input
          className="rooms-search"
          type="search"
          placeholder="Search rooms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="rooms-switch">
          <input
            type="checkbox"
            checked={bookableOnly}
            onChange={(e) => setBookableOnly(e.target.checked)}
          />
          Bookable only
        </label>
      </div>

      <div className="rooms-tabs">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`rooms-tab ${type === t ? "active" : ""}`}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {notice && (
        <div className="rooms-notice">
          {notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss">×</button>
        </div>
      )}

      {error && (
        <div className="rooms-notice">
          {error}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </div>
      )}

      {loading ? (
        <p className="rooms-count">Loading rooms...</p>
      ) : (
        <p className="rooms-count">
          {visibleRooms.length} {visibleRooms.length === 1 ? "room" : "rooms"} found
        </p>
      )}

      {!loading && !error && visibleRooms.length === 0 ? (
        <div className="rooms-empty">No rooms match your search. Try another filter.</div>
      ) : (
        <div className="rooms-grid">
          {visibleRooms.map((room) => (
            <article key={room.id} className="room-card">
              <div className="room-card-top">
                <span className={`room-type type-${room.type.toLowerCase()}`}>{room.type}</span>
                <span className={`room-status ${room.bookable ? "bookable" : "walk-in"}`}>
                  {room.bookable ? "Bookable" : "Walk-in / Events"}
                </span>
              </div>

              <h2>{room.name}</h2>
              <p className="room-desc">{room.description}</p>

              <dl className="room-facts">
                <div>
                  <dt>Capacity</dt>
                  <dd>
                    {room.capacity
                      ? `${room.capacity} ${room.capacity === 1 ? "seat" : "seats"}`
                      : "Open area"}
                  </dd>
                </div>
                <div>
                  <dt>Rooms</dt>
                  <dd>{room.total}</dd>
                </div>
                <div>
                  <dt>Slot</dt>
                  <dd>{room.slot}</dd>
                </div>
              </dl>

              <button
                type="button"
                className="room-book-btn"
                disabled={!room.bookable}
                onClick={() => handleBook(room)}
              >
                {room.bookable ? "Book this room" : "No booking needed"}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}