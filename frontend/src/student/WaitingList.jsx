import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./WaitingList.css";
import { useAuth } from "../auth/AuthContext";
import { USE_MOCK_AUTH } from "../auth/authService";
import { formatBookingDate, formatTimeRange } from "./bookingService";
import {
  QUEUE_ROOM_TYPES,
  acceptOffer,
  getSlots,
  joinWaitingList,
  leaveWaitingList,
  listMyWaiting,
} from "./waitingListService";

const DAYS_AHEAD = 14;
const REFRESH_EVERY_MS = 20 * 1000;
const MIN_MINUTES_LEFT = 15; // same as WaitingListService::MIN_MINUTES_LEFT

const STATUS_LABELS = {
  waiting: "In queue",
  offered: "Room ready for you",
  fulfilled: "Booked",
  expired: "Offer expired",
  cancelled: "Left queue",
};

/** Today and the next 13 days, as YYYY-MM-DD in local (Malaysian) time. */
function upcomingDays() {
  const days = [];
  const today = new Date();
  for (let i = 0; i < DAYS_AHEAD; i += 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const name = i === 0 ? "Today" : i === 1 ? "Tomorrow" : day.toLocaleDateString("en-GB", { weekday: "short" });
    days.push({ iso, label: `${name}, ${day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` });
  }
  return days;
}

function shortDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function countdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** What a slot means for joining the queue. */
function slotState(slot, duration, queued, now) {
  const end = Date.parse(slot.start_at) + duration * 60 * 60 * 1000;

  if (queued?.status === "offered") return { kind: "queued", label: "Room ready · accept above" };
  if (queued) return { kind: "queued", label: `In queue · #${queued.position}` };
  if (slot.you_have_booking) return { kind: "mine", label: "You're booked" };
  if (end <= now + MIN_MINUTES_LEFT * 60 * 1000) return { kind: "over", label: "Over" };
  if (!slot.past && slot.free > 0) return { kind: "free", label: `${slot.free} free · book it` };
  if (slot.free > 0) return { kind: "join", label: "Free now · join to get it" };
  return { kind: "join", label: "Full · join queue" };
}

export default function WaitingList() {
  const { token } = useAuth();
  const days = useMemo(upcomingDays, []);

  // Your requests
  const [mine, setMine] = useState(null);
  const [offset, setOffset] = useState(0); // server clock minus this computer's clock
  const [mineError, setMineError] = useState("");
  const [now, setNow] = useState(Date.now());

  // Join form
  const [roomType, setRoomType] = useState(QUEUE_ROOM_TYPES[0].id);
  const [date, setDate] = useState(days[0].iso);
  const [durationByType, setDurationByType] = useState({}); // hours picked, per room type
  const duration = durationByType[roomType] ?? null;
  const [slots, setSlots] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");

  const [busy, setBusy] = useState(""); // what is being sent right now
  const [notice, setNotice] = useState(null); // { tone: "ok" | "error", text }
  const expiredRef = useRef(new Set());

  const loadMine = useCallback(async () => {
    if (USE_MOCK_AUTH) return;
    try {
      const data = await listMyWaiting(token);
      setOffset(Date.parse(data.server_time) - Date.now());
      setMine(data);
      setMineError("");
    } catch (err) {
      setMineError(err.message);
    }
  }, [token]);

  const loadSlots = useCallback(async () => {
    if (USE_MOCK_AUTH) return;
    setSlotsLoading(true);
    setSlotsError("");
    try {
      setSlots(await getSlots(token, roomType, date, duration));
    } catch (err) {
      setSlots(null);
      setSlotsError(err.message);
    } finally {
      setSlotsLoading(false);
    }
  }, [token, roomType, date, duration]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const entries = mine?.entries ?? [];
  const offers = entries.filter((entry) => entry.status === "offered");
  const waiting = entries.filter((entry) => entry.status === "waiting");
  const history = entries.filter((entry) => !["offered", "waiting"].includes(entry.status));
  const hasActive = offers.length + waiting.length > 0;
  const serverNow = now + offset;

  // Clock for the countdowns
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // While you're in a queue, check for offers regularly
  useEffect(() => {
    if (!hasActive) return undefined;
    const timer = window.setInterval(loadMine, REFRESH_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [hasActive, loadMine]);

  // When an offer's countdown hits zero, ask the server what happened
  useEffect(() => {
    for (const entry of offers) {
      if (Date.parse(entry.offer?.expires_at) <= serverNow && !expiredRef.current.has(entry.id)) {
        expiredRef.current.add(entry.id);
        loadMine();
        loadSlots();
      }
    }
  }, [offers, serverNow, loadMine, loadSlots]);

  function chooseType(id) {
    setRoomType(id);
    setNotice(null);
  }

  async function join(slot) {
    setBusy(`join-${slot.start_time}`);
    setNotice(null);
    try {
      const entry = await joinWaitingList(token, {
        roomType,
        date,
        startTime: slot.start_time,
        duration: slots.duration,
      });
      setNotice({
        tone: "ok",
        text:
          entry.status === "offered"
            ? "A room is free right now and is being held for you. Accept it below."
            : `You joined the queue for ${entry.room_group}, ${formatTimeRange(entry.start_time, entry.end_time)}. You're #${entry.position} in line.`,
      });
      await Promise.all([loadMine(), loadSlots()]);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
      loadSlots();
    } finally {
      setBusy("");
    }
  }

  async function accept(entry) {
    setBusy(`accept-${entry.id}`);
    setNotice(null);
    try {
      const { booking } = await acceptOffer(token, entry.id);
      setNotice({
        tone: "ok",
        text: `Booked ${booking.room_name} (${booking.reference}). Show your QR code at the counter within ${
          mine?.rules?.check_in_minutes ?? 15
        } minutes of the start time. You'll find it in My Bookings.`,
      });
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy("");
      await Promise.all([loadMine(), loadSlots()]);
    }
  }

  async function leave(entry) {
    setBusy(`leave-${entry.id}`);
    setNotice(null);
    try {
      await leaveWaitingList(token, entry.id);
      setNotice({
        tone: "ok",
        text:
          entry.status === "offered"
            ? "You declined the room. It has been offered to the next person."
            : "You left the queue.",
      });
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy("");
      await Promise.all([loadMine(), loadSlots()]);
    }
  }

  const checkInMinutes = mine?.rules?.check_in_minutes ?? 15;
  const offerMinutes = mine?.rules?.offer_minutes ?? 10;
  const typeName = QUEUE_ROOM_TYPES.find((type) => type.id === roomType)?.name;

  const visibleSlots = (slots?.slots ?? [])
    .map((slot) => {
      const queued = waiting
        .concat(offers)
        .find(
          (entry) =>
            entry.room_type === roomType &&
            entry.date === date &&
            entry.start_time === slot.start_time &&
            entry.end_time === slot.end_time
        );
      return { slot, state: slotState(slot, slots.duration, queued, serverNow) };
    })
    .filter(({ state }) => state.kind !== "over");
  const joinable = visibleSlots.filter(({ state }) => state.kind === "join").length;

  return (
    <div className="waiting-list">
      <div className="waiting-heading">
        <div>
          <p className="page-eyebrow">YOUR NEXT AVAILABLE SPACE</p>
          <h1 className="page-title">Waiting List</h1>
          <p className="page-description">
            Every room taken? Join the queue for that time and take the room as soon as one frees up.
          </p>
        </div>
        {!USE_MOCK_AUTH && (
          <button type="button" className="waiting-button secondary" onClick={() => { loadMine(); loadSlots(); }}>
            ↻ Refresh
          </button>
        )}
      </div>

      <div className="waiting-guidance">
        Students who don't check in within {checkInMinutes} minutes of their booking start lose the booking. The room
        is then offered to the first person in the queue, who has {offerMinutes} minutes to accept before it moves to
        the next person.
      </div>

      {USE_MOCK_AUTH ? (
        <section className="waiting-empty">
          <h2>The waiting list needs the real login</h2>
          <p>
            You're signed in with demo mode, so the server doesn't know who you are. In <code>frontend/.env.local</code>{" "}
            set <code>VITE_USE_MOCK_AUTH=false</code>, restart <code>npm run dev</code>, and sign in again.
          </p>
        </section>
      ) : (
        <>
          {notice && (
            <p className={`waiting-alert ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
              {notice.text}
            </p>
          )}
          {mineError && (
            <p className="waiting-alert error" role="alert">
              Couldn't load your requests. {mineError}
            </p>
          )}

          {/* ---------- Offers ---------- */}
          {offers.map((entry) => {
            const left = Date.parse(entry.offer?.expires_at) - serverNow;
            return (
              <article className="waiting-card is-offer" key={entry.id}>
                <div className="waiting-card-top">
                  <span className="waiting-category">ROOM READY · {entry.room_group.toUpperCase()}</span>
                  <span className="waiting-status offered">{STATUS_LABELS.offered}</span>
                </div>
                <h2>{entry.offer?.room_name ?? entry.room_group}</h2>
                <p className="waiting-slot">
                  {formatBookingDate(entry.date)} ·{" "}
                  {formatTimeRange(entry.offer?.start_time ?? entry.start_time, entry.offer?.end_time ?? entry.end_time)}
                  {entry.offer?.location ? ` · ${entry.offer.location}` : ""}
                </p>
                <div className="waiting-offer">
                  <div>
                    <strong>A room is being held for you</strong>
                    <p>Accept before the countdown ends, or it goes to the next person in the queue.</p>
                  </div>
                  <span className="waiting-timer" aria-label="Time left to accept">
                    {countdown(left)}
                  </span>
                </div>
                <div className="waiting-actions">
                  <button
                    type="button"
                    className="waiting-button primary"
                    disabled={Boolean(busy) || left <= 0}
                    onClick={() => accept(entry)}
                  >
                    {busy === `accept-${entry.id}` ? "Booking…" : "Accept Room"}
                  </button>
                  <button
                    type="button"
                    className="waiting-button quiet"
                    disabled={Boolean(busy)}
                    onClick={() => leave(entry)}
                  >
                    Decline
                  </button>
                </div>
              </article>
            );
          })}

          {/* ---------- Join ---------- */}
          <section className="waiting-form">
            <h2>Join a waiting list</h2>
            <p>
              Pick a room type and day. Times marked <strong>Full</strong> can be queued for. If a room is still free,
              book it from Browse Rooms instead.
            </p>

            <div className="waiting-form-controls">
              <label htmlFor="waiting-type">
                Room type
                <select id="waiting-type" value={roomType} onChange={(event) => chooseType(event.target.value)}>
                  {QUEUE_ROOM_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>

              <label htmlFor="waiting-date">
                Day
                <select id="waiting-date" value={date} onChange={(event) => setDate(event.target.value)}>
                  {days.map((day) => (
                    <option key={day.iso} value={day.iso}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </label>

              {slots?.durations?.length > 1 && (
                <div className="waiting-durations" role="radiogroup" aria-label="Duration">
                  {slots.durations.map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      role="radio"
                      aria-checked={slots.duration === hours}
                      className={`waiting-chip ${slots.duration === hours ? "is-selected" : ""}`}
                     onClick={() => setDurationByType((current) => ({ ...current, [roomType]: hours }))}
                    >
                      {hours} {hours === 1 ? "hour" : "hours"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {slotsLoading && !slots ? (
              <p className="waiting-hint">Loading times…</p>
            ) : slotsError ? (
              <p className="waiting-alert error">{slotsError}</p>
            ) : visibleSlots.length === 0 ? (
              <p className="waiting-hint">No more times left on this day. Try another day.</p>
            ) : (
              <>
                <p className="waiting-hint">
                  {joinable === 0
                    ? `${typeName}: nothing to queue for on this day. Every time below still has a free room or is yours.`
                    : `${typeName}: ${joinable} ${joinable === 1 ? "time" : "times"} you can queue for.`}
                </p>
                <div className="waiting-slots">
                  {visibleSlots.map(({ slot, state }) => (
                    <button
                      key={slot.start_time}
                      type="button"
                      className={`waiting-slot-chip ${state.kind}`}
                      disabled={state.kind !== "join" || Boolean(busy)}
                      onClick={() => join(slot)}
                    >
                      <strong>{formatTimeRange(slot.start_time, slot.end_time)}</strong>
                      <span>{busy === `join-${slot.start_time}` ? "Joining…" : state.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ---------- Your queues ---------- */}
          <div className="waiting-section-heading">
            <h2>Your queues</h2>
            <span>
              {waiting.length + offers.length} of {mine?.rules?.max_requests ?? 3} used
            </span>
          </div>

          {mine === null && !mineError ? (
            <p className="waiting-hint">Loading your requests…</p>
          ) : waiting.length === 0 ? (
            <section className="waiting-empty">
              <h2>A little patience, a better space.</h2>
              <p>You're not in any queue. Choose a full time above to join one.</p>
            </section>
          ) : (
            <div className="waiting-cards">
              {waiting.map((entry) => {
                const ahead = entry.position - 1;
                return (
                  <article className="waiting-card" key={entry.id}>
                    <div className="waiting-card-top">
                      <span className="waiting-category">
                        {entry.reference} · {entry.room_group.toUpperCase()}
                      </span>
                      <span className="waiting-status waiting">{STATUS_LABELS.waiting}</span>
                    </div>
                    <h2>{formatTimeRange(entry.start_time, entry.end_time)}</h2>
                    <p className="waiting-slot">
                      {formatBookingDate(entry.date)} · joined at{" "}
                      {new Date(entry.joined_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                    <div className="waiting-position">
                      <strong>{entry.position}</strong>
                      <div>
                        <span>
                          Position {entry.position} of {entry.line_size} ·{" "}
                          {ahead === 0 ? "you're next" : `${ahead} ${ahead === 1 ? "person" : "people"} ahead of you`}
                        </span>
                        <p>
                          When a room frees up (a cancellation or a no-show after {checkInMinutes} minutes), it's
                          offered here in order. Keep this page open or check your Dashboard.
                        </p>
                      </div>
                    </div>
                    <div className="waiting-actions">
                      <button
                        type="button"
                        className="waiting-button quiet"
                        disabled={Boolean(busy)}
                        onClick={() => leave(entry)}
                      >
                        {busy === `leave-${entry.id}` ? "Leaving…" : "Leave Queue"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* ---------- History ---------- */}
          {history.length > 0 && (
            <>
              <div className="waiting-section-heading">
                <h2>Recent requests</h2>
                <span>Last 7 days</span>
              </div>
              <ul className="waiting-log">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <time>{shortDate(entry.date)}</time>
                    <span>
                      <strong className={`waiting-status ${entry.status}`}>{STATUS_LABELS[entry.status] ?? entry.status}</strong>{" "}
                      {entry.room_group}, {formatTimeRange(entry.start_time, entry.end_time)}
                      {entry.booking ? ` → ${entry.booking.room_name} (${entry.booking.reference})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="waiting-footnote">
            Times are Malaysian time. While you're in a queue, this page checks for offers every 20 seconds.
          </p>
        </>
      )}
    </div>
  );
}