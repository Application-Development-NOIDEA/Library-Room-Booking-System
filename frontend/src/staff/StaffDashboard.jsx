import { useMemo, useState } from 'react';
import './StaffDashboard.css';

// FRONTEND DEMO DATA ONLY. Replace it with authenticated Laravel API calls.
const TODAY = new Date().toLocaleDateString('en-CA');
const initialRooms = [
  { id: 1, code: 'C01', name: 'Carrel Room C01', type: 'Carrel', capacity: 1, floor: 'Level 2', status: 'Active' },
  { id: 2, code: 'D01', name: 'Discussion Room D01', type: 'Discussion', capacity: 6, floor: 'Level 3', status: 'Active' },
  { id: 3, code: 'D02', name: 'Discussion Room D02', type: 'Discussion', capacity: 6, floor: 'Level 3', status: 'Active' },
  { id: 4, code: 'M01', name: 'Meeting Room M01', type: 'Meeting', capacity: 10, floor: 'Level 4', status: 'Maintenance' },
];
const initialBookings = [
  { id: 'LB-2026-1042', student: 'Ariana Arissa', matric: 'A24CS0190', room: 'D01', date: TODAY, start: '10:00', end: '12:00', status: 'Confirmed', source: 'Online' },
  { id: 'LB-2026-1043', student: 'Student B', matric: 'A24CS0191', room: 'C01', date: TODAY, start: '11:00', end: '13:00', status: 'Checked In', source: 'Online' },
  { id: 'LB-2026-1044', student: 'Student C', matric: 'A24CS0192', room: 'D02', date: TODAY, start: '14:00', end: '16:00', status: 'Confirmed', source: 'Online' },
];
const initialWaitlist = [
  { id: 'WL-021', name: 'Student D', type: 'Discussion', time: '14:00–16:00', joined: '09:01', status: 'Waiting' },
  { id: 'WL-022', name: 'Student E', type: 'Discussion', time: '14:00–16:00', joined: '09:14', status: 'Waiting' },
  { id: 'WL-023', name: 'Student F', type: 'Carrel', time: '10:00–12:00', joined: '09:35', status: 'Waiting' },
];
const initialReports = [
  { id: 'IR-101', room: 'D01', category: 'Air conditioning', description: 'Air conditioning is not cooling the room.', status: 'Submitted', date: TODAY },
  { id: 'IR-102', room: 'D01', category: 'Air conditioning', description: 'Room feels very warm during group study.', status: 'Submitted', date: TODAY },
  { id: 'IR-103', room: 'C01', category: 'Furniture', description: 'The desk chair is loose and unstable.', status: 'In Progress', date: TODAY },
  { id: 'IR-104', room: 'M01', category: 'Equipment', description: 'The projector cannot be turned on.', status: 'Submitted', date: TODAY },
];

const navigation = [
  ['dashboard', '▦', 'Dashboard'],
  ['reservations', '▤', 'Reservations'],
  ['checkin', '▣', 'QR / Check-in Desk'],
  ['rooms', '▥', 'Room Management'],
  ['waitlist', '◷', 'Waiting List'],
  ['reports', '✎', 'Issue Reports'],
  ['analyzer', '✦', 'AI Report Analyzer'],
];
const roomLabel = (code, rooms) => rooms.find((room) => room.code === code)?.name || code;
const statusClass = (value) => `staff-status staff-status--${String(value).toLowerCase().replace(/[^a-z]+/g, '-')}`;

export default function StaffDashboard() {
  const [tab, setTab] = useState('dashboard');
  const [rooms, setRooms] = useState(initialRooms);
  const [bookings, setBookings] = useState(initialBookings);
  const [waitlist, setWaitlist] = useState(initialWaitlist);
  const [reports, setReports] = useState(initialReports);
  const [search, setSearch] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [notification, setNotification] = useState('');
  const [summary, setSummary] = useState(null);
  const [walkIn, setWalkIn] = useState({ student: '', matric: '', room: 'D01', start: '14:00', end: '16:00' });

  const selectedBooking = bookings.find((item) => item.id === selectedBookingId);
  const activeBookings = bookings.filter((b) => ['Confirmed', 'Checked In'].includes(b.status));
  const filterBookings = useMemo(() => bookings.filter((b) => [b.id, b.student, b.matric, b.room, b.status].join(' ').toLowerCase().includes(search.toLowerCase())), [bookings, search]);
  const tabName = navigation.find((item) => item[0] === tab)?.[2] || 'Dashboard';

  function flash(message) {
    setNotification(message);
  }

  function changeBookingStatus(id, nextStatus) {
    setBookings((previous) => previous.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
    flash(`${id} marked ${nextStatus}. Demo data only.`);
  }

  function lookupBooking() {
    const id = qrInput.trim().toUpperCase();
    const matching = bookings.find((item) => item.id.toUpperCase() === id);
    if (!matching) {
      setSelectedBookingId('');
      flash('No booking found. Try LB-2026-1042 to test the demo.');
      return;
    }
    setSelectedBookingId(matching.id);
    flash('Booking found. Verify student identity and booking details before proceeding.');
  }

  function toggleRoom(code) {
    setRooms((previous) => previous.map((r) => r.code === code ? { ...r, status: r.status === 'Active' ? 'Maintenance' : 'Active' } : r));
    flash(`Room ${code} status changed (demo only).`);
  }

  function issueOffer(id) {
    const entry = waitlist.find((item) => item.id === id);
    if (!entry || entry.status !== 'Waiting') return;
    setWaitlist((previous) => previous.map((item) => item.id === id ? { ...item, status: 'Offered' } : item));
    flash(`${id} marked Offered. A real offer needs a server-side room hold and 10-minute expiry.`);
  }

  function updateReport(id, status) {
    setReports((previous) => previous.map((r) => r.id === id ? { ...r, status } : r));
    flash(`${id} updated to ${status} (demo only).`);
  }

  function generateSummary() {
    const byCategory = {};
    const byRoom = {};
    reports.forEach((report) => {
      byCategory[report.category] = (byCategory[report.category] || 0) + 1;
      const key = `${report.room} · ${report.category}`;
      byRoom[key] = (byRoom[key] || 0) + 1;
    });
    setSummary({
      count: reports.length,
      categories: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
      recurring: Object.entries(byRoom).filter(([, count]) => count > 1),
    });
    flash('Demo analysis generated from sample issue reports (not a live AI model).');
  }

  function registerWalkIn(event) {
    event.preventDefault();
    if (!walkIn.student.trim() || !walkIn.matric.trim()) { flash('Enter the student name and matric number.'); return; }
    if (walkIn.start >= walkIn.end) { flash('End time must be later than start time.'); return; }
    const selected = rooms.find((r) => r.code === walkIn.room);
    if (selected?.status !== 'Active') { flash('This room is not available for use.'); return; }
    const overlap = activeBookings.some((b) => b.room === walkIn.room && b.date === TODAY && walkIn.start < b.end && b.start < walkIn.end);
    if (overlap) { flash('Conflict with an existing booking (front-end demo check).'); return; }
    const id = `LB-DEMO-${String(Date.now()).slice(-6)}`;
    setBookings((items) => [...items, { id, student: walkIn.student.trim(), matric: walkIn.matric.trim(), room: walkIn.room, start: walkIn.start, end: walkIn.end, date: TODAY, status: 'Confirmed', source: 'Walk-in' }]);
    setWalkIn((form) => ({ ...form, student: '', matric: '' }));
    flash(`Walk-in record ${id} created locally. Real validation must happen in Laravel/PostgreSQL.`);
  }

  return (
    <div className="staff-app">
      <aside className="staff-sidebar">
        <div className="staff-brand"><div className="staff-brand-mark">L</div><div><strong>Library Rooms</strong><small>UTM Booking System</small></div></div>
        <p className="staff-nav-label">LIBRARY STAFF WORKSPACE</p>
        <nav className="staff-nav" aria-label="Staff navigation">
          {navigation.map(([id, icon, label]) => (
            <button key={id} type="button" className={tab === id ? 'staff-nav-link active' : 'staff-nav-link'} onClick={() => { setTab(id); setNotification(''); }}>
              <span aria-hidden="true">{icon}</span> {label}
            </button>
          ))}
        </nav>
        <div className="staff-sidebar-foot"><strong>Staff Portal</strong><span>Room allocation · Key collection · Facility reports</span></div>
      </aside>

      <div className="staff-main">
        <header className="staff-topbar"><span>Library Room Booking System</span><div className="staff-profile"><span className="staff-avatar">LS</span><span><strong>Library Staff</strong><small>Front Desk</small></span></div></header>
        <main className="staff-content">
          <p className="staff-eyebrow">STAFF WORKSPACE</p><h1>{tabName}</h1>
          <p className="staff-lead">{tab === 'dashboard' ? 'Manage reservations, keys, waiting lists and library facilities in one place.' : 'Interactive demo using sample records; Laravel and Supabase are not connected yet.'}</p>
          {notification && <div className="staff-notice" role="status">{notification}<button type="button" onClick={() => setNotification('')} aria-label="Dismiss message">×</button></div>}

          {tab === 'dashboard' && <>
            <div className="staff-stats">
              <Stat label="Today's Bookings" value={bookings.length} helper="Sample reservations" />
              <Stat label="Checked In" value={bookings.filter((b) => b.status === 'Checked In').length} helper="Key currently issued" />
              <Stat label="Waiting Students" value={waitlist.filter((w) => w.status === 'Waiting').length} helper="Pending queue requests" />
              <Stat label="Open Reports" value={reports.filter((r) => r.status !== 'Resolved').length} helper="Facility issues" />
            </div>
            <div className="staff-grid-two">
              <section className="staff-panel"><div className="staff-panel-heading"><h2>Today's Reservations</h2><button type="button" className="staff-text-button" onClick={() => setTab('reservations')}>View all →</button></div><BookingTable bookings={bookings.slice(0, 4)} rooms={rooms} onSelect={(id) => { setSelectedBookingId(id); setTab('checkin'); }} /></section>
              <section className="staff-panel"><div className="staff-panel-heading"><h2>Quick Actions</h2></div><div className="staff-actions">
                <button type="button" onClick={() => setTab('checkin')}>▣ Verify QR / Check-in</button>
                <button type="button" onClick={() => setTab('reservations')}>＋ Register Walk-in</button>
                <button type="button" onClick={() => setTab('waitlist')}>◷ Manage Waiting List</button>
                <button type="button" onClick={() => setTab('analyzer')}>✦ Analyze Issue Reports</button>
              </div></section>
            </div>
          </>}

          {tab === 'reservations' && <>
            <section className="staff-panel"><div className="staff-panel-heading"><h2>All Reservations</h2><input aria-label="Search bookings" className="staff-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, room, booking ID..." /></div>
              <BookingTable bookings={filterBookings} rooms={rooms} onSelect={(id) => { setSelectedBookingId(id); setTab('checkin'); }} />
            </section>
            <section className="staff-panel staff-panel-spaced"><h2>Register a Walk-in (Demo)</h2><p className="staff-muted">For a future hybrid system. This form simulates adding a reservation, but the backend must enforce booking conflicts before saving.</p>
              <form className="staff-form-grid" onSubmit={registerWalkIn}>
                <label>Student name<input className="staff-input" value={walkIn.student} onChange={(e) => setWalkIn((x) => ({ ...x, student: e.target.value }))} placeholder="Student name" required /></label>
                <label>Matric number<input className="staff-input" value={walkIn.matric} onChange={(e) => setWalkIn((x) => ({ ...x, matric: e.target.value }))} placeholder="A24CSXXXX" required /></label>
                <label>Room<select className="staff-input" value={walkIn.room} onChange={(e) => setWalkIn((x) => ({ ...x, room: e.target.value }))}>{rooms.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></label>
                <label>Start<input className="staff-input" type="time" value={walkIn.start} onChange={(e) => setWalkIn((x) => ({ ...x, start: e.target.value }))}/></label>
                <label>End<input className="staff-input" type="time" value={walkIn.end} onChange={(e) => setWalkIn((x) => ({ ...x, end: e.target.value }))}/></label>
                <button type="submit" className="staff-primary">Register Walk-in</button>
              </form>
            </section>
          </>}

          {tab === 'checkin' && <section className="staff-panel"><h2>QR Check-in / Check-out</h2><p className="staff-muted">In this frontend demo, type a Booking ID as a stand-in for scanning a QR code. The actual camera scanner and token verification will be implemented later.</p>
            <div className="staff-lookup"><input className="staff-input" aria-label="Booking ID" placeholder="Enter booking ID, e.g. LB-2026-1042" value={qrInput} onChange={(e) => setQrInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') lookupBooking(); }}/><button type="button" className="staff-primary" onClick={lookupBooking}>Find Booking</button><button type="button" className="staff-secondary" onClick={() => { setQrInput('LB-2026-1042'); setSelectedBookingId('LB-2026-1042'); }}>Try Sample</button></div>
            {selectedBooking ? <div className="staff-detail-card"><div className="staff-panel-heading"><h3>{selectedBooking.id}</h3><span className={statusClass(selectedBooking.status)}>{selectedBooking.status}</span></div><dl><div><dt>Student</dt><dd>{selectedBooking.student}</dd></div><div><dt>Matric</dt><dd>{selectedBooking.matric}</dd></div><div><dt>Room</dt><dd>{roomLabel(selectedBooking.room, rooms)}</dd></div><div><dt>Date & time</dt><dd>{selectedBooking.date} · {selectedBooking.start}–{selectedBooking.end}</dd></div></dl><p className="staff-muted">Verify the student's ID and confirm key handover/return before updating the status.</p><div className="staff-button-row"><button type="button" className="staff-primary" disabled={selectedBooking.status !== 'Confirmed'} onClick={() => changeBookingStatus(selectedBooking.id, 'Checked In')}>Confirm Check-in / Key Issued</button><button type="button" className="staff-secondary" disabled={selectedBooking.status !== 'Checked In'} onClick={() => changeBookingStatus(selectedBooking.id, 'Checked Out')}>Confirm Check-out / Key Returned</button></div></div> : <div className="staff-empty">Enter a Booking ID or click Try Sample to display a reservation.</div>}
          </section>}

          {tab === 'rooms' && <section className="staff-panel"><div className="staff-panel-heading"><h2>Rooms & Maintenance</h2><span className="staff-muted">{rooms.length} rooms</span></div><div className="staff-room-grid">{rooms.map((room) => <article className="staff-room" key={room.id}><div className="staff-panel-heading"><strong>{room.name}</strong><span className={statusClass(room.status)}>{room.status}</span></div><p>{room.type} · {room.floor}</p><p>Capacity: {room.capacity}</p><button type="button" className="staff-secondary" onClick={() => toggleRoom(room.code)}>{room.status === 'Active' ? 'Mark Maintenance' : 'Return to Active'}</button></article>)}</div></section>}

          {tab === 'waitlist' && <section className="staff-panel"><h2>Same-Day Waiting List</h2><p className="staff-muted">Review requests in FCFS order. This demo changes the status only; real allocation must check capacity, dates, time conflicts and create a temporary hold on the server.</p><div className="staff-table-scroll"><table className="staff-table"><thead><tr><th>Position</th><th>Student</th><th>Room type</th><th>Time</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead><tbody>{waitlist.map((entry, index) => <tr key={entry.id}><td>#{index + 1}</td><td>{entry.name}<small>{entry.id}</small></td><td>{entry.type}</td><td>{entry.time}</td><td>{entry.joined}</td><td><span className={statusClass(entry.status)}>{entry.status}</span></td><td><button type="button" className="staff-mini-button" disabled={entry.status !== 'Waiting'} onClick={() => issueOffer(entry.id)}>Mark Offered (Demo)</button></td></tr>)}</tbody></table></div></section>}

          {tab === 'reports' && <section className="staff-panel"><div className="staff-panel-heading"><h2>Student Facility Issue Reports</h2><span className="staff-muted">{reports.length} sample reports</span></div><div className="staff-table-scroll"><table className="staff-table"><thead><tr><th>Report</th><th>Room</th><th>Category</th><th>Description</th><th>Status</th></tr></thead><tbody>{reports.map((r) => <tr key={r.id}><td>{r.id}<small>{r.date}</small></td><td>{r.room}</td><td>{r.category}</td><td>{r.description}</td><td><select className="staff-input staff-select-small" aria-label={`Status for ${r.id}`} value={r.status} onChange={(e) => updateReport(r.id, e.target.value)}><option>Submitted</option><option>In Progress</option><option>Resolved</option></select></td></tr>)}</tbody></table></div></section>}

          {tab === 'analyzer' && <section className="staff-panel"><div className="staff-panel-heading"><div><h2>AI Report Analyzer</h2><p className="staff-muted">Summarize student-submitted facility issues for staff review.</p></div><button type="button" className="staff-primary" onClick={generateSummary}>✦ Generate Demo Summary</button></div>
            <div className="staff-ai-note"><strong>Prototype mode:</strong> This offline summary counts and groups sample reports using JavaScript; it does <strong>not</strong> call an AI model. Later, Laravel can securely call an AI API and return a reviewed summary.</div>
            {summary ? <div className="staff-ai-results"><h3>Facility issue overview</h3><p>{summary.count} reports analyzed. Most frequently reported issue: <strong>{summary.categories[0]?.[0] || 'None'}</strong>.</p><div className="staff-grid-two"><div className="staff-detail-card"><h3>Issues by category</h3>{summary.categories.map(([cat, count]) => <div className="staff-breakdown" key={cat}><span>{cat}</span><strong>{count}</strong></div>)}</div><div className="staff-detail-card"><h3>Recurring room issues</h3>{summary.recurring.length ? summary.recurring.map(([name, count]) => <p key={name}>{name}: <strong>{count} reports</strong></p>) : <p>No repeated room-category pairs detected in these reports.</p>}</div></div><p className="staff-muted">Suggested staff action: review the original reports, verify each issue and prioritize maintenance based on severity and operational policy.</p></div> : <div className="staff-empty">Click “Generate Demo Summary” to view grouped issues from the sample reports.</div>}
          </section>}
          <footer className="staff-footer">NOIDEA · Universiti Teknologi Malaysia · Staff frontend prototype (sample data)</footer>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, helper }) {
  return <div className="staff-stat"><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>;
}

function BookingTable({ bookings, rooms, onSelect }) {
  return <div className="staff-table-scroll"><table className="staff-table"><thead><tr><th>Booking ID / Student</th><th>Room</th><th>Time</th><th>Status</th><th>Action</th></tr></thead><tbody>{bookings.length ? bookings.map((b) => <tr key={b.id}><td><strong>{b.id}</strong><small>{b.student}</small></td><td>{roomLabel(b.room, rooms)}</td><td>{b.start}–{b.end}</td><td><span className={statusClass(b.status)}>{b.status}</span></td><td><button type="button" className="staff-mini-button" onClick={() => onSelect(b.id)}>Verify</button></td></tr>) : <tr><td colSpan={5}>No matching bookings</td></tr>}</tbody></table></div>;
}
