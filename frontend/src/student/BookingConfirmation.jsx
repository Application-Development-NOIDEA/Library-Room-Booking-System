import "./BookingConfirmation.css";
import { formatBookingDate, formatTimeRange } from "./bookingService";

/**
 * Shown right after a booking is made.
 * `booking` is the object returned by POST /api/bookings.
 */
export default function BookingConfirmation({ booking, onViewBookings, onBookAnother }) {
  if (!booking) {
    return (
      <div className="booking-confirmation">
        <h1>No booking to show</h1>
        <p className="confirm-sub">Make a booking from Browse Rooms and its details will appear here.</p>
        <div className="confirm-actions">
          <button type="button" className="btn-primary" onClick={onBookAnother}>
            Browse Rooms
          </button>
          <button type="button" className="btn-secondary" onClick={onViewBookings}>
            View My Bookings
          </button>
        </div>
      </div>
    );
  }

  const rows = [
    { label: "Reference", value: booking.reference },
    { label: "Room", value: booking.room_name + (booking.room_code ? ` (${booking.room_code})` : "") },
    { label: "Room type", value: booking.room_group },
    booking.location ? { label: "Location", value: booking.location } : null,
    { label: "Date", value: formatBookingDate(booking.date) },
    { label: "Time", value: formatTimeRange(booking.start_time, booking.end_time) },
    { label: "Status", value: "Confirmed", className: "status" },
  ].filter(Boolean);

  return (
    <div className="booking-confirmation">
      <div className="confirm-icon" aria-hidden="true">
        ✓
      </div>
      <h1>Booking confirmed</h1>
      <p className="confirm-sub">Your room is reserved. Keep the reference below for check-in.</p>

      <div className="confirm-card">
        {rows.map((row) => (
          <div className="confirm-row" key={row.label}>
            <span>{row.label}</span>
            <strong className={row.className}>{row.value}</strong>
          </div>
        ))}
      </div>

      <p className="confirm-note">
        Check in at the library counter within 15 minutes of the start time, or the booking is released to the waiting
        list.
      </p>

      <div className="confirm-actions">
        <button type="button" className="btn-primary" onClick={onViewBookings}>
          View My Bookings
        </button>
        <button type="button" className="btn-secondary" onClick={onBookAnother}>
          Book another room
        </button>
      </div>
    </div>
  );
}
