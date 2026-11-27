import { useEffect, useState } from "react";
import { USE_MOCK_AUTH } from "../auth/authService";
import { cancelBooking, requestExtension } from "./bookingService";
import BookingQr from "./BookingQr";
import "./NextBookingCard.css";

const CHECK_IN_MINUTES = 15; // after the start, before the room goes to the waiting list
const EXTEND_WINDOW_MINUTES = 15; // extensions open in the last 15 minutes
const CLOSING_HOUR = 22; // library closes at 10 PM
const TZ = "Asia/Kuala_Lumpur";

/* ---------- Time helpers ---------- */

function clock(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
}

function day(date) {
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
}

/** 2h 05m / 12:34 / 45s: the closer it is, the more precise. */
function countdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `${s}s`;
}

function hourInMalaysia(date) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(date));
}

/** Which stage the booking is in right now. */
function stageOf(booking, now) {
  const start = new Date(booking.start);
  const end = new Date(booking.end);
  const checkInEnds = new Date(start.getTime() + CHECK_IN_MINUTES * 60000);

  if (booking.status === "held") return "offer";
  if (now >= end) return "ended";
  if (booking.status === "checked_in") return "in-use";
  if (now < start) return "upcoming";
  if (now < checkInEnds) return "check-in";
  return "late";
}

/* ---------- Card ---------- */

/**
 * Student Dashboard: the live "next booking" card.
 * Counts down to the start, then to the end of the check-in window, then to the end
 * of the booking, and lets the student show the QR, extend or cancel right here.
 */
export default function NextBookingCard({ booking, token, onChanged, onNavigate }) {
  const [now, setNow] = useState(() => new Date());
  const [panel, setPanel] = useState(null); // null | "qr" | "extend" | "cancel"
  const [hours, setHours] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { tone: "ok" | "error", text }

  // A live clock, once a second
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Close any open panel when the next booking changes (e.g. after cancelling)
  useEffect(() => {
    setPanel(null);
  }, [booking.booking_id, booking.id]);

  const start = new Date(booking.start);
  const end = new Date(booking.end);
  const stage = stageOf(booking, now);
  const apiId = booking.booking_id;

  const extendOpensAt = new Date(end.getTime() - EXTEND_WINDOW_MINUTES * 60000);
  const canExtend =
    ["confirmed", "checked_in"].includes(booking.status) && now >= extendOpensAt && now < end;
  const maxExtra = Math.min(2, CLOSING_HOUR - hourInMalaysia(end));

  /* What to show for each stage: label, big countdown, progress (0-1), and a hint */
  let view;
  if (stage === "upcoming") {
    view = {
      label: "Starts in",
      big: countdown(start - now),
      progress: null,
      hint: `Check in at the counter between ${clock(start)} and ${clock(new Date(start.getTime() + CHECK_IN_MINUTES * 60000))}.`,
    };
  } else if (stage === "check-in") {
    const left = start.getTime() + CHECK_IN_MINUTES * 60000 - now.getTime();
    view = {
      label: "Check in within",
      big: countdown(left),
      progress: left / (CHECK_IN_MINUTES * 60000),
      tone: "urgent",
      hint: "Show your QR code at the counter now, or the room goes to the waiting list.",
    };
  } else if (stage === "in-use") {
    view = {
      label: "Time left",
      big: countdown(end - now),
      progress: (end - now) / (end - start),
      hint: canExtend
        ? "Need more time? You can extend now if nobody has booked the next slot."
        : `You can ask for more time from ${clock(extendOpensAt)}.`,
    };
  } else if (stage === "offer") {
    view = {
      label: "Room offered to you",
      big: "Accept it",
      progress: null,
      tone: "urgent",
      hint: "A room from the waiting list is being held for you. Accept it on the Waiting List page.",
    };
  } else if (stage === "late") {
    view = {
      label: "Check-in window passed",
      big: "—",
      progress: 0,
      tone: "urgent",
      hint: "Go to the counter now. If staff haven't released the room yet, they can still check you in.",
    };
  } else {
    view = { label: "Ended", big: "Done", progress: 0, hint: "This booking has ended." };
  }

  function openQr() {
    setPanel("qr");
  }

  async function run(task, okText) {
    setBusy(true);
    setMessage(null);
    try {
      const result = USE_MOCK_AUTH || !apiId ? null : await task();
      setMessage({ tone: "ok", text: result?.message ?? okText });
      setPanel(null);
      onChanged?.();
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const extend = () => run(() => requestExtension(token, apiId, hours), `Extended by ${hours} hour${hours === 1 ? "" : "s"}.`);
  const cancel = () => run(() => cancelBooking(token, apiId), "Booking cancelled.");

  return (
    <section className={`next-card stage-${stage} ${view.tone === "urgent" ? "is-urgent" : ""}`} aria-label="Your next booking">
      <div className="next-card-top">
        <span className="next-card-type">YOUR NEXT BOOKING · {booking.type}</span>
        <span className="next-card-ref">{booking.id}</span>
      </div>

      <div className="next-card-main">
        <div>
          <h2>{booking.room}</h2>
          <p className="next-card-when">
            {day(start)} · {clock(start)} – {clock(end)}
            {booking.status === "checked_in" && <span className="next-card-badge">Checked in</span>}
          </p>
        </div>

        <div className="next-card-timer" aria-live="polite">
          <span>{view.label}</span>
          <strong>{view.big}</strong>
        </div>
      </div>

      {view.progress !== null && (
        <div
          className="next-card-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.max(0, Math.min(1, view.progress)) * 100)}
        >
          <div style={{ width: `${Math.max(0, Math.min(1, view.progress)) * 100}%` }} />
        </div>
      )}

      <p className="next-card-hint">{view.hint}</p>

      {message && (
        <p className={`next-card-message ${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      {/* Actions */}
      <div className="next-card-actions">
        {stage === "offer" ? (
          <button type="button" className="next-btn primary" onClick={() => onNavigate?.("waiting-list")}>
            Go to Waiting List
          </button>
        ) : (
          <>
            {stage !== "ended" && (
              <button type="button" className="next-btn primary" onClick={openQr}>
                View QR Code
              </button>
            )}
            {canExtend && maxExtra >= 1 && (
              <button type="button" className="next-btn" onClick={() => setPanel(panel === "extend" ? null : "extend")}>
                Extend
              </button>
            )}
            {stage === "upcoming" && (
              <button type="button" className="next-btn" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>
                Cancel
              </button>
            )}
            <button type="button" className="next-btn ghost" onClick={() => onNavigate?.("bookings")}>
              All bookings →
            </button>
          </>
        )}
      </div>

      {/* Panels */}
      {panel === "qr" && (
        <div className="next-card-panel qr">
          <BookingQr
            key={booking.id}
            token={token}
            bookingId={USE_MOCK_AUTH ? null : apiId}
            reference={booking.id}
            size={180}
            onStatusChange={() => onChanged?.()}
          />
          <button type="button" className="next-btn ghost" onClick={() => setPanel(null)}>
            Close
          </button>
        </div>
      )}

      {panel === "extend" && (
        <div className="next-card-panel">
          <p>How much more time?</p>
          <div className="next-card-choices">
            {[1, 2].filter((h) => h <= maxExtra).map((h) => (
              <button
                key={h}
                type="button"
                className={`next-choice ${hours === h ? "is-selected" : ""}`}
                onClick={() => setHours(h)}
              >
                +{h} hour{h === 1 ? "" : "s"}
                <small>until {clock(new Date(end.getTime() + h * 3600000))}</small>
              </button>
            ))}
          </div>
          <div className="next-card-actions">
            <button type="button" className="next-btn primary" onClick={extend} disabled={busy}>
              {busy ? "Checking…" : "Request extension"}
            </button>
            <button type="button" className="next-btn ghost" onClick={() => setPanel(null)} disabled={busy}>
              Not now
            </button>
          </div>
        </div>
      )}

      {panel === "cancel" && (
        <div className="next-card-panel">
          <p>Cancel this booking? The room goes to the next student on the waiting list.</p>
          <div className="next-card-actions">
            <button type="button" className="next-btn danger" onClick={cancel} disabled={busy}>
              {busy ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button type="button" className="next-btn ghost" onClick={() => setPanel(null)} disabled={busy}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </section>
  );
}