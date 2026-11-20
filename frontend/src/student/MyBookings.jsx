import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import "./MyBookings.css";
import { useAuth } from "../auth/AuthContext";
import { USE_MOCK_AUTH } from "../auth/authService";
import {
  cancelBooking,
  formatBookingDate,
  formatTime,
  formatTimeRange,
  getBookingQr,
  listMyBookings,
  requestExtension,
} from "./bookingService";

const EXTENSION_HOURS = [1, 2];
const EXTENSION_WINDOW_MINUTES = 15; // same as BookingExtensionController::REQUEST_WINDOW_MINUTES

/** True during the last 15 minutes of a booking, when an extension can be requested. */
function inExtensionWindow(booking, now) {
  if (USE_MOCK_AUTH) return true;
  const end = Date.parse(booking.endAt);
  return now >= end - EXTENSION_WINDOW_MINUTES * 60 * 1000 && now < end;
}

/** "14:00" plus 2 hours -> "4:00 PM" */
function endAfter(endTime, hours) {
  const [h, m] = endTime.split(":").map(Number);
  return formatTime(`${String(h + hours).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
}

const sampleBookings = [
  {
    id: "BK-001",
    room: "Discussion Room 01",
    category: "Discussion Room",
    date: "12 November 2026",
    time: "10:00 AM – 12:00 PM",
    status: "Confirmed",
    tab: "Upcoming",
    canCancel: true,
  },
  {
    id: "BK-002",
    room: "Carrel Room 08",
    category: "Carrel Room",
    date: "13 November 2026",
    time: "2:00 PM – 4:00 PM",
    status: "Confirmed",
    tab: "Upcoming",
    canCancel: true,
  },
  {
    id: "BK-003",
    room: "Meeting Room 02",
    category: "Meeting Room",
    date: "4 November 2026",
    time: "9:00 AM – 11:00 AM",
    status: "Completed",
    tab: "Completed",
  },
  {
    id: "BK-004",
    room: "Discussion Room 03",
    category: "Discussion Room",
    date: "3 November 2026",
    time: "3:00 PM – 5:00 PM",
    status: "Cancelled",
    tab: "Cancelled",
  },
];

const STATUS_LABELS = {
  held: "Held",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

const TAB_NAMES = { upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled" };

/** Turns a booking from the API into the shape the cards below use. */
function toCard(booking) {
  const status =
    booking.tab === "completed" && booking.status === "confirmed" ? "Completed" : STATUS_LABELS[booking.status] ?? booking.status;
  return {
    id: booking.reference,
    apiId: booking.id,
    room: booking.room_name,
    category: booking.room_group ?? booking.room_type,
    date: formatBookingDate(booking.date),
    time: formatTimeRange(booking.start_time, booking.end_time),
    status,
    tab: TAB_NAMES[booking.tab] ?? "Upcoming",
    canCancel: booking.can_cancel,
    extendFrom: booking.extend_from, // null when it can't be extended at all
    endTime: booking.end_time,
    endAt: booking.end_at,
  };
}

export default function MyBookings() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("Upcoming");
  const [bookings, setBookings] = useState(USE_MOCK_AUTH ? sampleBookings : []);
  const [loading, setLoading] = useState(!USE_MOCK_AUTH);
  const [loadError, setLoadError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState("");
  const [qrState, setQrState] = useState({ loading: false, token: "", error: "" });
  const [extendHours, setExtendHours] = useState(1);
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState("");
  const [now, setNow] = useState(Date.now());

  // Re-check every 30 seconds, so the button turns on when the last 15 minutes start
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  const load = useCallback(async () => {
    if (USE_MOCK_AUTH) return;
    setLoading(true);
    setLoadError("");
    try {
      setBookings((await listMyBookings(token)).map(toCard));
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleBookings = bookings.filter(
    (booking) => booking.tab === activeTab
  );

  async function openQr(booking) {
    setDialog({ type: "qr", booking });
    if (USE_MOCK_AUTH) {
      setQrState({ loading: false, token: `DEMO-${booking.id}`, error: "" });
      return;
    }
    setQrState({ loading: true, token: "", error: "" });
    try {
      const data = await getBookingQr(token, booking.apiId);
      setQrState({ loading: false, token: data.qr_token ?? data.token ?? data.qr ?? "", error: "" });
    } catch (err) {
      setQrState({ loading: false, token: "", error: err.message });
    }
  }

  function openExtension(booking) {
    setExtendHours(1);
    setExtendError("");
    setDialog({ type: "extension", booking });
  }

  async function submitExtension(booking) {
    setExtendError("");
    if (USE_MOCK_AUTH) {
      setDialog(null);
      setNotice(`Sample booking extended by ${extendHours} hour${extendHours === 1 ? "" : "s"}.`);
      return;
    }

    setExtending(true);
    try {
      const data = await requestExtension(token, booking.apiId, extendHours);
      const updated = toCard(data.booking);
      setBookings((current) => current.map((item) => (item.apiId === updated.apiId ? updated : item)));
      setNotice(data.message);
      setDialog(null);
    } catch (err) {
      setExtendError(err.message); // e.g. someone has booked the next slot
    } finally {
      setExtending(false);
    }
  }

  async function cancelBookingCard(booking) {
    if (USE_MOCK_AUTH) {
      setBookings((current) =>
        current.map((item) =>
          item.id === booking.id ? { ...item, status: "Cancelled", tab: "Cancelled" } : item
        )
      );
      setDialog(null);
      setNotice("Sample booking cancelled. View it under Cancelled.");
      return;
    }

    setCancelling(true);
    try {
      const updated = toCard(await cancelBooking(token, booking.apiId));
      setBookings((current) => current.map((item) => (item.apiId === updated.apiId ? updated : item)));
      setNotice(`Booking ${updated.id} cancelled. The room is free for other students again.`);
      setDialog(null);
    } catch (err) {
      setNotice(err.message);
      setDialog(null);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="my-bookings">
      <div className="bookings-heading">
        <div>
          <p className="page-eyebrow">YOUR RESERVATIONS</p>
          <h1 className="page-title">My Bookings</h1>
          <p className="page-description">
            A little space for your next big idea.
            Manage your library reservations here.
          </p>
        </div>

        {USE_MOCK_AUTH && <span className="booking-preview-label">Sample data</span>}
      </div>

      <div className="booking-guidance">
        <span className="guidance-mark" aria-hidden="true">i</span>
        <p>
          Show your booking QR code at the library counter.
          Check in within 15 minutes of your booking start time.
        </p>
      </div>

      <div className="booking-filters" aria-label="Filter bookings">
        {["Upcoming", "Completed", "Cancelled"].map((tab) => {
          const count = bookings.filter(
            (booking) => booking.tab === tab
          ).length;

          return (
            <button
              key={tab}
              type="button"
              className={`booking-filter ${
                activeTab === tab ? "selected" : ""
              }`}
              aria-pressed={activeTab === tab}
              onClick={() => {
                setActiveTab(tab);
                setNotice("");
              }}
            >
              {tab}
              <span>{count}</span>
            </button>
          );
        })}
      </div>

      <p className="booking-notice" role="status">
        {notice}
      </p>

      {loadError && (
        <div className="booking-empty" role="alert">
          <h2>Couldn't load your bookings</h2>
          <p>{loadError}</p>
          <button type="button" className="booking-button secondary" onClick={load}>
            Try again
          </button>
        </div>
      )}

      <div className="booking-list">
        {loading ? (
          <div className="booking-empty">
            <p>Loading your bookings…</p>
          </div>
        ) : loadError ? null : visibleBookings.length === 0 ? (
          <div className="booking-empty">
            <h2>No {activeTab.toLowerCase()} bookings</h2>
            <p>Your reservations will appear here.</p>
          </div>
        ) : (
          visibleBookings.map((booking) => (
            <article className="booking-card" key={booking.id}>
              <div className="booking-card-top">
                <span className="booking-category">
                  {booking.category}
                </span>

                <span
                  className={`booking-status ${booking.status.toLowerCase()}`}
                >
                  <span aria-hidden="true">●</span>
                  {booking.status}
                </span>
              </div>

              <h2>{booking.room}</h2>
              <p className="booking-reference">
                Booking reference · {booking.id}
              </p>

              <dl className="booking-details">
                <div>
                  <dt>DATE</dt>
                  <dd>{booking.date}</dd>
                </div>

                <div>
                  <dt>TIME SLOT</dt>
                  <dd>{booking.time}</dd>
                </div>
              </dl>

              {booking.tab === "Upcoming" && (
                <div className="booking-actions">
                  <button
                    type="button"
                    className="booking-button primary"
                    onClick={() =>
                      openQr(booking)}
                  >
                    View QR
                    <span aria-hidden="true">↗</span>
                  </button>

                  {booking.extendFrom &&
                    (inExtensionWindow(booking, now) ? (
                      <button
                        type="button"
                        className="booking-button secondary"
                        onClick={() => openExtension(booking)}
                      >
                        Request Extension
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="booking-button secondary"
                        disabled
                        title="You can ask for more time in the last 15 minutes of your booking"
                      >
                        Extend from {formatTime(booking.extendFrom)}
                      </button>
                    ))}

                  {booking.canCancel && (
                  <button
                    type="button"
                    className="booking-button cancel"
                    onClick={() =>
                      setDialog({ type: "cancel", booking })
                    }
                  >
                    Cancel Booking
                  </button>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {USE_MOCK_AUTH && (
        <p className="booking-footnote">
          Demo login: these are sample bookings. Set VITE_USE_MOCK_AUTH=false
          and sign in to see your real bookings.
        </p>
      )}

      {dialog && (
        <div
          className="booking-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setDialog(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setDialog(null);
          }}
        >
          <section
            className="booking-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-dialog-title"
          >
            <p className="page-eyebrow">{dialog.booking.id}</p>

            <h2 id="booking-dialog-title">
              {dialog.type === "cancel"
                ? "Cancel this booking?"
                : dialog.type === "qr"
                  ? "Booking QR"
                  : "Booking extension"}
            </h2>

            <p className="modal-room">{dialog.booking.room}</p>

            {dialog.type === "cancel" ? (
              <p>
                The room will be released so other students can book it.
                This can't be undone.
              </p>
           
) : dialog.type === "qr" ? (
  <div className="qr-placeholder">
    {qrState.loading ? (
      <p>Generating your booking QR code...</p>
    ) : qrState.error ? (
      <p role="alert">{qrState.error}</p>
    ) : qrState.token ? (
      <>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            margin: "16px 0",
          }}
        >
          <QRCodeSVG
            value={qrState.token}
            size={220}
            level="M"
            marginSize={4}
          />
        </div>

        <strong>{dialog.booking.id}</strong>

        <p>
          Show this QR code to library staff
          when checking in.
        </p>

        <small>
          Keep this QR code private.
          Generating another one invalidates this code.
        </small>
      </>
    ) : (
      <p>QR code is unavailable.</p>
    )}
  </div>
) : (

              <div className="extension-form">
                <p>
                  Currently {dialog.booking.time}. You get up to 2 more hours straight away if the room is free
                  and nobody on the waiting list needs it.
                </p>
                <div className="extension-options" role="radiogroup" aria-label="How much longer?">
                  {EXTENSION_HOURS.map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      role="radio"
                      aria-checked={extendHours === hours}
                      className={`extension-option ${extendHours === hours ? "selected" : ""}`}
                      onClick={() => {
                        setExtendHours(hours);
                        setExtendError("");
                      }}
                    >
                      <strong>+{hours} hour{hours === 1 ? "" : "s"}</strong>
                      <span>until {endAfter(dialog.booking.endTime, hours)}</span>
                    </button>
                  ))}
                </div>
                {extendError && (
                  <p className="extension-error" role="alert">
                    {extendError}
                  </p>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button
                autoFocus
                type="button"
                className="booking-button secondary"
                onClick={() => setDialog(null)}
              >
                {dialog.type === "cancel" ? "Keep Booking" : "Close"}
              </button>

              {dialog.type === "cancel" && (
                <button
                  type="button"
                  className="booking-button primary"
                  disabled={cancelling}
                  onClick={() => cancelBookingCard(dialog.booking)}
                >
                  {cancelling ? "Cancelling…" : "Confirm Cancellation"}
                </button>
              )}

              {dialog.type === "extension" && (
                <button
                  type="button"
                  className="booking-button primary"
                  disabled={extending}
                  onClick={() => submitExtension(dialog.booking)}
                >
                  {extending ? "Checking..." : "Request Extension"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}