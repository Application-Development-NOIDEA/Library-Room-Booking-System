import { useCallback, useEffect, useState } from "react";
import "./MyBookings.css";
import { useAuth } from "../auth/AuthContext";
import { USE_MOCK_AUTH } from "../auth/authService";
import { cancelBooking, formatBookingDate, formatTimeRange, listMyBookings } from "./bookingService";

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
                      setDialog({ type: "qr", booking })
                    }
                  >
                    View QR
                    <span aria-hidden="true">↗</span>
                  </button>

                  <button
                    type="button"
                    className="booking-button secondary"
                    onClick={() =>
                      setDialog({ type: "extension", booking })
                    }
                  >
                    Request Extension
                  </button>

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
                <strong>QR code pending integration</strong>
                <span>
                  A booking-specific QR code will be provided by the
                  QR feature.
                </span>
              </div>
            ) : (
              <p>
                Extensions depend on room availability and queue priority.
                Availability checking and request submission will be
                connected to the backend later.
              </p>
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
            </div>
          </section>
        </div>
      )}
    </div>
  );
}