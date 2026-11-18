import { useMemo, useState } from 'react';
import ReservationsPanel from './ReservationsPanel';
import CameraQrScanner from './CameraQrScanner';
import './StaffDashboard.css';

// Reservations: real Laravel API.
// Other dashboard features: local demo until staff APIs are ready.

const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const SAMPLE_ROOMS = [
  {
    id: 1, code: 'C01', name: 'Carrel Room C01',
    type: 'Carrel', capacity: 1,
    floor: 'Level 2', status: 'Active'
  },
  {
    id: 2, code: 'D01', name: 'Discussion Room D01',
    type: 'Discussion', capacity: 6,
    floor: 'Level 3', status: 'Active'
  },
  {
    id: 3, code: 'D02', name: 'Discussion Room D02',
    type: 'Discussion', capacity: 6,
    floor: 'Level 3', status: 'Active'
  },
  {
    id: 4, code: 'M01', name: 'Meeting Room M01',
    type: 'Meeting', capacity: 10,
    floor: 'Level 4', status: 'Maintenance'
  },
];

const SAMPLE_BOOKINGS = [
  {
    id: 'LB-DEMO-1042',
    student: 'Sample Student A',
    matric: 'DEMO001',
    room: 'D01',
    date: TODAY,
    start: '10:00',
    end: '12:00',
    status: 'Confirmed',
  },
  {
    id: 'LB-DEMO-1043',
    student: 'Sample Student B',
    matric: 'DEMO002',
    room: 'C01',
    date: TODAY,
    start: '11:00',
    end: '13:00',
    status: 'Checked In',
  },
];

const SAMPLE_WAITLIST = [
  {
    id: 'WL-021',
    name: 'Sample Student C',
    type: 'Discussion',
    time: '14:00–16:00',
    status: 'Waiting',
  },
  {
    id: 'WL-022',
    name: 'Sample Student D',
    type: 'Carrel',
    time: '12:00–16:00',
    status: 'Waiting',
  },
];

const SAMPLE_EXTENSIONS = [
  {
    id: 'EX-01',
    booking_id: 'LB-DEMO-1043',
    student: 'Sample Student B',
    room: 'C01',
    requested_end: '14:00',
    status: 'Pending',
  },
];

const SAMPLE_REPORTS = [
  {
    id: 'IR-101',
    room: 'D01',
    category: 'Air conditioning',
    description: 'Room is too warm.',
    status: 'Submitted',
  },
  {
    id: 'IR-102',
    room: 'D01',
    category: 'Air conditioning',
    description: 'Air conditioning is not cooling.',
    status: 'Submitted',
  },
  {
    id: 'IR-103',
    room: 'C01',
    category: 'Furniture',
    description: 'Desk chair is loose.',
    status: 'In Progress',
  },
];

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

const statusClass = (value) =>
  `staff-status staff-status--${String(value)
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')}`;

function Stat({ label, value, helper }) {
  return (
    <div className="staff-stat">
      <span>{label}</span>
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
            <tr>
              <td colSpan={5}>No matching demo bookings.</td>
            </tr>
          ) : (
            bookings.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.id}</strong>
                  <small>{b.student}</small>
                </td>
                <td>{b.room}</td>
                <td>{b.start}–{b.end}</td>
                <td>
                  <span className={statusClass(b.status)}>
                    {b.status}
                  </span>
                </td>
                <td>
                  <button
                    className="staff-mini-button"
                    type="button"
                    onClick={() => onSelect(b.id)}
                  >
                    Verify (demo)
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

export default function StaffDashboard({ token }) {
  const [tab, setTab] = useState('dashboard');
  const [rooms, setRooms] = useState(SAMPLE_ROOMS);
  const [bookings, setBookings] = useState(SAMPLE_BOOKINGS);
  const [waitlist, setWaitlist] = useState(SAMPLE_WAITLIST);
  const [extensions, setExtensions] = useState(SAMPLE_EXTENSIONS);
  const [reports, setReports] = useState(SAMPLE_REPORTS);

  const [search, setSearch] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState(null);

  const [walkIn, setWalkIn] = useState({
    student: '',
    matric: '',
    room: 'D01',
    start: '14:00',
    end: '16:00',
  });

  const tabName =
    NAVIGATION.find(([id]) => id === tab)?.[2] ?? 'Dashboard';

  const selectedBooking = bookings.find(
    (b) => b.id === selectedBookingId
  );

  const filteredBookings = useMemo(
    () =>
      bookings.filter((b) =>
        [b.id, b.student, b.matric, b.room, b.status]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [bookings, search]
  );

  function selectBooking(id) {
    setSelectedBookingId(id);
    setTab('checkin');
  }

  function lookupBooking() {
    const found = bookings.find(
      (b) =>
        b.id.toUpperCase() === qrInput.trim().toUpperCase()
    );

    setSelectedBookingId(found?.id || '');
    setNotice(
      found
        ? 'Sample booking found. This is not real identity verification.'
        : 'Demo booking not found. Try LB-DEMO-1042.'
    );
  }

  function updateBookingStatus(status) {
    if (!selectedBooking) return;

    setBookings((items) =>
      items.map((b) =>
        b.id === selectedBookingId ? { ...b, status } : b
      )
    );

    setNotice(
      `Sample booking marked ${status}. Supabase was not changed.`
    );
  }

  function registerWalkIn(event) {
    event.preventDefault();

    if (walkIn.start >= walkIn.end) {
      setNotice('End time must be later than start time.');
      return;
    }

    const room = rooms.find((r) => r.code === walkIn.room);

    if (room?.status !== 'Active') {
      setNotice('This room is under maintenance.');
      return;
    }

    const clash = bookings.some(
      (b) =>
        b.room === walkIn.room &&
        b.date === TODAY &&
        ['Confirmed', 'Checked In'].includes(b.status) &&
        walkIn.start < b.end &&
        b.start < walkIn.end
    );

    if (clash) {
      setNotice('Another demo booking occupies this room.');
      return;
    }

    const id = `LB-DEMO-${Date.now()}`;

    setBookings((items) => [
      ...items,
      {
        id,
        student: walkIn.student.trim(),
        matric: walkIn.matric.trim(),
        room: walkIn.room,
        date: TODAY,
        start: walkIn.start,
        end: walkIn.end,
        status: 'Confirmed',
      },
    ]);

    setWalkIn((old) => ({
      ...old,
      student: '',
      matric: '',
    }));

    setNotice(`Walk-in ${id} added locally (demo only).`);
  }

  function generateSummary() {
    const categories = {};
    const recurring = {};

    reports.forEach((r) => {
      categories[r.category] =
        (categories[r.category] || 0) + 1;

      const key = `${r.room} · ${r.category}`;
      recurring[key] = (recurring[key] || 0) + 1;
    });

    setSummary({
      count: reports.length,
      categories: Object.entries(categories).sort(
        (a, b) => b[1] - a[1]
      ),
      recurring: Object.entries(recurring).filter(
        ([, count]) => count > 1
      ),
    });
  }

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

        <p className="staff-nav-label">
          LIBRARY STAFF WORKSPACE
        </p>

        <nav className="staff-nav" aria-label="Staff navigation">
          {NAVIGATION.map(([id, symbol, label]) => (
            <button
              key={id}
              type="button"
              className={
                tab === id
                  ? 'staff-nav-link active'
                  : 'staff-nav-link'
              }
              onClick={() => {
                setTab(id);
                setNotice('');
              }}
            >
              <span aria-hidden="true">{symbol}</span>
              {' '}{label}
            </button>
          ))}
        </nav>

        <div className="staff-sidebar-foot">
          <strong>Staff Portal</strong>
          <span>
            Room allocation · Key collection · Facility reports
          </span>
        </div>
      </aside>

      <div className="staff-main">
        <header className="staff-topbar">
          <span>Library Room Booking System</span>

          <div className="staff-profile">
            <span className="staff-avatar">LS</span>
            <span>
              <strong>Library Staff</strong>
              <small>Front Desk</small>
            </span>
          </div>
        </header>

        <main className="staff-content">
          <p className="staff-eyebrow">STAFF WORKSPACE</p>
          <h1>{tabName}</h1>

          <p className="staff-lead">
            Manage reservations, keys, waiting lists and
            library facilities in one place.
          </p>

          <div className="staff-mode">
            <span className="staff-demo-indicator">
              Live Reservations · Other tabs are Demo
            </span>
          </div>

          {notice && (
            <div className="staff-notice" role="status">
              {notice}
              <button
                type="button"
                onClick={() => setNotice('')}
                aria-label="Dismiss message"
              >
                ×
              </button>
            </div>
          )}

          {/* DASHBOARD */}
          {tab === 'dashboard' && (
            <>
              <div className="staff-stats">
                <Stat
                  label="Sample Bookings"
                  value={bookings.length}
                  helper="Local demo data"
                />
                <Stat
                  label="Checked In"
                  value={
                    bookings.filter(
                      (b) => b.status === 'Checked In'
                    ).length
                  }
                  helper="Demo records"
                />
                <Stat
                  label="Waiting Students"
                  value={
                    waitlist.filter(
                      (w) => w.status === 'Waiting'
                    ).length
                  }
                  helper="Demo queue"
                />
                <Stat
                  label="Open Reports"
                  value={
                    reports.filter(
                      (r) => r.status !== 'Resolved'
                    ).length
                  }
                  helper="Demo reports"
                />
              </div>

              <div className="staff-grid-two">
                <section className="staff-panel">
                  <div className="staff-panel-heading">
                    <h2>Sample Reservations</h2>
                    <button
                      className="staff-text-button"
                      type="button"
                      onClick={() => setTab('reservations')}
                    >
                      View real bookings →
                    </button>
                  </div>

                  <BookingTable
                    bookings={bookings}
                    onSelect={selectBooking}
                  />
                </section>

                <section className="staff-panel">
                  <h2>Quick Actions</h2>

                  <div className="staff-actions">
                    <button
                      type="button"
                      onClick={() => setTab('reservations')}
                    >
                      View live reservations
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('checkin')}
                    >
                      Try QR check-in demo
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('rooms')}
                    >
                      Manage sample rooms
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('reports')}
                    >
                      View sample reports
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}

          {/* REAL RESERVATIONS */}
          {tab === 'reservations' && (
            <>
              <ReservationsPanel token={token} />

              <section className="staff-panel staff-panel-spaced">
                <h2>Register a Walk-in (Demo Only)</h2>
                <p className="staff-muted">
                  This form updates sample data only.
                  It does not create reservations in Supabase.
                </p>

                <form
                  className="staff-form-grid"
                  onSubmit={registerWalkIn}
                >
                  <label>
                    Student name
                    <input
                      className="staff-input"
                      required
                      value={walkIn.student}
                      onChange={(e) =>
                        setWalkIn((x) => ({
                          ...x,
                          student: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Matric number
                    <input
                      className="staff-input"
                      required
                      value={walkIn.matric}
                      onChange={(e) =>
                        setWalkIn((x) => ({
                          ...x,
                          matric: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Room
                    <select
                      className="staff-input"
                      value={walkIn.room}
                      onChange={(e) =>
                        setWalkIn((x) => ({
                          ...x,
                          room: e.target.value,
                        }))
                      }
                    >
                      {rooms.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Start
                    <input
                      className="staff-input"
                      type="time"
                      value={walkIn.start}
                      onChange={(e) =>
                        setWalkIn((x) => ({
                          ...x,
                          start: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    End
                    <input
                      className="staff-input"
                      type="time"
                      value={walkIn.end}
                      onChange={(e) =>
                        setWalkIn((x) => ({
                          ...x,
                          end: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <button className="staff-primary" type="submit">
                    Add demo walk-in
                  </button>
                </form>

                <div className="staff-panel-heading">
                  <h3>Local demo bookings</h3>
                  <input
                    className="staff-input"
                    placeholder="Search sample bookings"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <BookingTable
                  bookings={filteredBookings}
                  onSelect={selectBooking}
                />
              </section>
            </>
          )}

          {/* QR CHECK-IN */}
          {tab === 'checkin' && (
            <section className="staff-panel">
              <h2>QR Check-in / Check-out — Demo Only</h2>

              <p className="staff-muted">
                This page does not update Supabase.
                Real QR verification requires authorized
                Laravel check-in routes.
              </p>

              <div className="staff-lookup">
                <input
                  className="staff-input"
                  placeholder="Enter LB-DEMO-1042"
                  aria-label="Booking reference"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') lookupBooking();
                  }}
                />

                <button
                  className="staff-primary"
                  type="button"
                  onClick={lookupBooking}
                >
                  Find sample booking
                </button>

                <button
                  className="staff-secondary"
                  type="button"
                  onClick={() => {
                    setQrInput('LB-DEMO-1042');
                    setSelectedBookingId('LB-DEMO-1042');
                  }}
                >
                  Try sample
                </button>
              </div>

              <CameraQrScanner
                onCode={(value) => {
                  setQrInput(value);
                  setNotice(
                    'QR captured, but this demo cannot authenticate real QR tokens.'
                  );
                }}
              />

              {selectedBooking ? (
                <div className="staff-detail-card">
                  <h3>{selectedBooking.id}</h3>
                  <p>
                    <strong>Student:</strong>{' '}
                    {selectedBooking.student} ({selectedBooking.matric})
                  </p>
                  <p>
                    <strong>Room:</strong> {selectedBooking.room}
                  </p>
                  <p>
                    <strong>Time:</strong>{' '}
                    {selectedBooking.start}–{selectedBooking.end}
                  </p>
                  <p>
                    <strong>Status:</strong> {selectedBooking.status}
                  </p>

                  <div className="staff-button-row">
                    <button
                      className="staff-primary"
                      type="button"
                      disabled={selectedBooking.status !== 'Confirmed'}
                      onClick={() =>
                        updateBookingStatus('Checked In')
                      }
                    >
                      Check in (demo)
                    </button>

                    <button
                      className="staff-secondary"
                      type="button"
                      disabled={selectedBooking.status !== 'Checked In'}
                      onClick={() =>
                        updateBookingStatus('Checked Out')
                      }
                    >
                      Check out (demo)
                    </button>

                    <button
                      className="staff-secondary"
                      type="button"
                      disabled={selectedBooking.status !== 'Confirmed'}
                      onClick={() =>
                        updateBookingStatus('No Show')
                      }
                    >
                      No-show (demo)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="staff-empty">
                  Select a sample booking to test the check-in workflow.
                </div>
              )}
            </section>
          )}

          {/* ROOM MANAGEMENT */}
          {tab === 'rooms' && (
            <section className="staff-panel">
              <div className="staff-panel-heading">
                <h2>Rooms & Maintenance (Demo)</h2>
                <span className="staff-muted">
                  {rooms.length} sample rooms
                </span>
              </div>

              <div className="staff-room-grid">
                {rooms.map((room) => (
                  <article className="staff-room" key={room.id}>
                    <div className="staff-panel-heading">
                      <strong>{room.name}</strong>
                      <span className={statusClass(room.status)}>
                        {room.status}
                      </span>
                    </div>

                    <p>{room.type} · {room.floor}</p>
                    <p>Capacity: {room.capacity}</p>

                    <button
                      className="staff-secondary"
                      type="button"
                      onClick={() => {
                        setRooms((items) =>
                          items.map((r) =>
                            r.id === room.id
                              ? {
                                  ...r,
                                  status:
                                    r.status === 'Active'
                                      ? 'Maintenance'
                                      : 'Active',
                                }
                              : r
                          )
                        );

                        setNotice(
                          'Room status changed locally only.'
                        );
                      }}
                    >
                      {room.status === 'Active'
                        ? 'Mark Maintenance'
                        : 'Return to Active'}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* WAITING LIST */}
          {tab === 'waitlist' && (
            <section className="staff-panel">
              <h2>Same-Day Waiting List (Demo)</h2>

              <div className="staff-table-scroll">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Student</th>
                      <th>Type</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {waitlist.map((entry, i) => (
                      <tr key={entry.id}>
                        <td>#{i + 1}</td>
                        <td>{entry.name}</td>
                        <td>{entry.type}</td>
                        <td>{entry.time}</td>
                        <td>{entry.status}</td>
                        <td>
                          <button
                            className="staff-mini-button"
                            type="button"
                            disabled={entry.status !== 'Waiting'}
                            onClick={() => {
                              setWaitlist((items) =>
                                items.map((w) =>
                                  w.id === entry.id
                                    ? { ...w, status: 'Offered' }
                                    : w
                                )
                              );

                              setNotice(
                                'Demo offer marked. No real room has been held.'
                              );
                            }}
                          >
                            Mark Offered (demo)
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* EXTENSIONS */}
          {tab === 'extensions' && (
            <section className="staff-panel">
              <h2>Booking Extensions (Demo)</h2>

              <div className="staff-table-scroll">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Booking</th>
                      <th>Student</th>
                      <th>Room</th>
                      <th>Requested end</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {extensions.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td>{item.booking_id}</td>
                        <td>{item.student}</td>
                        <td>{item.room}</td>
                        <td>{item.requested_end}</td>
                        <td>{item.status}</td>
                        <td>
                          <div className="staff-button-row">
                            {['Approved', 'Rejected'].map((status) => (
                              <button
                                key={status}
                                className="staff-mini-button"
                                type="button"
                                disabled={item.status !== 'Pending'}
                                onClick={() => {
                                  setExtensions((items) =>
                                    items.map((x) =>
                                      x.id === item.id
                                        ? { ...x, status }
                                        : x
                                    )
                                  );

                                  setNotice(
                                    `Extension ${status.toLowerCase()} in demo only.`
                                  );
                                }}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ISSUE REPORTS */}
          {tab === 'reports' && (
            <section className="staff-panel">
              <h2>Student Facility Issue Reports (Demo)</h2>

              <div className="staff-table-scroll">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Room</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {reports.map((report) => (
                      <tr key={report.id}>
                        <td>{report.id}</td>
                        <td>{report.room}</td>
                        <td>{report.category}</td>
                        <td>{report.description}</td>
                        <td>
                          <select
                            className="staff-input staff-select-small"
                            value={report.status}
                            onChange={(e) => {
                              setReports((items) =>
                                items.map((r) =>
                                  r.id === report.id
                                    ? { ...r, status: e.target.value }
                                    : r
                                )
                              );
                              setSummary(null);
                            }}
                          >
                            <option>Submitted</option>
                            <option>In Progress</option>
                            <option>Resolved</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* REPORT ANALYZER */}
          {tab === 'analyzer' && (
            <section className="staff-panel">
              <div className="staff-panel-heading">
                <h2>Report Analyzer (Demo)</h2>

                <button
                  className="staff-primary"
                  type="button"
                  onClick={generateSummary}
                >
                  Generate Summary
                </button>
              </div>

              <p className="staff-muted">
                This is a rule-based summary of sample reports,
                not live AI or real Supabase data.
              </p>

              {summary ? (
                <div className="staff-ai-results">
                  <h3>{summary.count} reports analyzed</h3>

                  <div className="staff-grid-two">
                    <div className="staff-detail-card">
                      <h3>By category</h3>
                      {summary.categories.map(([name, n]) => (
                        <p key={name}>
                          {name}: <strong>{n}</strong>
                        </p>
                      ))}
                    </div>

                    <div className="staff-detail-card">
                      <h3>Recurring room issues</h3>

                      {summary.recurring.length ? (
                        summary.recurring.map(([name, n]) => (
                          <p key={name}>
                            {name}: <strong>{n}</strong>
                          </p>
                        ))
                      ) : (
                        <p>None identified.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="staff-empty">
                  Click Generate Summary to analyze the sample reports.
                </div>
              )}
            </section>
          )}

          <footer className="staff-footer">
            NOIDEA · Universiti Teknologi Malaysia ·
            Live reservations / Demo management tools
          </footer>
        </main>
      </div>
    </div>
  );
}