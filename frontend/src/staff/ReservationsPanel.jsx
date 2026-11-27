import { useCallback, useEffect, useMemo, useState } from 'react';
import { listStaffBookings, staffApi, staffManageApi } from './staffService';
import './ReservationsPanel.css';

const STATUSES = [
  ['', 'All statuses'],
  ['confirmed', 'Confirmed'],
  ['checked_in', 'Checked In'],
  ['checked_out', 'Checked Out'],
  ['cancelled', 'Cancelled'],
  ['no_show', 'No Show'],
  ['held', 'Held / Closed'],
];

const todayKL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const statusClass = (value) => `staff-status staff-status--${String(value).toLowerCase().replace(/[^a-z]+/g, '-')}`;

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const EMPTY_FORM = { matric: '', room_id: '', date: todayKL(), start: '10:00', end: '12:00' };

/**
 * Staff "All Reservations": the table of bookings, plus
 * add / edit / cancel a booking, check in / out / no-show, and close a room for a period.
 */
export default function ReservationsPanel({ token }) {
  const [date, setDate] = useState(todayKL());
  const [allDates, setAllDates] = useState(false);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [rooms, setRooms] = useState([]);
  const [closures, setClosures] = useState([]);
  const [form, setForm] = useState(null); // null | { mode: 'add' | 'edit' | 'close', id?, ...fields }
  const [cancelling, setCancelling] = useState(null); // { id, reason }
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { tone, text }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, closed] = await Promise.all([
        listStaffBookings(token, { date, allDates, status }),
        staffManageApi.closures(token),
      ]);
      setBookings(list.bookings);
      setClosures(closed.closures);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, date, allDates, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    staffManageApi
      .roomOptions(token)
      .then((data) => setRooms(data.rooms))
      .catch(() => setRooms([]));
  }, [token]);

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

  const roomGroups = useMemo(() => {
    const groups = {};
    rooms.forEach((r) => {
      (groups[r.group] ??= []).push(r);
    });
    return Object.entries(groups);
  }, [rooms]);

  /* ---------- actions ---------- */

  async function run(task, okText) {
    setBusy(true);
    setNotice(null);
    try {
      const data = await task();
      setNotice({ tone: 'ok', text: data?.message ?? okText });
      setForm(null);
      setCancelling(null);
      await load();
    } catch (e) {
      setNotice({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  function openAdd() {
    setCancelling(null);
    setNotice(null);
    setForm({ mode: 'add', ...EMPTY_FORM, room_id: rooms[0]?.id ?? '' });
  }

  function openClose() {
    setCancelling(null);
    setNotice(null);
    setForm({ mode: 'close', ...EMPTY_FORM, room_id: rooms[0]?.id ?? '', start: '08:00', end: '22:00' });
  }

  function openEdit(b) {
    setCancelling(null);
    setNotice(null);
    setForm({ mode: 'edit', id: b.id, reference: b.reference, student: b.student, checkedIn: b.status === 'checked_in',
      room_id: b.room_id, date: b.date, start: b.start_time, end: b.end_time });
  }

  function submitForm(event) {
    event.preventDefault();
    const body = { room_id: Number(form.room_id), date: form.date, start: form.start, end: form.end };
    if (form.mode === 'add') return run(() => staffManageApi.addBooking(token, { ...body, matric: form.matric.trim() }));
    if (form.mode === 'edit') return run(() => staffManageApi.editBooking(token, form.id, body));
    return run(() => staffManageApi.closeRoom(token, body));
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const maxDate = form?.mode === 'close' ? addDays(todayKL(), 60) : addDays(todayKL(), 6);

  /* ---------- render ---------- */

  return (
    <section className="staff-panel reservations-panel">
      <div className="staff-panel-heading">
        <h2>All Reservations</h2>
        <div className="res-head-actions">
          <button type="button" className="staff-primary" onClick={openAdd}>+ Add booking</button>
          <button type="button" className="staff-secondary" onClick={openClose}>Close a room</button>
        </div>
      </div>

      {notice && (
        <div className={`res-notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {/* Add / edit / close form */}
      {form && (
        <form className="res-form" onSubmit={submitForm}>
          <h3>
            {form.mode === 'add' && 'Add a booking for a student'}
            {form.mode === 'edit' && `Edit ${form.reference} · ${form.student}`}
            {form.mode === 'close' && 'Close a room for a period'}
          </h3>
          {form.mode === 'close' && (
            <p className="res-hint">Students can't book the room during this time. Existing bookings must be moved or cancelled first.</p>
          )}

          <div className="res-form-grid">
            {form.mode === 'add' && (
              <label>
                Student matric no.
                <input className="staff-input" value={form.matric} onChange={set('matric')} placeholder="e.g. A24CS0032" required />
              </label>
            )}
            <label>
              Room
              <select className="staff-input" value={form.room_id} onChange={set('room_id')} required disabled={form.checkedIn}>
                {roomGroups.map(([group, list]) => (
                  <optgroup key={group} label={group}>
                    {list.map((r) => (
                      <option key={r.id} value={r.id} disabled={r.status !== 'active'}>
                        {r.name} ({r.code}){r.status !== 'active' ? ' · maintenance' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              Date
              <input className="staff-input" type="date" value={form.date} min={todayKL()} max={maxDate} onChange={set('date')} required />
            </label>
            <label>
              From
              <input className="staff-input" type="time" value={form.start} min="08:00" max="22:00" step="900" onChange={set('start')} required />
            </label>
            <label>
              To
              <input className="staff-input" type="time" value={form.end} min="08:00" max="22:00" step="900" onChange={set('end')} required />
            </label>
          </div>

          <div className="res-form-actions">
            <button type="submit" className="staff-primary" disabled={busy}>
              {busy ? 'Saving…' : form.mode === 'close' ? 'Close the room' : form.mode === 'add' ? 'Add booking' : 'Save changes'}
            </button>
            <button type="button" className="staff-secondary" onClick={() => setForm(null)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}

      {/* Upcoming closures */}
      {closures.length > 0 && (
        <div className="res-closures">
          <h3>Rooms closed by staff</h3>
          <ul>
            {closures.map((c) => (
              <li key={c.id}>
                <span>
                  <strong>{c.room_name}</strong> · {c.date} · {c.start_time}–{c.end_time}
                </span>
                <button type="button" className="res-link" disabled={busy}
                  onClick={() => run(() => staffManageApi.reopen(token, c.id))}>
                  Reopen
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="staff-toolbar">
        <label>
          Date{' '}
          <input type="date" className="staff-input" value={date} disabled={allDates}
            onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label className="staff-check">
          <input type="checkbox" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} /> All dates
        </label>
        <select className="staff-input" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input aria-label="Search bookings" className="staff-input" value={search}
          onChange={(e) => setSearch(e.target.value)} placeholder="Search name, matric, room, booking ID..." />
        <button type="button" className="staff-secondary" onClick={load}>Refresh</button>
      </div>

      {error && <div className="staff-notice" role="alert">{error}</div>}
      <p className="staff-muted res-count">{loading ? 'Loading…' : `${rows.length} shown`}</p>

      <div className="staff-table-scroll">
        <table className="staff-table">
          <thead>
            <tr>
              <th>Booking ID / Student</th>
              <th>Room</th>
              <th>Date</th>
              <th>Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((b) => (
                <tr key={b.id} className={b.is_closure ? 'res-row-closure' : ''}>
                  <td>
                    <strong>{b.reference}</strong>
                    <small>{b.is_closure ? 'Closed by staff' : `${b.student ?? ''}${b.matric ? ` · ${b.matric}` : ''}`}</small>
                  </td>
                  <td>
                    {b.room_name}
                    <small>{b.room_group}</small>
                  </td>
                  <td>{b.date}</td>
                  <td>{b.start_time}–{b.end_time}</td>
                  <td>
                    <span className={statusClass(b.is_closure ? 'maintenance' : b.status_label)}>
                      {b.is_closure ? 'Closed' : b.status_label}
                    </span>
                  </td>
                  <td>
                    {cancelling?.id === b.id ? (
                      <div className="res-cancel">
                        <input className="staff-input" placeholder="Reason (optional)" value={cancelling.reason}
                          onChange={(e) => setCancelling({ ...cancelling, reason: e.target.value })} />
                        <button type="button" className="res-link danger" disabled={busy}
                          onClick={() => run(() => staffManageApi.cancelBooking(token, b.id, cancelling.reason))}>
                          Yes, cancel
                        </button>
                        <button type="button" className="res-link" onClick={() => setCancelling(null)}>Keep</button>
                      </div>
                    ) : (
                      <div className="res-actions">
                        {b.is_closure && b.status === 'held' && (
                          <button type="button" className="res-link" disabled={busy}
                            onClick={() => run(() => staffManageApi.reopen(token, b.id))}>Reopen</button>
                        )}
                        {!b.is_closure && b.status === 'confirmed' && (
                          <>
                            <button type="button" className="res-link" disabled={busy}
                              onClick={() => run(() => staffApi.checkIn(token, b.id))}>Check in</button>
                            <button type="button" className="res-link" disabled={busy}
                              onClick={() => run(() => staffApi.noShow(token, b.id))}>No-show</button>
                          </>
                        )}
                        {!b.is_closure && b.status === 'checked_in' && (
                          <button type="button" className="res-link" disabled={busy}
                            onClick={() => run(() => staffApi.checkOut(token, b.id))}>Check out</button>
                        )}
                        {!b.is_closure && ['confirmed', 'checked_in'].includes(b.status) && (
                          <button type="button" className="res-link" disabled={busy} onClick={() => openEdit(b)}>Edit</button>
                        )}
                        {!b.is_closure && ['confirmed', 'held'].includes(b.status) && (
                          <button type="button" className="res-link danger" disabled={busy}
                            onClick={() => { setForm(null); setCancelling({ id: b.id, reason: '' }); }}>Cancel</button>
                        )}
                        {!(b.is_closure && b.status === 'held') && !['confirmed', 'checked_in', 'held'].includes(b.status) && (
                          <span className="staff-muted">—</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6}>{loading ? 'Loading…' : 'No reservations match these filters.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}