import { useEffect, useState } from "react";
import "./WaitingList.css";
import {
  ACTIVE_STATUSES,
  CHECK_IN_GRACE,
  MINUTE,
  OFFER_WINDOW,
  acceptOffer,
  advance,
  createInitialState,
  joinRoom,
  leaveEntry,
  lineFor,
  simulateCheckIn,
} from "./waitingListEngine";

const TYPE_LABELS = {
  carrel: "CARREL ROOM",
  discussion: "DISCUSSION ROOM",
  meeting: "MEETING ROOM",
};

const ROOM_STATUS = {
  available: { label: "Available", className: "available" },
  held: { label: "Offered to queue", className: "held" },
  reserved: { label: "Awaiting check-in", className: "reserved" },
  occupied: { label: "In use", className: "occupied" },
};

const statusLabels = {
  waiting: "In queue",
  offered: "Room available",
  accepted: "Room booked",
  checked_in: "Checked in",
  expired: "Offer expired",
  cancelled: "Booking cancelled",
};

function clock(time) {
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function countdown(target, now) {
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function WaitingList() {
  const [realNow, setRealNow] = useState(Date.now());
  const [offset, setOffset] = useState(0); // demo "skip time" offset
  const [data, setData] = useState(() => createInitialState(Date.now()));
  const [roomId, setRoomId] = useState("dr01");
  const [notice, setNotice] = useState("");

  const now = realNow + offset;

  useEffect(() => {
    const timer = window.setInterval(() => setRealNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Apply the queue rules every tick: no-show cancel, offer expiry, hand-over.
  useEffect(() => {
    setData((current) => advance(current, now));
  }, [now]);

  const { rooms, queue, log } = data;
  const myEntries = queue
    .filter((entry) => entry.isYou)
    .sort((a, b) => b.joinedAt - a.joinedAt);

  function join(targetRoomId) {
    const room = rooms.find((item) => item.id === targetRoomId);
    const alreadyJoined = myEntries.some(
      (entry) => entry.roomId === targetRoomId && ACTIVE_STATUSES.includes(entry.status)
    );

    if (alreadyJoined) {
      setNotice(`You already have an active request for ${room.name}.`);
      return;
    }

    const ahead = lineFor(queue, targetRoomId).length;
    const freeNow = room.status === "available" && ahead === 0;

    setData((current) => joinRoom(current, targetRoomId, now));
    setNotice(
      freeNow
        ? `${room.name} is free right now. Accept the offer below to book it.`
        : `You joined the queue for ${room.name}. You are #${ahead + 1} in line.`
    );
  }

  function handleSubmit(event) {
    event.preventDefault();
    join(roomId);
  }

  function handleAccept(entry) {
    if (entry.expiresAt <= now) {
      setNotice("This offer has expired and was passed to the next person.");
    } else {
      setNotice("Room booked. Show your QR code at the counter within 15 minutes.");
    }
    setData((current) => acceptOffer(current, entry.id, now));
  }

  function handleLeave(entry) {
    const messages = {
      waiting: "You left the queue.",
      offered: "You declined the offer. It has been passed to the next person.",
      accepted: "Your booking was cancelled and the room passed to the next person.",
    };
    setData((current) => leaveEntry(current, entry.id, now));
    setNotice(messages[entry.status] ?? "Your waiting-list request has been removed.");
  }

  function handleCheckIn(entry) {
    setData((current) => simulateCheckIn(current, entry.id, now));
    setNotice("Checked in. Enjoy your session!");
  }

  function skip(minutes) {
    setOffset((value) => value + minutes * MINUTE);
  }

  function resetDemo() {
    setOffset(0);
    setData(createInitialState(Date.now()));
    setNotice("Demo reset.");
  }

  function roomDetail(room) {
    if (room.status === "available") return "Free now";
    if (room.status === "occupied") return room.endTime ? `Free at ${clock(room.endTime)}` : "In session";
    if (room.status === "reserved") {
      return `Check-in closes in ${countdown(room.checkInDeadline, now)}`;
    }
    const entry = queue.find((q) => q.id === room.heldFor);
    return entry ? `Offer ends in ${countdown(entry.expiresAt, now)}` : "Offered to queue";
  }

  function whyWaiting(room) {
    if (room.status === "reserved") {
      return `Booked by another student. If they don't check in within ${countdown(
        room.checkInDeadline,
        now
      )}, the booking is cancelled and the room moves down the queue.`;
    }
    if (room.status === "occupied") {
      return `In use until about ${clock(room.endTime)}. It will be offered to the queue when it frees up.`;
    }
    if (room.status === "held") {
      return "The student ahead of you has an offer. If they don't accept in time, it moves to the next person.";
    }
    return "We will show an offer here as soon as the room is available.";
  }

  return (
    <div className="waiting-list">
      <div className="waiting-heading">
        <div>
          <p className="page-eyebrow">YOUR NEXT AVAILABLE SPACE</p>
          <h1 className="page-title">Waiting List</h1>
          <p className="page-description">
            See which rooms are free, join today's queue, and take a room when it's your turn.
          </p>
        </div>

        <span className="waiting-preview">Sample data</span>
      </div>

      <div className="waiting-guidance">
        Students who don't check in within {CHECK_IN_GRACE / MINUTE} minutes of their booking
        start lose the booking automatically. The room is then offered to the next person in
        the queue, who has {OFFER_WINDOW / MINUTE} minutes to accept.
      </div>

      {/* Demo controls: speed up time so the 15-minute rules can be shown live */}
      <div className="waiting-demo">
        <div>
          <span className="waiting-category">DEMO CLOCK</span>
          <strong>{clock(now)}</strong>
        </div>
        <div className="waiting-demo-actions">
          <button type="button" className="waiting-button secondary" onClick={() => skip(5)}>
            Skip 5 min
          </button>
          <button type="button" className="waiting-button secondary" onClick={() => skip(15)}>
            Skip 15 min
          </button>
          <button type="button" className="waiting-button quiet" onClick={resetDemo}>
            Reset demo
          </button>
        </div>
      </div>

      {/* Room availability */}
      <div className="waiting-section-heading">
        <h2>Room availability</h2>
        <span>
          {rooms.filter((room) => room.status === "available").length} of {rooms.length} free now
        </span>
      </div>

      <div className="waiting-rooms">
        {rooms.map((room) => {
          const line = lineFor(queue, room.id);
          const status = ROOM_STATUS[room.status];
          const mine = myEntries.find(
            (entry) => entry.roomId === room.id && ACTIVE_STATUSES.includes(entry.status)
          );
          const canTakeNow = room.status === "available" && line.length === 0;

          return (
            <article className={`waiting-room ${room.id === roomId ? "selected" : ""}`} key={room.id}>
              <div className="waiting-card-top">
                <span className="waiting-category">{TYPE_LABELS[room.type]}</span>
                <span className={`waiting-room-status ${status.className}`}>{status.label}</span>
              </div>
              <h3>{room.name}</h3>
              <p className="waiting-room-detail">{roomDetail(room)}</p>
              <p className="waiting-room-queue">
                {line.length === 0 ? "No queue" : `${line.length} in queue`}
              </p>
              <button
                type="button"
                className={`waiting-button ${canTakeNow ? "primary" : "secondary"}`}
                disabled={Boolean(mine)}
                onClick={() => {
                  setRoomId(room.id);
                  join(room.id);
                }}
              >
                {mine ? "You're in this queue" : canTakeNow ? "Take This Room" : "Join Queue"}
              </button>
            </article>
          );
        })}
      </div>

      <form className="waiting-form" onSubmit={handleSubmit}>
        <div>
          <h2>Find your next space</h2>
          <p>Choose a room to join its queue for today. If it's free and no one is waiting, it's offered to you straight away.</p>
        </div>

        <div className="waiting-form-controls">
          <label htmlFor="waiting-room">
            Room
            <select id="waiting-room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} · {ROOM_STATUS[room.status].label} · {lineFor(queue, room.id).length} queuing
                </option>
              ))}
            </select>
          </label>

          <button className="waiting-button primary" type="submit">
            Join Waiting List
          </button>
        </div>
      </form>

      <p className="waiting-notice" role="status">
        {notice}
      </p>

      <div className="waiting-section-heading">
        <h2>Your requests</h2>
        <span>{myEntries.length} {myEntries.length === 1 ? "request" : "requests"}</span>
      </div>

      {myEntries.length === 0 ? (
        <section className="waiting-empty">
          <h2>A little patience, a better space.</h2>
          <p>You have no waiting-list requests. Choose a room above to get started.</p>
        </section>
      ) : (
        <div className="waiting-cards">
          {myEntries.map((entry) => {
            const room = rooms.find((item) => item.id === entry.roomId);
            const line = lineFor(queue, entry.roomId);
            const position = line.findIndex((item) => item.id === entry.id) + 1;
            const ahead = position - 1;

            return (
              <article className="waiting-card" key={entry.id}>
                <div className="waiting-card-top">
                  <span className="waiting-category">SAME-DAY REQUEST · {TYPE_LABELS[room.type]}</span>
                  <span className={`waiting-status ${entry.status}`}>{statusLabels[entry.status]}</span>
                </div>

                <h2>{room.name}</h2>
                <p className="waiting-slot">Today · joined at {clock(entry.joinedAt)}</p>

                {entry.status === "waiting" && (
                  <div className="waiting-position">
                    <strong>{position}</strong>
                    <div>
                      <span>
                        Position {position} of {line.length} ·{" "}
                        {ahead === 0 ? "you're next" : `${ahead} ${ahead === 1 ? "person" : "people"} ahead of you`}
                      </span>
                      <p>{whyWaiting(room)}</p>
                    </div>
                  </div>
                )}

                {entry.status === "offered" && (
                  <div className="waiting-offer">
                    <div>
                      <strong>A space is ready for you</strong>
                      <p>Accept before the countdown ends, or it goes to the next person.</p>
                    </div>
                    <span className="waiting-timer" aria-label="Time remaining to accept">
                      {countdown(entry.expiresAt, now)}
                    </span>
                  </div>
                )}

                {entry.status === "accepted" && room.isYou && (
                  <div className="waiting-offer">
                    <div>
                      <strong>Booked: check in at the library counter</strong>
                      <p>Show your QR code before the timer ends or the room is released to the queue.</p>
                    </div>
                    <span className="waiting-timer" aria-label="Time remaining to check in">
                      {countdown(room.checkInDeadline, now)}
                    </span>
                  </div>
                )}

                {entry.status === "checked_in" && (
                  <p className="waiting-result">
                    You're checked in. Your session runs until about {clock(room.endTime)}.
                  </p>
                )}

                {entry.status === "expired" && (
                  <p className="waiting-result">
                    You didn't accept in time, so the room went to the next person. Remove this
                    request to join again.
                  </p>
                )}

                {entry.status === "cancelled" && (
                  <p className="waiting-result">
                    Your booking was cancelled because you didn't check in within 15 minutes. The
                    room was offered to the next person in line.
                  </p>
                )}

                <div className="waiting-actions">
                  {entry.status === "offered" && (
                    <button type="button" className="waiting-button primary" onClick={() => handleAccept(entry)}>
                      Accept Room
                    </button>
                  )}

                  {entry.status === "accepted" && (
                    <button type="button" className="waiting-button secondary" onClick={() => handleCheckIn(entry)}>
                      Simulate Counter Check-in
                    </button>
                  )}

                  {entry.status !== "checked_in" && (
                    <button type="button" className="waiting-button quiet" onClick={() => handleLeave(entry)}>
                      {{ waiting: "Leave Queue", offered: "Decline Offer", accepted: "Cancel Booking" }[entry.status] ??
                        "Remove Request"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {log.length > 0 && (
        <>
          <div className="waiting-section-heading">
            <h2>Live queue activity</h2>
            <span>Latest first</span>
          </div>
          <ul className="waiting-log">
            {log.map((item) => (
              <li key={item.id}>
                <time>{clock(item.time)}</time>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="waiting-footnote">
        Frontend preview: rooms, other students and timings are simulated. Use the demo clock to
        skip ahead. Everything resets when this page is reopened or refreshed.
      </p>
    </div>
  );
}