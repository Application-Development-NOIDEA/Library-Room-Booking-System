import { useState } from "react";
import "./MyBookings.css";

const sampleBookings = [
  {
    id: "BK-001",
    room: "Discussion Room 01",
    category: "Discussion Room",
    date: "12 November 2026",
    time: "10:00 AM – 12:00 PM",
    status: "Confirmed",
    tab: "Upcoming",
  },
  {
    id: "BK-002",
    room: "Carrel Room 08",
    category: "Carrel Room",
    date: "13 November 2026",
    time: "2:00 PM – 4:00 PM",
    status: "Confirmed",
    tab: "Upcoming",
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

export default function MyBookings() {
  const [activeTab, setActiveTab] = useState("Upcoming");
  const [bookings, setBookings] = useState(sampleBookings);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState("");

  const visibleBookings = bookings.filter(
    (booking) => booking.tab === activeTab
  );

  function cancelBooking(id) {
    setBookings((current) =>
      current.map((booking) =>
        booking.id === id
          ? { ...booking, status: "Cancelled", tab: "Cancelled" }
          : booking
      )
    );

    setDialog(null);
    setNotice("Sample booking cancelled. View it under Cancelled.");
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

        <span className="booking-preview-label">Sample data</span>
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

      <div className="booking-list">
        {visibleBookings.length === 0 ? (
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

                  <button
                    type="button"
                    className="booking-button cancel"
                    onClick={() =>
                      setDialog({ type: "cancel", booking })
                    }
                  >
                    Cancel Booking
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <p className="booking-footnote">
        Frontend preview. Changes are temporary and reset when the page
        reloads or this page is reopened.
      </p>

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
                This preview will move the booking to the Cancelled list.
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
                  onClick={() => cancelBooking(dialog.booking.id)}
                >
                  Confirm Cancellation
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}