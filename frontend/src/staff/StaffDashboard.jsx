import { useCallback, useEffect, useMemo, useState } from 'react';
import ReservationsPanel from './ReservationsPanel';
import CameraQrScanner from './CameraQrScanner';
import ReportAnalyzer from './ReportAnalyzer';
import { staffApi } from './staffService';
import { tokenStore } from '../auth/authService';
import './StaffDashboard.css';

/* Same PSZ mark as the student site: an open book with a bookmark ribbon */
function PszLogo() {
  return (
    <svg viewBox="0 0 32 32" className="staff-logo" aria-hidden="true">
      <path
        d="M16 9.5C13.2 7.6 9.6 7 5.5 7.4v15.4c4.1-.4 7.7.2 10.5 2.1 2.8-1.9 6.4-2.5 10.5-2.1V7.4C22.4 7 18.8 7.6 16 9.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M16 9.5v15.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 8.4v6.4l1.8-1.3 1.8 1.3V8" fill="currentColor" />
    </svg>
  );
}

function greeting(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

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

function Stat({ label: title, value, helper, onClick }) {
  return (
    <button type="button" className="staff-stat" onClick={onClick}>
      <span className="staff-stat-label">{title}</span>
      <strong>{value}</strong>
      <span className="staff-stat-hint">{helper}</span>
    </button>
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

/** "2026-11-27T10:02:00+08:00" -> "10:02 AM" in library time. */
function clockOf(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });
}

/* ---------- Check-in desk rules (same as the server: BookingQrService) ---------- */
const CHECK_IN_EARLY_MIN = 15; // check-in opens 15 minutes before the start
const CHECK_IN_GRACE_MIN = 15; // and closes 15 minutes after it; then it is a no-show
const LIBRARY_TZ_OFFSET = '+08:00'; // booking times from the API are Malaysia time

/** "2026-11-28" + "08:00" -> Date, read as Malaysia time whatever the PC's time zone is. */
function libraryTime(date, hhmm) {
  return new Date(`${date}T${hhmm}:00${LIBRARY_TZ_OFFSET}`);
}

/** "Sat, 28 Nov 2026" */
function dayOf(date) {
  return libraryTime(date, '12:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur',
  });
}

/** "07:45", or "07:45 on Sat, 28 Nov 2026" when it is not today. */
function whenOf(at, now) {
  const fmt = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }); // YYYY-MM-DD
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });
  return fmt(at) === fmt(now) ? time : `${time} on ${dayOf(fmt(at))}`;
}

const FINISHED_HINTS = {
  checked_out: 'Checked out. Nothing more to do for this booking.',
  no_show: 'Released as a no-show: the student did not check in within 15 minutes. The QR no longer works.',
  cancelled: 'This booking was cancelled. The QR no longer works.',
  held: 'This room is still being offered from the waiting list. The student must accept it first.',
};

/** Which desk buttons are allowed for this booking right now, and why not. */
function deskActions(b, now) {
  const start = libraryTime(b.date, b.start_time);
  const end = libraryTime(b.date, b.end_time);
  const opens = new Date(start.getTime() - CHECK_IN_EARLY_MIN * 60000);
  const deadline = new Date(start.getTime() + CHECK_IN_GRACE_MIN * 60000);
  const statusText = label(b.status).toLowerCase();

  let checkIn = null;
  if (b.status === 'checked_in') checkIn = 'Already checked in.';
  else if (b.status !== 'confirmed') checkIn = FINISHED_HINTS[b.status] ?? `This booking is ${statusText}.`;
  else if (now < opens) checkIn = `Too early: check-in opens at ${whenOf(opens, now)}.`;
  else if (now >= deadline || now >= end) checkIn = `Check-in closed at ${whenOf(deadline, now)}. The student did not come in time.`;

  let checkOut = null;
  if (b.status === 'checked_out') checkOut = 'Already checked out.';
  else if (b.status !== 'checked_in') checkOut = 'The student must be checked in first.';

  let noShow = null;
  if (b.status !== 'confirmed') noShow = b.status === 'no_show' ? 'Already marked as no-show.' : null;
  else if (now < deadline) noShow = `Only after ${whenOf(deadline, now)}, if the student has not come.`;
  if (b.status !== 'confirmed' && b.status !== 'no_show') noShow = noShow ?? 'Only for bookings that are still waiting for check-in.';

  // The one line shown under the buttons
  const hint =
    b.status === 'confirmed'
      ? checkIn ?? `Check-in is open until ${whenOf(deadline, now)}.`
      : b.status === 'checked_in'
        ? `Checked in. Use Check out when the student leaves (booking ends at ${b.end_time}).`
        : checkIn;

  return { checkIn, checkOut, noShow, hint, deadline };
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
  const [scanResult, setScanResult] = useState(null); // { tone: 'ok' | 'warn' | 'error', title, text }
  const [walkIn, setWalkIn] = useState(defaultWalkIn);
  const [summary, setSummary] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  // Keep the greeting / date fresh without a reload
  useEffect(() => {
    // Every 15 s, so the desk buttons switch on/off right when check-in opens or closes
    const clock = window.setInterval(() => setNow(new Date()), 15 * 1000);
    return () => window.clearInterval(clock);
  }, []);

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

  /* A scanned QR (camera or USB scanner): check in, or check out if already in. */
  const scan = useCallback(
    async (value) => {
      const code = value.trim();
      if (!code) return;
      setBusy(true);
      setNotice('');
      try {
        const result = await staffApi.scan(token, code);
        setSelected(result.booking ?? null);
        const tone = result.ok ? 'ok' : result.result === 'not_yet_open' ? 'warn' : 'error';
        const title = {
          checked_in: 'Checked in',
          checked_out: 'Checked out',
          not_yet_open: 'Too early',
          expired: 'QR expired',
          used: 'Already checked out',
          invalid: 'QR not recognised',
        }[result.result] ?? (result.ok ? 'Done' : 'Not accepted');
        let text = result.message;
        if (result.result === 'not_yet_open' && result.booking) {
          const b = result.booking;
          const opens = new Date(libraryTime(b.date, b.start_time).getTime() - CHECK_IN_EARLY_MIN * 60000);
          const opensAt = opens.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });
          text = `${b.reference} starts at ${b.start_time} on ${dayOf(b.date)}. Check-in opens at ${opensAt}.`;
        }
        setScanResult({ tone, title, text, at: new Date() });
        if (result.ok) load();
      } catch (err) {
        setScanResult({ tone: 'error', title: 'Scan failed', text: err.message, at: new Date() });
      } finally {
        setBusy(false);
      }
    },
    [token, load]
  );

  /* Typed input: a QR token (USB scanners type it and press Enter) is scanned; a reference is looked up. */
  const submitCode = useCallback(
    (value) => {
      const code = value.trim();
      setScanResult(null);
      if (/^[a-f0-9]{64}$/i.test(code)) {
        setQrInput('');
        scan(code);
      } else {
        lookup(code);
      }
    },
    [scan, lookup]
  );

  // Stable function, so the camera is not restarted on every render
  const handleScan = useCallback(
    (value) => {
      setQrInput('');
      scan(value);
    },
    [scan]
  );

  function selectBooking(booking) {
    setSelected(booking);
    setNotice('');
    setTab('checkin');
  }

  async function bookingAction(kind) {
    if (!selected) return;
    const messages = { checkIn: 'Checked in.', checkOut: 'Checked out.', noShow: 'Marked as no-show.' };
    setScanResult(null);
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

  // Next student still to arrive (earliest confirmed booking today)
  const nextArrival = useMemo(
    () =>
      data.bookings
        .filter((b) => b.status === 'confirmed')
        .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))[0],
    [data.bookings]
  );

  // Room availability grouped by room type, same idea as the student dashboard
  const roomAvailability = useMemo(() => {
    const groups = {};
    data.rooms.forEach((room) => {
      const key = room.type || 'Other';
      groups[key] = groups[key] || { type: key, open: 0, total: 0 };
      groups[key].total += 1;
      if (room.status === 'active') groups[key].open += 1;
    });
    return Object.values(groups);
  }, [data.rooms]);

  const tabName = NAVIGATION.find(([id]) => id === tab)?.[2] ?? 'Dashboard';
  const initials = (user?.name || 'Library Staff').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  function go(id) {
    setTab(id);
    setNotice('');
    setMenuOpen(false);
  }

  return (
    <div className="staff-app">
      <a className="staff-skip" href="#staff-main">Skip to content</a>

      <aside id="staff-sidebar" className={`staff-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Staff navigation">
        <div className="staff-brand">
          <span className="staff-brand-mark" aria-hidden="true">
            <PszLogo />
          </span>
          <div>
            <strong>PSZ</strong>
            <small>Perpustakaan Sultanah Zanariah</small>
          </div>
        </div>

        <p className="staff-nav-label">STAFF WORKSPACE</p>

        <nav className="staff-nav">
          {NAVIGATION.map(([id, symbol, name]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'staff-nav-link active' : 'staff-nav-link'}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <span aria-hidden="true">{symbol}</span>
              {name}
              {id === 'analyzer' && queue.pending_count > 0 && (
                <em className="staff-nav-badge">{queue.pending_count}</em>
              )}
            </button>
          ))}
        </nav>

        <div className="staff-sidebar-foot">
          <p>Staff Portal</p>
          <span>Room allocation · Key collection · Facility reports</span>
        </div>
      </aside>

      {menuOpen && (
        <button type="button" className="staff-overlay" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />
      )}

      <div className="staff-main">
        <header className="staff-topbar">
          <div className="staff-topbar-start">
            <button
              type="button"
              className="staff-menu-button"
              aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={menuOpen}
              aria-controls="staff-sidebar"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <div className="staff-topbar-title">
              <span className="staff-topbar-system">PSZ Room Booking</span>
              <span className="staff-topbar-crumb"><span aria-hidden="true">›</span> {tabName}</span>
            </div>
          </div>

          <div className="staff-profile">
            <span className="staff-avatar" aria-hidden="true">{initials || 'S'}</span>
            <span className="staff-profile-text">
              <strong>{user?.name || 'Library Staff'}</strong>
              <small>Front Desk</small>
            </span>
            <button className="staff-signout" type="button" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <main id="staff-main" className="staff-content" tabIndex={-1}>
          <div className="staff-heading">
            <div>
              <p className="staff-eyebrow">STAFF WORKSPACE</p>
              <h1>{tab === 'dashboard' ? `${greeting(now)}, ${(user?.name || 'Staff').trim().split(/\s+/)[0]}` : tabName}</h1>
              <p className="staff-lead">
                {tab === 'dashboard'
                  ? `${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Perpustakaan Sultanah Zanariah`
                  : 'Manage reservations, keys, waiting lists and library facilities in one place.'}
              </p>
            </div>
            <div className="staff-mode">
              <span className="staff-demo-indicator">Live data · connected to the library database</span>
              <button className="staff-refresh" type="button" onClick={load} disabled={busy}>↻ Refresh</button>
            </div>
          </div>

          {loadError && (
            <div className="staff-notice is-error" role="alert">
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
              <section className={`staff-hero ${nextArrival ? '' : 'is-quiet'}`}>
                <div className="staff-hero-top">
                  <span className="staff-hero-kicker">{nextArrival ? 'NEXT ARRIVAL' : 'FRONT DESK'}</span>
                  {nextArrival && <span className="staff-hero-pill">{label(nextArrival.status)}</span>}
                </div>
                {nextArrival ? (
                  <>
                    <h2>{nextArrival.room_code} · {nextArrival.start_time}–{nextArrival.end_time}</h2>
                    <p className="staff-hero-meta">
                      {nextArrival.student}{nextArrival.matric ? ` · ${nextArrival.matric}` : ''}
                      <span> · {nextArrival.reference}</span>
                    </p>
                    <div className="staff-hero-actions">
                      <button type="button" className="staff-hero-primary" onClick={() => selectBooking(nextArrival)}>
                        Open check-in
                      </button>
                      <button type="button" className="staff-hero-secondary" onClick={() => go('reservations')}>
                        All reservations
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2>{loading ? 'Loading today…' : 'No students waiting to check in'}</h2>
                    <p className="staff-hero-meta">
                      {loading ? 'Fetching the latest bookings.' : 'Everyone booked for today has arrived, or nothing is booked yet.'}
                    </p>
                    <div className="staff-hero-actions">
                      <button type="button" className="staff-hero-primary" onClick={() => go('checkin')}>
                        Open check-in desk
                      </button>
                    </div>
                  </>
                )}
              </section>

              <div className="staff-stats">
                <Stat label="Today's Bookings" value={loading ? '…' : stats.today} helper="Excluding cancelled →" onClick={() => go('reservations')} />
                <Stat label="Checked In" value={loading ? '…' : stats.checkedIn} helper="In a room right now →" onClick={() => go('checkin')} />
                <Stat label="Waiting Students" value={loading ? '…' : stats.waiting} helper="Same-day queue →" onClick={() => go('waitlist')} />
                <Stat label="Open Reports" value={loading ? '…' : stats.openReports} helper="Not yet resolved →" onClick={() => go('reports')} />
              </div>

              <div className="staff-grid-two">
                <section className="staff-panel">
                  <div className="staff-panel-heading">
                    <h2>Today&apos;s Reservations</h2>
                    <button className="staff-text-button" type="button" onClick={() => go('reservations')}>
                      All reservations →
                    </button>
                  </div>
                  <BookingTable bookings={data.bookings} onSelect={selectBooking} />
                </section>

                <div className="staff-side">
                  <section className="staff-panel">
                    <h2>Quick Actions</h2>
                    <div className="staff-actions">
                      <button type="button" onClick={() => go('checkin')}>
                        <span aria-hidden="true">▣</span>
                        <div><strong>Open check-in desk</strong><small>Scan a QR or enter a reference</small></div>
                      </button>
                      <button type="button" onClick={() => go('reservations')}>
                        <span aria-hidden="true">▤</span>
                        <div><strong>Register a walk-in</strong><small>Student without a booking</small></div>
                      </button>
                      <button type="button" onClick={() => go('rooms')}>
                        <span aria-hidden="true">▥</span>
                        <div><strong>Manage rooms</strong><small>Active or under maintenance</small></div>
                      </button>
                      <button type="button" onClick={() => go('reports')}>
                        <span aria-hidden="true">✎</span>
                        <div><strong>View issue reports</strong><small>Facility problems from students</small></div>
                      </button>
                    </div>
                  </section>

                  <section className="staff-panel">
                    <h2>Room availability</h2>
                    <ul className="staff-availability">
                      {roomAvailability.length === 0 && <li className="staff-muted">No rooms found.</li>}
                      {roomAvailability.map((item) => (
                        <li key={item.type}>
                          <div className="staff-availability-row">
                            <span>{item.type} rooms</span>
                            <span className={item.open === 0 ? 'full' : ''}>
                              {item.open === 0 ? 'None open' : `${item.open} of ${item.total} open`}
                            </span>
                          </div>
                          <div className="staff-bar" aria-hidden="true">
                            <span style={{ width: `${item.total ? (item.open / item.total) * 100 : 0}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
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
                Scan the student&apos;s booking QR: the first scan checks them in, and scanning the same QR
                again when they leave checks them out. You can also type the booking reference (for example
                BK-0012). Check-in opens 15 minutes before the start time and closes 15 minutes after it; after
                that the QR expires and the booking is cancelled automatically.
              </p>

              <div className="staff-lookup">
                <input
                  className="staff-input"
                  placeholder="BK-0012 or scan a QR code"
                  aria-label="Booking reference"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitCode(qrInput);
                  }}
                />
                <button className="staff-primary" type="button" disabled={busy} onClick={() => submitCode(qrInput)}>
                  Find booking
                </button>
              </div>

              <CameraQrScanner onCode={handleScan} />

              {scanResult && (
                <div className={`staff-scan-result is-${scanResult.tone}`} role="status" aria-live="assertive">
                  <span className="staff-scan-icon" aria-hidden="true">
                    {scanResult.tone === 'ok' ? '✓' : scanResult.tone === 'warn' ? '!' : '✕'}
                  </span>
                  <div>
                    <strong>{scanResult.title}</strong>
                    <p>{scanResult.text}</p>
                  </div>
                  <small>{scanResult.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })}</small>
                </div>
              )}

              {selected ? (() => {
                const allowed = deskActions(selected, now);
                return (
                <div className="staff-detail-card">
                  <h3>{selected.reference}</h3>
                  <p><strong>Student:</strong> {selected.student}{selected.matric ? ` (${selected.matric})` : ''}</p>
                  <p><strong>Room:</strong> {selected.room_name}</p>
                  <p><strong>Time:</strong> {dayOf(selected.date)} · {selected.start_time}–{selected.end_time}</p>
                  <p>
                    <strong>Status:</strong>{' '}
                    <span className={statusClass(selected.status)}>{label(selected.status)}</span>
                  </p>
                  {selected.checked_in_at && (
                    <p><strong>Checked in:</strong> {clockOf(selected.checked_in_at)}</p>
                  )}
                  {selected.checked_out_at && (
                    <p><strong>Checked out:</strong> {clockOf(selected.checked_out_at)}</p>
                  )}
                  {selected.status === 'confirmed' && (
                    <p><strong>Check in by:</strong> {whenOf(allowed.deadline, now)} (then the QR expires and the booking is cancelled)</p>
                  )}

                  <div className="staff-button-row">
                    <button
                      className="staff-primary"
                      type="button"
                      disabled={busy || Boolean(allowed.checkIn)}
                      title={allowed.checkIn ?? 'Check the student in'}
                      onClick={() => bookingAction('checkIn')}
                    >
                      Check in
                    </button>
                    <button
                      className="staff-secondary"
                      type="button"
                      disabled={busy || Boolean(allowed.checkOut)}
                      title={allowed.checkOut ?? 'Check the student out'}
                      onClick={() => bookingAction('checkOut')}
                    >
                      Check out
                    </button>
                    <button
                      className="staff-secondary"
                      type="button"
                      disabled={busy || Boolean(allowed.noShow)}
                      title={allowed.noShow ?? 'Release the room: the student did not come'}
                      onClick={() => bookingAction('noShow')}
                    >
                      Mark no-show
                    </button>
                  </div>
                  {allowed.hint && <p className="staff-desk-hint">{allowed.hint}</p>}
                </div>
                );
              })() : (
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

              <ReportAnalyzer token={token} />
            </>
          )}

        </main>

        <footer className="staff-footer">
          <span>PSZ Room Booking System · Staff workspace · Live library data</span>
          <span>NOIDEA · Universiti Teknologi Malaysia</span>
        </footer>
      </div>
    </div>
  );
}