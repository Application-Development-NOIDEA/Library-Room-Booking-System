import './BookingConfirmation.css';

// Temporary sample data. Replace with real data once the back-end works.
const sampleBooking = {
  reference: 'BK-0001',
  room: 'Discussion Room 3',
  floor: 'Level 2',
  date: '2026-11-15',
  time: '10:00 - 12:00',
  people: 4,
  status: 'Confirmed',
};

export default function BookingConfirmation({
  booking = sampleBooking,
  userName,
  onViewBookings,
  onBookAnother,
}) {
  return (
    <div className="booking-confirmation">
      <div className="confirm-icon">✓</div>
      <h1>Booking confirmed</h1>
      <p className="confirm-sub">
        Your room is reserved. Keep the reference below for check-in.
      </p>

      <div className="confirm-card">
        <div className="confirm-row"><span>Reference</span><strong>{booking.reference}</strong></div>
        <div className="confirm-row"><span>Room</span><strong>{booking.room} ({booking.floor})</strong></div>
        <div className="confirm-row"><span>Date</span><strong>{booking.date}</strong></div>
        <div className="confirm-row"><span>Time</span><strong>{booking.time}</strong></div>
        <div className="confirm-row"><span>People</span><strong>{booking.people}</strong></div>
        <div className="confirm-row"><span>Status</span><strong className="status">{booking.status}</strong></div>
      </div>

      <div className="confirm-actions">
        <button className="btn-primary">View My Bookings</button>
        <button className="btn-secondary">Book another room</button>
      </div>
    </div>
  );
}