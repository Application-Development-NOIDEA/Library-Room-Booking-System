import { useCallback, useEffect, useRef, useState } from 'react';
import CameraQrScanner from './CameraQrScanner';
import { staffApi } from './staffService';
import './ScanDesk.css';

/*
 * The QR / Check-in Desk.
 *
 * Scan a student's QR (camera or USB scanner) and the desk does the rest:
 *   - a confirmed booking is checked in, a checked-in booking is checked out,
 *   - the student's full booking details are shown in a big result card,
 *   - a beep says if it worked, and the card clears itself for the next student.
 * Too early / expired / invalid codes are refused with the reason.
 *
 * Typing a reference (BK-0012) only looks the booking up. Checking someone in
 * without their QR is a manual override, tucked away for when a phone is dead.
 */

const TZ = 'Asia/Kuala_Lumpur';
const CHECK_IN_EARLY_MIN = 15; // same as BookingQrService
const CHECK_IN_GRACE_MIN = 15; // same as WaitingListService
const RESET_AFTER_OK_MS = 8000; // clear a successful result after this long
const RESET_AFTER_ERROR_MS = 15000;
const HISTORY_SIZE = 8;
/** A second scan of the same QR this soon after check-in is treated as a double scan, not a check-out. */
const DOUBLE_SCAN_GUARD_MS = 2 * 60 * 1000;

const STATUS_LABELS = {
  confirmed: 'Confirmed', held: 'Held', checked_in: 'Checked In', checked_out: 'Checked Out',
  cancelled: 'Cancelled', no_show: 'No Show',
};
const label = (s) => STATUS_LABELS[s] ?? s;
const statusClass = (s) => `staff-status staff-status--${String(label(s)).toLowerCase().replace(/[^a-z]+/g, '-')}`;

/* ---------- time helpers (booking times from the API are Malaysia time) ---------- */

function libraryTime(date, hhmm) {
  return new Date(`${date}T${hhmm}:00+08:00`);
}
function dayOf(date) {
  return libraryTime(date, '12:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ,
  });
}
function hhmm(d) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}
function ymd(d) {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}
/** "07:45", or "07:45 on Sun, 29 Nov 2026" when it isn't today. */
function whenOf(d, now = new Date()) {
  return ymd(d) === ymd(now) ? hhmm(d) : `${hhmm(d)} on ${dayOf(ymd(d))}`;
}
function clockOf(iso) {
  return iso ? hhmm(new Date(iso)) : '';
}
/** 65 minutes -> "1h 05m" */
function duration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : `${mins} min`;
}

/* ---------- what the big card says for each scan outcome ---------- */

const OUTCOMES = {
  checked_in: { tone: 'ok', icon: '✓', title: 'Checked in' },
  checked_out: { tone: 'out', icon: '✓', title: 'Checked out' },
  not_yet_open: { tone: 'warn', icon: '!', title: 'Too early' },
  expired: { tone: 'error', icon: '✕', title: 'QR expired' },
  used: { tone: 'error', icon: '✕', title: 'Already checked out' },
  invalid: { tone: 'error', icon: '✕', title: 'QR not recognised' },
  refused: { tone: 'error', icon: '✕', title: 'Not accepted' },
  lookup: { tone: 'info', icon: 'i', title: 'Booking found' },
  double_scan: { tone: 'info', icon: 'i', title: 'Already checked in' },
  manual_in: { tone: 'ok', icon: '✓', title: 'Checked in (manual)' },
  manual_out: { tone: 'out', icon: '✓', title: 'Checked out (manual)' },
  manual_no_show: { tone: 'error', icon: '✕', title: 'Marked as no-show' },
  error: { tone: 'error', icon: '✕', title: 'Scan failed' },
};

/** A friendlier sentence than the server's for some outcomes. */
function messageFor(kind, booking, serverMessage) {
  const b = booking;
  if (!b) return serverMessage;
  const start = libraryTime(b.date, b.start_time);
  const end = libraryTime(b.date, b.end_time);
  switch (kind) {
    case 'checked_in':
    case 'manual_in':
      return `${b.student} can go to ${b.room_name}. The booking ends at ${b.end_time}; scan the same QR when they leave.`;
    case 'checked_out':
    case 'manual_out': {
      const used = b.checked_in_at && b.checked_out_at
        ? ` Used ${duration(Date.parse(b.checked_out_at) - Date.parse(b.checked_in_at))} of ${duration(end - start)}.`
        : '';
      return `${b.room_name} is free again.${used}`;
    }
    case 'not_yet_open':
      return `This booking starts at ${b.start_time} on ${dayOf(b.date)}. Check-in opens at ${hhmm(
        new Date(start.getTime() - CHECK_IN_EARLY_MIN * 60000)
      )}. Nothing was changed.`;
    case 'expired':
      return b.status === 'confirmed' || b.status === 'no_show'
        ? `The student did not check in by ${whenOf(new Date(start.getTime() + CHECK_IN_GRACE_MIN * 60000))}, so the booking is cancelled and the room is released.`
        : serverMessage;
    case 'double_scan':
      return `${b.student} was checked in at ${clockOf(b.checked_in_at)}, just now. Nothing was changed. Scan the QR again when they leave to check out.`;
    case 'lookup':
      return 'Found by reference, so nothing was changed. Ask the student to show their QR to check in or out.';
    default:
      return serverMessage;
  }
}

/** Short beep: rising for success, low buzz for a refusal. Silent if the browser blocks audio. */
function beep(ok) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = ok ? [880, 1320] : [220, 180];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = ok ? 'sine' : 'square';
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.1);
    });
    window.setTimeout(() => ctx.close(), 600);
  } catch {
    /* no sound available */
  }
  try {
    navigator.vibrate?.(ok ? 80 : [60, 60, 60]);
  } catch {
    /* no vibration */
  }
}

/** Which manual override buttons make sense right now (only for the "phone not working" case). */
function manualOptions(b, now) {
  const start = libraryTime(b.date, b.start_time);
  const end = libraryTime(b.date, b.end_time);
  const opens = new Date(start.getTime() - CHECK_IN_EARLY_MIN * 60000);
  const deadline = new Date(start.getTime() + CHECK_IN_GRACE_MIN * 60000);
  return {
    checkIn: b.status === 'confirmed' && now >= opens && now < deadline && now < end,
    checkOut: b.status === 'checked_in',
    noShow: b.status === 'confirmed' && now >= deadline,
    opens,
    deadline,
  };
}

/* ---------- the booking details shown on every result ---------- */

function BookingDetails({ booking: b }) {
  const start = libraryTime(b.date, b.start_time);
  const deadline = new Date(start.getTime() + CHECK_IN_GRACE_MIN * 60000);
  return (
    <dl className="scan-details">
      <div><dt>Student</dt><dd>{b.student ?? '—'}{b.matric ? <small>{b.matric}</small> : null}</dd></div>
      <div><dt>Booking</dt><dd>{b.reference}</dd></div>
      <div><dt>Room</dt><dd>{b.room_name}{b.room_code ? <small>{b.room_code}</small> : null}</dd></div>
      <div><dt>Date</dt><dd>{dayOf(b.date)}</dd></div>
      <div><dt>Time</dt><dd>{b.start_time} – {b.end_time}</dd></div>
      <div><dt>Status</dt><dd><span className={statusClass(b.status)}>{label(b.status)}</span></dd></div>
      {b.checked_in_at && <div><dt>Checked in</dt><dd>{clockOf(b.checked_in_at)}</dd></div>}
      {b.checked_out_at && <div><dt>Checked out</dt><dd>{clockOf(b.checked_out_at)}</dd></div>}
      {b.status === 'confirmed' && <div><dt>Check in by</dt><dd>{whenOf(deadline)}</dd></div>}
    </dl>
  );
}

export default function ScanDesk({ token, onChanged, initialBooking = null }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(() =>
    initialBooking ? { kind: 'lookup', booking: initialBooking, message: messageFor('lookup', initialBooking), at: new Date() } : null
  );
  const [history, setHistory] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const resetTimer = useRef(null);
  const recentCheckIns = useRef(new Map()); // QR code -> { at, booking } for the double-scan guard
  const inputRef = useRef(null);

  // Clock for the manual buttons and the "ready" screen
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const show = useCallback((kind, booking, serverMessage, { log = true, sound = true } = {}) => {
    const outcome = OUTCOMES[kind] ?? OUTCOMES.refused;
    const entry = { kind, booking, message: messageFor(kind, booking, serverMessage), at: new Date() };
    setResult(entry);
    if (sound && kind !== 'lookup' && kind !== 'double_scan') beep(outcome.tone === 'ok' || outcome.tone === 'out');
    if (log && kind !== 'lookup' && kind !== 'double_scan') setHistory((h) => [entry, ...h].slice(0, HISTORY_SIZE));

    window.clearTimeout(resetTimer.current);
    if (kind !== 'lookup') {
      const ok = outcome.tone === 'ok' || outcome.tone === 'out';
      resetTimer.current = window.setTimeout(() => setResult(null), ok ? RESET_AFTER_OK_MS : RESET_AFTER_ERROR_MS);
    }
    // Ready for the USB scanner's next code
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  /* A scanned QR: the server checks in or out and tells us what happened. */
  const scan = useCallback(
    async (code) => {
      const key = code.toLowerCase();
      const recent = recentCheckIns.current.get(key);
      if (recent && Date.now() - recent.at < DOUBLE_SCAN_GUARD_MS) {
        show('double_scan', recent.booking, '', { sound: false });
        return;
      }
      setBusy(true);
      try {
        const res = await staffApi.scan(token, code);
        const kind = res.result && OUTCOMES[res.result] ? res.result : res.ok ? 'checked_in' : 'refused';
        if (kind === 'checked_in') recentCheckIns.current.set(key, { at: Date.now(), booking: res.booking });
        show(kind, res.booking ?? null, res.message);
        if (res.ok) onChanged?.();
      } catch (err) {
        show('error', null, err.message);
      } finally {
        setBusy(false);
      }
    },
    [token, show, onChanged]
  );

  /* Typed reference: look the booking up only. */
  const lookup = useCallback(
    async (ref) => {
      setBusy(true);
      try {
        const { booking } = await staffApi.lookup(token, ref);
        show('lookup', booking, '');
      } catch (err) {
        show('invalid', null, err.message, { sound: false, log: false });
      } finally {
        setBusy(false);
      }
    },
    [token, show]
  );

  const submit = useCallback(
    (value) => {
      const code = value.trim();
      if (!code) return;
      setInput('');
      if (/^[a-f0-9]{64}$/i.test(code)) scan(code); // QR token (USB scanners type it + Enter)
      else lookup(code);
    },
    [scan, lookup]
  );

  const onCamera = useCallback((code) => submit(code), [submit]);

  async function manual(kind) {
    const b = result?.booking;
    if (!b) return;
    setBusy(true);
    try {
      const call = { manual_in: staffApi.checkIn, manual_out: staffApi.checkOut, manual_no_show: staffApi.noShow }[kind];
      const res = await call(token, b.id);
      show(kind, res.booking ?? b, '');
      onChanged?.();
    } catch (err) {
      show('refused', b, err.message);
    } finally {
      setBusy(false);
    }
  }

  const outcome = result ? OUTCOMES[result.kind] ?? OUTCOMES.refused : null;
  const options = result?.booking ? manualOptions(result.booking, now) : null;
  const anyManual = options && (options.checkIn || options.checkOut || options.noShow);

  return (
    <section className="staff-panel scan-desk">
      <h2>QR Check-in / Check-out</h2>
      <p className="staff-muted">
        Scan the student&apos;s booking QR. The first scan checks them in, and scanning the same QR when they leave
        checks them out. No buttons to press. Check-in opens 15 minutes before the start and closes 15 minutes after
        it; after that the QR expires and the booking is cancelled automatically.
      </p>

      <div className="scan-layout">
        <div className="scan-input-col">
          <CameraQrScanner onCode={onCamera} />
          <div className="staff-lookup">
            <input
              ref={inputRef}
              className="staff-input"
              placeholder="USB scanner, or type BK-0012"
              aria-label="QR code or booking reference"
              value={input}
              autoFocus
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit(input);
              }}
            />
            <button className="staff-primary" type="button" disabled={busy} onClick={() => submit(input)}>
              Go
            </button>
          </div>
        </div>

        <div className="scan-result-col" aria-live="assertive">
          {busy && !result && <div className="scan-card tone-idle"><p>Checking…</p></div>}

          {!result && !busy && (
            <div className="scan-card tone-idle">
              <span className="scan-icon" aria-hidden="true">▣</span>
              <h3>Ready for the next student</h3>
              <p>Hold the QR up to the camera, or scan it with the USB scanner.</p>
            </div>
          )}

          {result && (
            <div className={`scan-card tone-${outcome.tone}`} role="status">
              <div className="scan-card-head">
                <span className="scan-icon" aria-hidden="true">{outcome.icon}</span>
                <div>
                  <h3>{outcome.title}</h3>
                  <p>{result.message}</p>
                </div>
                <button type="button" className="scan-close" aria-label="Clear" onClick={() => setResult(null)}>×</button>
              </div>

              {result.booking && <BookingDetails booking={result.booking} />}

              {result.booking && anyManual && (
                <details className="scan-manual">
                  <summary>Student&apos;s phone not working? Manual override</summary>
                  <p className="staff-muted">Check their student card before using these.</p>
                  <div className="staff-button-row">
                    {options.checkIn && (
                      <button type="button" className="staff-secondary" disabled={busy} onClick={() => manual('manual_in')}>
                        Check in manually
                      </button>
                    )}
                    {options.checkOut && (
                      <button type="button" className="staff-secondary" disabled={busy} onClick={() => manual('manual_out')}>
                        Check out manually
                      </button>
                    )}
                    {options.noShow && (
                      <button type="button" className="staff-secondary" disabled={busy} onClick={() => manual('manual_no_show')}>
                        Mark no-show now
                      </button>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="scan-history">
          <h3>Recent scans</h3>
          <ul>
            {history.map((h, i) => {
              const o = OUTCOMES[h.kind] ?? OUTCOMES.refused;
              return (
                <li key={`${h.at.getTime()}-${i}`} className={`tone-${o.tone}`}>
                  <span className="scan-history-time">{hhmm(h.at)}</span>
                  <span className="scan-history-dot" aria-hidden="true">{o.icon}</span>
                  <span className="scan-history-what">{o.title}</span>
                  <span className="scan-history-who">
                    {h.booking ? `${h.booking.student ?? ''} · ${h.booking.reference} · ${h.booking.room_name}` : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}