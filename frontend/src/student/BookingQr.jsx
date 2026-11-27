import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { USE_MOCK_AUTH } from "../auth/authService";
import { getBookingQr, getBookingQrStatus } from "./bookingService";
import "./BookingQr.css";

const POLL_MS = 3000;
const TZ = "Asia/Kuala_Lumpur";

function clock(iso) {
  return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }) : "";
}

function countdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}:${String(s).padStart(2, "0")}`;
}

/** What the student sees under the QR for each state the server reports. */
function describe(status, now) {
  if (!status) return null;
  const deadline = Date.parse(status.check_in_deadline);

  switch (status.qr_state) {
    case "not_yet_open":
      return {
        tone: "waiting",
        title: "Waiting for check-in",
        text: `Check-in opens at ${clock(status.check_in_opens_at)}. Show this QR at the counter between ${clock(
          status.check_in_opens_at
        )} and ${clock(status.check_in_deadline)}.`,
      };
    case "check_in":
      return {
        tone: "urgent",
        title: `Check in within ${countdown(deadline - now)}`,
        text: `Show this QR at the counter before ${clock(status.check_in_deadline)}, or the QR expires and the booking is cancelled.`,
      };
    case "check_out":
      return {
        tone: "ok",
        title: `Checked in at ${clock(status.checked_in_at)}`,
        text: "Enjoy your session. When you leave, show this same QR at the counter to check out.",
      };
    case "used":
      return {
        tone: "done",
        title: `Checked out at ${clock(status.checked_out_at)}`,
        text: "Thanks for returning the room. This QR code no longer works.",
        hideQr: true,
      };
    default:
      return {
        tone: "expired",
        title: "QR code expired",
        text:
          status.status === "no_show" || status.status === "confirmed"
            ? "You did not check in within 15 minutes of the start time, so this booking was cancelled and the room was released."
            : "This booking is no longer active, so the QR code does not work.",
        hideQr: true,
      };
  }
}

/**
 * The student's booking QR, with a live status underneath.
 * The QR holds a one-time random token from the server. While it is on screen the
 * status is polled every few seconds, so the moment staff scan it the student sees
 * "Checked in", and later "Checked out" (or "Expired" if they never came).
 */
export default function BookingQr({ token, bookingId, reference, size = 220, onStatusChange }) {
  const demo = USE_MOCK_AUTH || !bookingId;
  const [qr, setQr] = useState(() =>
    demo ? { loading: false, value: `DEMO-${reference}`, error: "" } : { loading: true, value: "", error: "" }
  );
  const [status, setStatus] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const lastStatus = useRef(null);
  const notify = useRef(onStatusChange);
  useEffect(() => {
    notify.current = onStatusChange;
  }, [onStatusChange]);

  // Get a fresh QR token when the panel opens (parents remount this per booking with a key)
  useEffect(() => {
    let cancelled = false;
    if (demo) return undefined;
    getBookingQr(token, bookingId)
      .then((data) => {
        if (cancelled) return;
        setQr({ loading: false, value: data.qr_token ?? "", error: "" });
        setStatus(data);
        lastStatus.current = data.status;
      })
      .catch((err) => !cancelled && setQr({ loading: false, value: "", error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [token, bookingId, demo]);

  // Poll the status while the QR is showing
  useEffect(() => {
    if (demo || !qr.value) return undefined;
    let stopped = false;
    const poll = async () => {
      try {
        const data = await getBookingQrStatus(token, bookingId);
        if (stopped) return;
        setStatus(data);
        if (lastStatus.current && data.status !== lastStatus.current) notify.current?.(data.status);
        lastStatus.current = data.status;
      } catch {
        /* keep the last known status; try again next tick */
      }
    };
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [token, bookingId, demo, qr.value]);

  // Tick the countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (qr.loading) return <p className="bqr-note">Generating your booking QR code…</p>;
  if (qr.error) return <p className="bqr-note bqr-error" role="alert">{qr.error}</p>;

  // The deadline passed on this screen before the server's next answer
  let shown = status;
  if (shown?.qr_state === "check_in" && now >= Date.parse(shown.check_in_deadline)) {
    shown = { ...shown, qr_state: "expired" };
  }
  const view = describe(shown, now);

  return (
    <div className="bqr">
      {!view?.hideQr && (
        <div className="bqr-code">
          <QRCodeSVG value={qr.value} size={size} level="M" marginSize={4} />
        </div>
      )}
      {reference && <strong className="bqr-ref">{reference}</strong>}

      {view ? (
        <div className={`bqr-status ${view.tone}`} role="status" aria-live="polite">
          <span className="bqr-dot" aria-hidden="true" />
          <div>
            <b>{view.title}</b>
            <p>{view.text}</p>
          </div>
        </div>
      ) : (
        <p className="bqr-note">Sample QR (demo login). Sign in to get a real code.</p>
      )}

      {!view?.hideQr && (
        <small className="bqr-note">Keep this QR private. Opening it again makes the old code stop working.</small>
      )}
    </div>
  );
}