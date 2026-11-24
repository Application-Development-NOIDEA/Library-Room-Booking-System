import { useCallback, useEffect, useMemo, useState } from "react";
import "./BookRoom.css";
import { useAuth } from "../auth/AuthContext";
import { USE_MOCK_AUTH } from "../auth/authService";
import { createBooking, formatBookingDate, formatTimeRange, getAvailability } from "./bookingService";

const DAYS_AHEAD = 14;

/** Today and the next 13 days, as YYYY-MM-DD in the student's local (Malaysian) time. */
function upcomingDays() {
  const days = [];
  const today = new Date();
  for (let i = 0; i < DAYS_AHEAD; i += 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    days.push({
      iso,
      weekday: i === 0 ? "Today" : i === 1 ? "Tomorrow" : day.toLocaleDateString("en-GB", { weekday: "short" }),
      label: day.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    });
  }
  return days;
}

export default function BookRoom({ room, onBooked, onBack }) {
  const { token } = useAuth();
  const days = useMemo(upcomingDays, []);

  const [date, setDate] = useState(days[0].iso);
  const [duration, setDuration] = useState(null); // null = let the server pick the default
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const load = useCallback(async () => {
    if (!room || USE_MOCK_AUTH) return;
    setLoading(true);
    setLoadError("");
    try {
      const data = await getAvailability(token, room.id, date, duration);
      setAvailability(data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [room, token, date, duration]);

  useEffect(() => {
    load();
  }, [load]);

  function chooseDate(iso) {
    setDate(iso);
    setSelected(null);
    setSubmitError("");
  }

  function chooseDuration(hours) {
    setDuration(hours);
    setSelected(null);
    setSubmitError("");
  }

  async function confirm() {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const booking = await createBooking(token, {
        roomType: room.id,
        date,
        startTime: selected.start_time,
        duration: availability.duration,
      });
      onBooked?.(booking);
    } catch (err) {
      setSubmitError(err.message);
      setSelected(null);
      // Someone else took it (409) or the time just started (422): refresh the slot list
      if (err.status === 409 || err.status === 422) load();    } finally {
      setSubmitting(false);
    }
  }

  if (!room) {
    return (
      <div className="book-room">
        <section className="book-card book-empty">
          <h2>Choose a room first</h2>
          <p>Pick a room type on Browse Rooms, then press “Book this room”.</p>
          <button type="button" className="book-button primary" onClick={onBack}>
            Browse Rooms
          </button>
        </section>
      </div>
    );
  }

    // Slots that have already started are not shown at all
  const slots = (availability?.slots ?? []).filter((slot) => !slot.past);
  const openSlots = slots.filter((slot) => slot.available).length;

  return (
    <div className="book-room">
      <button type="button" className="book-back" onClick={onBack}>
        ← Back to Browse Rooms
      </button>

      <p className="page-eyebrow">BOOK A ROOM</p>
      <h1 className="page-title">{room.name}</h1>
      <p className="page-description">
        {room.description} {room.capacity ? `Up to ${room.capacity} ${room.capacity === 1 ? "person" : "people"}.` : ""}
      </p>

      {USE_MOCK_AUTH ? (
        <section className="book-card book-notice">
          <h2>Booking needs the real login</h2>
          <p>
            You're signed in with demo mode, so the server doesn't know who you are. In <code>frontend/.env.local</code>{" "}
            set <code>VITE_USE_MOCK_AUTH=false</code>, restart <code>npm run dev</code>, and sign in again.
          </p>
        </section>
      ) : (
        <>
          {/* 1. Date */}
          <section className="book-section">
            <h2>
              <span className="book-step">1</span> Choose a date
            </h2>
            <div className="book-days" role="radiogroup" aria-label="Date">
              {days.map((day) => (
                <button
                  key={day.iso}
                  type="button"
                  role="radio"
                  aria-checked={date === day.iso}
                  className={`book-day ${date === day.iso ? "is-selected" : ""}`}
                  onClick={() => chooseDate(day.iso)}
                >
                  <span>{day.weekday}</span>
                  <strong>{day.label}</strong>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Duration (hourly rooms only) */}
          {availability?.durations?.length > 1 && (
            <section className="book-section">
              <h2>
                <span className="book-step">2</span> How long?
              </h2>
              <div className="book-durations" role="radiogroup" aria-label="Duration">
                {availability.durations.map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    role="radio"
                    aria-checked={availability.duration === hours}
                    className={`book-duration ${availability.duration === hours ? "is-selected" : ""}`}
                    onClick={() => chooseDuration(hours)}
                  >
                    {hours} {hours === 1 ? "hour" : "hours"}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 3. Time slot */}
          <section className="book-section">
            <div className="book-section-heading">
              <h2>
                <span className="book-step">{availability?.durations?.length > 1 ? 3 : 2}</span> Pick a time
              </h2>
              {!loading && !loadError && (
                <span>
                  {openSlots} of {slots.length} slots open
                </span>
              )}
            </div>

            {loading ? (
              <p className="book-state">Checking which rooms are free…</p>
            ) : loadError ? (
              <div className="book-alert" role="alert">
                {loadError}{" "}
                <button type="button" className="book-link" onClick={load}>
                  Try again
                </button>
              </div>
                        ) : slots.length === 0 ? (
              <p className="book-state">No time slots left on this date. Please choose another date.</p>
            ) : (
              <div className="book-slots">
                {slots.map((slot) => {
                  const isSelected = selected?.start_time === slot.start_time;
                  const note = slot.past
                    ? "Started"
                    : slot.you_have_booking
                      ? "You're booked"
                      : slot.free === 0
                        ? "Full"
                        : `${slot.free} of ${slot.total} free`;
                  return (
                    <button
                      key={slot.start_time}
                      type="button"
                      className={`book-slot ${isSelected ? "is-selected" : ""} ${slot.free === 0 && !slot.past ? "is-full" : ""}`}
                      disabled={!slot.available}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelected(slot);
                        setSubmitError("");
                      }}
                    >
                      <strong>{formatTimeRange(slot.start_time, slot.end_time)}</strong>
                      <span>{note}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {submitError && (
            <div className="book-alert" role="alert">
              {submitError}
            </div>
          )}

          {/* Summary + confirm */}
          <section className={`book-summary ${selected ? "is-ready" : ""}`}>
            <div>
              <span className="book-summary-label">YOUR BOOKING</span>
              {selected ? (
                <strong>
                  {room.name} · {formatBookingDate(date)} · {formatTimeRange(selected.start_time, selected.end_time)}
                </strong>
              ) : (
                <strong className="muted">Pick a time slot above</strong>
              )}
              <p>A free room is assigned automatically. Check in within 15 minutes of the start time.</p>
            </div>
            <button
              type="button"
              className="book-button primary"
              disabled={!selected || submitting}
              onClick={confirm}
            >
              {submitting ? "Booking…" : "Confirm booking"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
