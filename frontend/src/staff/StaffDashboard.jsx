import { useCallback, useEffect, useMemo, useState } from 'react';
import ReservationsPanel from './ReservationsPanel';
import CameraQrScanner from './CameraQrScanner';
import { staffApi } from './staffService';
import { tokenStore } from '../auth/authService';
import './StaffDashboard.css';

const NAVIGATION = [
  ['dashboard', '▦', 'Dashboard'],
  ['reservations', '▤', 'Reservations'],
  ['checkin', '▣', 'QR / Check-in Desk'],
  ['rooms', '▥', 'Room Management'],
  ['waitlist', '◷', 'Waiting List'],
  ['extensions', '↗', 'Extensions'],
  ['reports', '✎', 'Issue Reports'],
  ['analyzer', '✦', 'AI Report Analyzer'],
];

const STATUS_LABELS = {
  confirmed: 'Confirmed', held: 'Held', checked_in: 'Checked In', checked_out: 'Checked Out',
  cancelled: 'Cancelled', no_show: 'No Show', waiting: 'Waiting', offered: 'Offered',
  fulfilled: 'Fulfilled', expired: 'Expired', submitted: 'Submitted', in_progress: 'In Progress',
  resolved: 'Resolved', active: 'Active', maintenance: 'Maintenance', pending: 'Pending',
  approved: 'Approved', rejected: 'Rejected',
};

const label = (status) => STATUS_LABELS[status] ?? status;
const statusClass = (status) =>
  `staff-status staff-status--${String(label(status)).toLowerCase().replace(/[^a-z]+/g, '-')}`;

const CATEGORY_OPTIONS = [
  ['lighting', 'Lighting'], ['air_conditioning', 'Air conditioning'], ['furniture', 'Furniture'],
  ['power', 'Power'], ['display', 'Display'], ['wifi', 'Wi-Fi'],
  ['cleanliness', 'Cleanliness'], ['other', 'Other'],
];
const SEVERITY_OPTIONS = ['low', 'medium', 'high'];
const AI_STATE_LABELS = { auto_accepted: 'AI accepted', needs_review: 'Needs review', staff_reviewed: 'Staff reviewed' };
const REASON_LABELS = {
  ai_error: 'The AI was unavailable',
  invalid_output: 'The AI gave an invalid answer',
  low_confidence: 'The AI was not confident',
};
const categoryLabel = (id) => CATEGORY_OPTIONS.find(([value]) => value === id)?.[1] ?? id;

/* Current time in Kuala Lumpur as HH:MM, for the walk-in form defaults */
function nowKL() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date());
}

function defaultWalkIn() {
  const start = nowKL();
  const endHour = Math.min(Number(start.slice(0, 2)) + 2, 23);
  const end = endHour === 23 && Number(start.slice(0, 2)) >= 22 ? '23:59' : `${String(endHour).padStart(2, '0')}:${start.slice(3)}`;
  return { matric: '', room_id: '', start, end };
}

function Stat({ label: title, value, helper }) {
  return (
    <div className="staff-stat">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function BookingTable({ bookings, onSelect }) {
  return (
    <div className="staff-table-scroll">
      <table className="staff-table">
        <thead>
          <tr>
            <th>Booking / Student</th>
            <th>Room</th>
            <th>Time</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 ? (
            <tr><td colSpan={5}>No bookings for today.</td></tr>
          ) : (
            bookings.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.reference}</strong>
                  <small>{b.student}{b.matric ? ` · ${b.matric}` : ''}</small>
                </td>
                <td>{b.room_code}</td>
                <td>{b.start_time}–{b.end_time}</td>
                <td><span className={statusClass(b.status)}>{label(b.status)}</span></td>
                <td>
                  <button className="staff-mini-button" type="button" onClick={() => onSelect(b)}>
                    Open
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function StaffDashboard({ token, user }) {
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState({ bookings: [], rooms: [], waitlist: [], extensions: [], reports: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState({ pending_count: 0, items: [] });
  const [drafts, setDrafts] = useState({});

  const [qrInput, setQrInput] = useState('');
  const [selected, setSelected] = useState(null);
  const [walkIn, setWalkIn] = useState(defaultWalkIn);
  const [summary, setSummary] = useState(null);

    const load = useCallback(async () => {
    try {
      const [snapshot, reviewQueue] = await Promise.all([
        staffApi.dashboard(token),
        staffApi.reviewQueue(token),
      ]);
      setData(snapshot);
      setQueue(reviewQueue);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  /* Run a staff action, show the result, then refresh everything from the server. */
  async function act(task, okMessage) {
    setBusy(true);
    setNotice('');
    try {
      const result = await task();
      setNotice(typeof okMessage === 'function' ? okMessage(result) : okMessage);
      await load();
      return result;
    } catch (err) {
      setNotice(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const lookup = useCallback(
    async (query) => {
      const value = query.trim();
      if (!value) return;
      setBusy(true);
      try {
        const { booking } = await staffApi.lookup(token, value);
        setSelected(booking);
        setNotice('');
      } catch (err) {
        setSelected(null);
        setNotice(err.message);
      } finally {
        setBusy(false);
      }
    },
    [token]
  );

  // Stable function, so the camera is not restarted on every render
  const handleScan = useCallback(
    (value) => {
      setQrInput('');
      lookup(value);
    },
    [lookup]
  );

  function selectBooking(booking) {
    setSelected(booking);
    setNotice('');
    setTab('checkin');
  }

  async function bookingAction(kind) {
    if (!selected) return;
    const messages = { checkIn: 'Checked in.', checkOut: 'Checked out.', noShow: 'Marked as no-show.' };
    const result = await act(() => staffApi[kind](token, selected.id), messages[kind]);
    if (result?.booking) setSelected(result.booking);
  }

  const activeRooms = data.rooms.filter((room) => room.status === 'active');

  async function registerWalkIn(event) {
    event.preventDefault();
    const roomId = walkIn.room_id || activeRooms[0]?.id;
    const result = await act(
      () =>
        staffApi.walkIn(token, {
          matric: walkIn.matric.trim(),
          room_id: Number(roomId),
          start: walkIn.start,
          end: walkIn.end,
        }),
      (r) => `Walk-in ${r.booking.reference} created for ${r.booking.student}.`
    );
    if (result) setWalkIn((old) => ({ ...old, matric: '' }));
  }

  function toggleRoom(room) {
    const next = room.status === 'active' ? 'maintenance' : 'active';
    act(
      () => staffApi.setRoomStatus(token, room.id, next),
      (r) =>
        r.affected_bookings
          ? `${room.name} is now in maintenance. ${r.affected_bookings} upcoming booking(s) still use it, so please contact those students.`
          : `${room.name} is now ${label(next)}.`
    );
  }

  function runWaitlist() {
    act(
      () => staffApi.processWaitlist(token),
      ({ result }) =>
        `Checked. No-shows released: ${result.no_shows} · New offers: ${result.offers} · Expired offers: ${result.expired_offers}.`
    );
  }

  function decideExtension(item, decision) {
    act(() => staffApi.decideExtension(token, item.id, decision), `Extension ${decision}.`);
  }

  function changeReportStatus(report, status) {
    setSummary(null);
    act(() => staffApi.setReportStatus(token, report.id, status), `${report.reference} is now ${label(status)}.`);
  }

    function generateSummary() {
    const categories = {};
    const recurring = {};
    const severities = {};

    data.reports.forEach((r) => {
      // Use the AI's / staff's category once it is trusted, otherwise the student's own
      const trusted = r.ai && r.ai.state !== 'needs_review';
      const category = trusted && r.ai.category ? categoryLabel(r.ai.category) : r.category;

      categories[category] = (categories[category] || 0) + 1;
      recurring[`${r.room} · ${category}`] = (recurring[`${r.room} · ${category}`] || 0) + 1;
      if (trusted && r.ai.severity) severities[r.ai.severity] = (severities[r.ai.severity] || 0) + 1;
    });

    setSummary({
      count: data.reports.length,
      pending: queue.pending_count,
      categories: Object.entries(categories).sort((a, b) => b[1] - a[1]),
      severities: Object.entries(severities),
      recurring: Object.entries(recurring).filter(([, count]) => count > 1),
    });
  }

  function draftFor(item) {
    return (
      drafts[item.report_id] ?? {
        category:
          item.ai_suggestion?.category ??
          (CATEGORY_OPTIONS.some(([id]) => id === item.student_category) ? item.student_category : 'other'),
        severity: item.ai_suggestion?.severity ?? 'medium',
        summary: item.ai_suggestion?.summary ?? '',
        note: '',
      }
    );
  }

  function editDraft(item, field, value) {
    setDrafts((old) => ({ ...old, [item.report_id]: { ...draftFor(item), [field]: value } }));
  }

  function submitReview(item) {
    setSummary(null);
    act(() => staffApi.reviewReport(token, item.report_id, draftFor(item)), `${item.reference} reviewed.`);
  }

  function signOut() {
    tokenStore.clear();
    window.location.href = '/';
  }

  const stats = useMemo(
    () => ({
      today: data.bookings.filter((b) => !['cancelled', 'no_show'].includes(b.status)).length,
      checkedIn: data.bookings.filter((b) => b.status === 'checked_in').length,
      waiting: data.waitlist.filter((w) => w.status === 'waiting').length,
      openReports: data.reports.filter((r) => r.status !== 'resolved').length,
    }),
    [data]
  );

  const tabName = NAVIGATION.find(([id]) => id === tab)?.[2] ?? 'Dashboard';
  const initials = (user?.name || 'Library Staff').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="staff-app">
      <aside className="staff-sidebar">
        <div className="staff-brand">
          <div className="staff-brand-mark">L</div>
          <div>
            <strong>Library Rooms</strong>
            <small>UTM Booking System</small>
          </div>
        </div>

        <p className="staff-nav-label">LIBRARY STAFF WORKSPACE</p>

        <nav className="staff-nav" aria-label="Staff navigation">
          {NAVIGATION.map(([id, symbol, name]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'staff-nav-link active' : 'staff-nav-link'}
              onClick={() => {
                setTab(id);
                setNotice('');
              }}
            >
              <span aria-hidden="true">{symbol}</span> {name}
            </button>
          ))}
        </nav>

        <div className="staff-sidebar-foot">
          <strong>Staff Portal</strong>
          <span>Room allocation · Key collection · Facility reports</span>
        </div>
      </aside>

      <div className="staff-main">
        <header className="staff-topbar">
          <span>Library Room Booking System</span>

          <div className="staff-profile">
            <span className="staff-avatar">{initials}</span>
            <span>
              <strong>{user?.name || 'Library Staff'}</strong>
              <small>Front Desk</small>
            </span>
            <button className="staff-secondary" type="button" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <main className="staff-content">
          <p className="staff-eyebrow">STAFF WORKSPACE</p>
          <h1>{tabName}</h1>
          <p className="staff-lead">
            Manage reservations, keys, waiting lists and library facilities in one place.
          </p>

          <div className="staff-mode">
            <span className="staff-demo-indicator">Live data · connected to the library database</span>
            <button className="staff-secondary" type="button" onClick={load} disabled={busy}>Refresh</button>
          </div>

          {loadError && (
            <div className="staff-notice" role="alert">
              {loadError}
              <button type="button" onClick={load}>Retry</button>
            </div>
          )}

          {notice && (
            <div className="staff-notice" role="status">
              {notice}
              <button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button>
            </div>
          )}

          {/* DASHBOARD */}
          {tab === 'dashboard' && (
            <>
              <div className="staff-stats">
                <Stat label="Today's Bookings" value={loading ? '…' : stats.today} helper="Excluding cancelled" />
                <Stat label="Checked In" value={loading ? '…' : stats.checkedIn} helper="In a room right now" />
                <Stat label="Waiting Students" value={loading ? '…' : stats.waiting} helper="Same-day queue" />
                <Stat label="Open Reports" value={loading ? '…' : stats.openReports} helper="Not yet resolved" />
              </div>

              <div className="staff-grid-two">
                <section className="staff-panel">
                  <div className="staff-panel-heading">
                    <h2>Today&apos;s Reservations</h2>
                    <button className="staff-text-button" type="button" onClick={() => setTab('reservations')}>
                      All reservations →
                    </button>
                  </div>
                  <BookingTable bookings={data.bookings} onSelect={selectBooking} />
                </section>

                <section className="staff-panel">
                  <h2>Quick Actions</h2>
                  <div className="staff-actions">
                    <button type="button" onClick={() => setTab('checkin')}>Open check-in desk</button>
                    <button type="button" onClick={() => setTab('reservations')}>Register a walk-in</button>
                    <button type="button" onClick={() => setTab('rooms')}>Manage rooms</button>
                    <button type="button" onClick={() => setTab('reports')}>View issue reports</button>
                  </div>
                </section>
              </div>
            </>
          )}

          {/* RESERVATIONS + WALK-IN */}
          {tab === 'reservations' && (
            <>
              <ReservationsPanel token={token} />

              <section className="staff-panel staff-panel-spaced">
                <h2>Register a Walk-in</h2>
                <p className="staff-muted">
                  For a student who comes to the desk without a booking. They need a registered account.
                  A walk-in that starts now is checked in straight away.
                </p>

                <form className="staff-form-grid" onSubmit={registerWalkIn}>
                  <label>
                    Matric number
                    <input
                      className="staff-input"
                      required
                      value={walkIn.matric}
                      onChange={(e) => setWalkIn((x) => ({ ...x, matric: e.target.value }))}
                    />
                  </label>

                  <label>
                    Room
                    <select
                      className="staff-input"
                      value={walkIn.room_id || activeRooms[0]?.id || ''}
                      onChange={(e) => setWalkIn((x) => ({ ...x, room_id: e.target.value }))}
                    >
                      {activeRooms.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Start
                    <input
                      className="staff-input"
                      type="time"
                      value={walkIn.start}
                      onChange={(e) => setWalkIn((x) => ({ ...x, start: e.target.value }))}
                    />
                  </label>

                  <label>
                    End
                    <input
                      className="staff-input"
                      type="time"
                      value={walkIn.end}
                      onChange={(e) => setWalkIn((x) => ({ ...x, end: e.target.value }))}
                    />
                  </label>

                  <button className="staff-primary" type="submit" disabled={busy || activeRooms.length === 0}>
                    Add walk-in
                  </button>
                </form>
              </section>
            </>
          )}

          {/* QR CHECK-IN */}
          {tab === 'checkin' && (
            <section className="staff-panel">
              <h2>QR Check-in / Check-out</h2>
              <p className="staff-muted">
                Scan the student&apos;s booking QR, or type the booking reference (for example BK-0012).
                Check-in opens 15 minutes before the start time.
              </p>

              <div className="staff-lookup">
                <input
                  className="staff-input"
                  placeholder="BK-0012 or scan a QR code"
                  aria-label="Booking reference"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') lookup(qrInput);
                  }}
                />
                <button className="staff-primary" type="button" disabled={busy} onClick={() => lookup(qrInput)}>
                  Find booking
                </button>
              </div>

              <CameraQrScanner onCode={handleScan} />

              {selected ? (
                <div className="staff-detail-card">
                  <h3>{selected.reference}</h3>
                  <p><strong>Student:</strong> {selected.student}{selected.matric ? ` (${selected.matric})` : ''}</p>
                  <p><strong>Room:</strong> {selected.room_name}</p>
                  <p><strong>Time:</strong> {selected.date} · {selected.start_time}–{selected.end_time}</p>
                  <p>
                    <strong>Status:</strong>{' '}
                    <span className={statusClass(selected.status)}>{label(selected.status)}</span>
                  </p>

                  <div className="staff-button-row">
                    <button
                      className="staff-primary"
                      type="button"
                      disabled={busy || selected.status !== 'confirmed'}
                      onClick={() => bookingAction('checkIn')}
                    >
                      Check in
                    </button>
                    <button
                      className="staff-secondary"
                      type="button"
                      disabled={busy || selected.status !== 'checked_in'}
                      onClick={() => bookingAction('checkOut')}
                    >
                      Check out
                    </button>
                    <button
                      className="staff-secondary"
                      type="button"
                      disabled={busy || selected.status !== 'confirmed'}
                      onClick={() => bookingAction('noShow')}
                    >
                      Mark no-show
                    </button>
                  </div>
                </div>
              ) : (
                <div className="staff-empty">Scan a QR code or enter a booking reference to begin.</div>
              )}
            </section>
          )}

          {/* ROOM MANAGEMENT */}
          {tab === 'rooms' && (
            <section className="staff-panel">
              <div className="staff-panel-heading">
                <h2>Rooms &amp; Maintenance</h2>
                <span className="staff-muted">{data.rooms.length} rooms</span>
              </div>

              <div className="staff-room-grid">
                {data.rooms.map((room) => (
                  <article className="staff-room" key={room.id}>
                    <div className="staff-panel-heading">
                      <strong>{room.name}</strong>
                      <span className={statusClass(room.status)}>{label(room.status)}</span>
                    </div>

                    <p>{room.type} · {room.floor || 'Location not set'}</p>
                    <p>Capacity: {room.capacity}</p>

                    <button className="staff-secondary" type="button" disabled={busy} onClick={() => toggleRoom(room)}>
                      {room.status === 'active' ? 'Mark Maintenance' : 'Return to Active'}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* WAITING LIST */}
          {tab === 'waitlist' && (
            <section className="staff-panel">
              <div className="staff-panel-heading">
                <h2>Same-Day Waiting List</h2>
                <button className="staff-primary" type="button" disabled={busy} onClick={runWaitlist}>
                  Run offer check now
                </button>
              </div>
              <p className="staff-muted">
                Offers are sent automatically when a room becomes free. The check also runs every minute on its own.
              </p>

              <div className="staff-table-scroll">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Student</th>
                      <th>Type</th>
                      <th>Wanted time</th>
                      <th>Group</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.waitlist.length ? (
                      data.waitlist.map((entry, i) => (
                        <tr key={entry.id}>
                          <td>#{i + 1}</td>
                          <td>{entry.name}</td>
                          <td>{entry.type}</td>
                          <td>{entry.date} · {entry.time}</td>
                          <td>{entry.party_size}</td>
                          <td><span className={statusClass(entry.status)}>{label(entry.status)}</span></td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={6}>Nobody is waiting right now.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* EXTENSIONS */}
          {tab === 'extensions' && (
            <section className="staff-panel">
              <h2>Booking Extensions</h2>

              <div className="staff-table-scroll">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Booking</th>
                      <th>Student</th>
                      <th>Room</th>
                      <th>Ends</th>
                      <th>Requested end</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.extensions.length ? (
                      data.extensions.map((item) => (
                        <tr key={item.id}>
                          <td>{item.reference}</td>
                          <td>{item.student}</td>
                          <td>{item.room}</td>
                          <td>{item.current_end}</td>
                          <td>{item.requested_end}</td>
                          <td><span className={statusClass(item.status)}>{label(item.status)}</span></td>
                          <td>
                            <div className="staff-button-row">
                              {['approved', 'rejected'].map((decision) => (
                                <button
                                  key={decision}
                                  className="staff-mini-button"
                                  type="button"
                                  disabled={busy || item.status !== 'pending'}
                                  onClick={() => decideExtension(item, decision)}
                                >
                                  {decision === 'approved' ? 'Approve' : 'Reject'}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={7}>No extension requests.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ISSUE REPORTS */}
          {tab === 'reports' && (
            <section className="staff-panel">
              <h2>Student Facility Issue Reports</h2>

              <div className="staff-table-scroll">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Room</th>
                      <th>Student</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>AI result</th>
                      <th>Photo</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reports.length ? (
                      data.reports.map((report) => (
                        <tr key={report.id}>
                          <td>{report.reference}</td>
                          <td>{report.room}</td>
                          <td>{report.student}</td>
                          <td>{report.category}</td>
                          <td>{report.description}</td>
                          <td>
                            {report.ai ? (
                              <>
                                <span className={statusClass(report.ai.state === 'needs_review' ? 'pending' : 'approved')}>
                                  {AI_STATE_LABELS[report.ai.state] ?? report.ai.state}
                                </span>
                                {report.ai.category && (
                                  <small>{categoryLabel(report.ai.category)} · {report.ai.severity}</small>
                                )}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {report.image_url ? (
                              <a href={report.image_url} target="_blank" rel="noreferrer">View</a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <select
                              className="staff-input staff-select-small"
                              value={report.status}
                              disabled={busy}
                              onChange={(e) => changeReportStatus(report, e.target.value)}
                            >
                              <option value="submitted">Submitted</option>
                              <option value="in_progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={8}>No issue reports yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* REPORT ANALYZER + REVIEW QUEUE */}
          {tab === 'analyzer' && (
            <>
              <section className="staff-panel">
                <div className="staff-panel-heading">
                  <h2>Needs staff review</h2>
                  <span className="staff-muted">{queue.pending_count} waiting</span>
                </div>
                <p className="staff-muted">
                  The AI was unavailable, gave an invalid answer, or was not confident about these reports.
                  Confirm or correct each one.
                </p>

                {queue.items.length ? (
                  queue.items.map((item) => {
                    const draft = draftFor(item);
                    return (
                      <div className="staff-detail-card" key={item.report_id}>
                        <h3>{item.reference} · {item.room_name}</h3>
                        <p>
                          <strong>Student:</strong> {item.student_name} chose “{categoryLabel(item.student_category)}”
                        </p>
                        <p>{item.description}</p>
                        {item.image_url && (
                          <p><a href={item.image_url} target="_blank" rel="noreferrer">View photo</a></p>
                        )}
                        <p className="staff-muted">
                          {REASON_LABELS[item.reason] ?? item.reason}
                          {item.ai_suggestion &&
                            ` · AI suggested ${categoryLabel(item.ai_suggestion.category)} / ${item.ai_suggestion.severity} (${Math.round(item.ai_suggestion.confidence * 100)}% sure)`}
                        </p>

                        <div className="staff-form-grid">
                          <label>
                            Category
                            <select
                              className="staff-input"
                              value={draft.category}
                              onChange={(e) => editDraft(item, 'category', e.target.value)}
                            >
                              {CATEGORY_OPTIONS.map(([id, name]) => (
                                <option key={id} value={id}>{name}</option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Severity
                            <select
                              className="staff-input"
                              value={draft.severity}
                              onChange={(e) => editDraft(item, 'severity', e.target.value)}
                            >
                              {SEVERITY_OPTIONS.map((s) => (
                                <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                              ))}
                            </select>
                          </label>

                          <label>
                            One-line summary
                            <input
                              className="staff-input"
                              maxLength={300}
                              value={draft.summary}
                              onChange={(e) => editDraft(item, 'summary', e.target.value)}
                            />
                          </label>

                          <label>
                            Note (optional)
                            <input
                              className="staff-input"
                              maxLength={500}
                              value={draft.note}
                              onChange={(e) => editDraft(item, 'note', e.target.value)}
                            />
                          </label>

                          <button className="staff-primary" type="button" disabled={busy} onClick={() => submitReview(item)}>
                            Confirm review
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="staff-empty">Nothing needs review right now.</div>
                )}
              </section>

              <section className="staff-panel staff-panel-spaced">
                <div className="staff-panel-heading">
                  <h2>Report Analyzer</h2>
                  <button className="staff-primary" type="button" onClick={generateSummary}>
                    Generate Summary
                  </button>
                </div>

                <p className="staff-muted">
                  Counts the real issue reports, using the AI&apos;s or staff&apos;s category once a report has been
                  accepted or reviewed.
                </p>

                {summary ? (
                  <div className="staff-ai-results">
                    <h3>
                      {summary.count} reports analyzed
                      {summary.pending > 0 && ` · ${summary.pending} still waiting for review`}
                    </h3>

                    <div className="staff-grid-two">
                      <div className="staff-detail-card">
                        <h3>By category</h3>
                        {summary.categories.map(([name, n]) => (
                          <p key={name}>{name}: <strong>{n}</strong></p>
                        ))}
                      </div>

                      <div className="staff-detail-card">
                        <h3>By severity</h3>
                        {summary.severities.length ? (
                          summary.severities.map(([name, n]) => (
                            <p key={name}>{name[0].toUpperCase() + name.slice(1)}: <strong>{n}</strong></p>
                          ))
                        ) : (
                          <p>No reviewed reports yet.</p>
                        )}
                      </div>
                    </div>

                    <div className="staff-detail-card">
                      <h3>Recurring room issues</h3>
                      {summary.recurring.length ? (
                        summary.recurring.map(([name, n]) => (
                          <p key={name}>{name}: <strong>{n}</strong></p>
                        ))
                      ) : (
                        <p>None identified.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="staff-empty">Click Generate Summary to analyze the issue reports.</div>
                )}
              </section>
            </>
          )}

          <footer className="staff-footer">
            NOIDEA · Universiti Teknologi Malaysia · Live library data
          </footer>
        </main>
      </div>
    </div>
  );
}