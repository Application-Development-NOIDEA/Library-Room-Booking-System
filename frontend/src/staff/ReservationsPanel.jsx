import { useCallback, useEffect, useMemo, useState } from 'react';
import { listStaffBookings } from './staffService';

const STATUSES = [
  ['', 'All statuses'],
  ['confirmed', 'Confirmed'],
  ['checked_in', 'Checked In'],
  ['checked_out', 'Checked Out'],
  ['cancelled', 'Cancelled'],
  ['no_show', 'No Show'],
  ['held', 'Held'],
];

const todayKL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const statusClass = (value) => `staff-status staff-status--${String(value).toLowerCase().replace(/[^a-z]+/g, '-')}`;

export default function ReservationsPanel({ token }) {
  const [date, setDate] = useState(todayKL());
  const [allDates, setAllDates] = useState(false);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listStaffBookings(token, { date, allDates, status });
      setBookings(data.bookings);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, date, allDates, status]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return bookings;
    return bookings.filter((b) =>
      [b.reference, b.student, b.matric, b.room_name, b.room_code, b.status_label]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [bookings, search]);

  return (
    <section className="staff-panel">
      <div className="staff-panel-heading">
        <h2>All Reservations</h2>
        <span className="staff-muted">{loading ? 'Loading…' : `${rows.length} shown`}</span>
      </div>

      <div className="staff-toolbar">
        <label>
          Date{' '}
          <input
            type="date"
            className="staff-input"
            value={date}
            disabled={allDates}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <label className="staff-check">
          <input type="checkbox" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} /> All dates
        </label>
        <select className="staff-input" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input
          aria-label="Search bookings"
          className="staff-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, matric, room, booking ID..."
        />
        <button type="button" className="staff-secondary" onClick={load}>Refresh</button>
      </div>

      {error && <div className="staff-notice" role="alert">{error}</div>}

      <div className="staff-table-scroll">
        <table className="staff-table">
          <thead>
            <tr>
              <th>Booking ID / Student</th>
              <th>Room</th>
              <th>Date</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.reference}</strong>
                    <small>{b.student}{b.matric ? ` · ${b.matric}` : ''}</small>
                  </td>
                  <td>
                    {b.room_name}
                    <small>{b.room_group}</small>
                  </td>
                  <td>{b.date}</td>
                  <td>{b.start_time}–{b.end_time}</td>
                  <td><span className={statusClass(b.status_label)}>{b.status_label}</span></td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5}>{loading ? 'Loading…' : 'No reservations match these filters.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}