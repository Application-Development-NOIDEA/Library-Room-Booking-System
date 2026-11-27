import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "./RoomList.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");

const STATUS = {
  free: { label: "Free now", className: "is-free" },
  in_use: { label: "In use", className: "is-busy" },
  closed: { label: "Closed", className: "is-closed" },
};

/**
 * Browse Rooms: the list of individual rooms of one type (used for Carrel Rooms),
 * with who-is-free-now, before the student presses "Book this room".
 */
export default function RoomList({ type }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !token) return undefined;
    let cancelled = false;
    setError("");
    fetch(`${API_URL}/room-list/${encodeURIComponent(type)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`(${res.status})`))))
      .then((json) => !cancelled && setData(json))
      .catch(() => !cancelled && setError("Couldn't load the list. Try again in a moment."));
    return () => {
      cancelled = true;
    };
  }, [open, token, type]);

  return (
    <div className="room-list">
      <button type="button" className="room-list-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{open ? "Hide the list of carrels" : "See all carrels"}</span>
        {data && (
          <small>
            {data.free} of {data.total} free now
          </small>
        )}
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="room-list-body">
          {error && <p className="room-list-note">{error}</p>}
          {!error && !data && <p className="room-list-note">Loading…</p>}

          {data && (
            <>
              <ul>
                {data.rooms.map((room) => {
                  const status = STATUS[room.status] ?? STATUS.closed;
                  return (
                    <li key={room.id}>
                      <div>
                        <strong>{room.room_name}</strong>
                        <small>
                          {room.room_code}
                          {room.location ? ` · ${room.location}` : ""}
                        </small>
                      </div>
                      <div className="room-list-status">
                        <span className={`room-list-badge ${status.className}`}>{status.label}</span>
                        {room.status === "in_use" && room.free_at && <small>free at {room.free_at}</small>}
                        {room.status === "free" && room.next_booking_at && <small>booked from {room.next_booking_at}</small>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="room-list-note">
                When you book, you get a free carrel for the time you pick. This list only shows right now.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}