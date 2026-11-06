

export const MINUTE = 60 * 1000;
export const CHECK_IN_GRACE = 15 * MINUTE; // no-show limit after booking start
export const OFFER_WINDOW = 10 * MINUTE; // time the next student has to accept

export const ACTIVE_STATUSES = ["waiting", "offered", "accepted", "checked_in"];

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Math.random()).slice(2);
}

/** Sample rooms and other students so the demo has a realistic queue. */
export function createInitialState(t0) {
  return {
    rooms: [
      {
        id: "dr01",
        name: "Discussion Room 01",
        type: "discussion",
        status: "reserved",
        holder: "Student A",
        isYou: false,
        startAt: t0 - 3 * MINUTE,
        checkInDeadline: t0 - 3 * MINUTE + CHECK_IN_GRACE,
        arrivesAt: null, // this student never shows up → no-show demo
        endTime: t0 + 117 * MINUTE,
      },
      {
        id: "dr02",
        name: "Discussion Room 02",
        type: "discussion",
        status: "occupied",
        holder: "Student B",
        isYou: false,
        startAt: t0 - 100 * MINUTE,
        endTime: t0 + 20 * MINUTE,
      },
      {
        id: "cr08",
        name: "Carrel Room 08",
        type: "carrel",
        status: "reserved",
        holder: "Student C",
        isYou: false,
        startAt: t0 - MINUTE,
        checkInDeadline: t0 - MINUTE + CHECK_IN_GRACE,
        arrivesAt: t0 + 4 * MINUTE, // this student arrives on time
        endTime: t0 + 119 * MINUTE,
      },
      {
        id: "cr03",
        name: "Carrel Room 03",
        type: "carrel",
        status: "available",
        holder: null,
        isYou: false,
      },
      {
        id: "mr01",
        name: "Meeting Room 01",
        type: "meeting",
        status: "occupied",
        holder: "Student D",
        isYou: false,
        startAt: t0 - 30 * MINUTE,
        endTime: t0 + 90 * MINUTE,
      },
    ],
    queue: [
      // "ignore" = won't accept the offer (lets the demo show an expired offer)
      { id: "q1", roomId: "dr01", name: "Student E", isYou: false, status: "waiting", joinedAt: t0 - 20 * MINUTE, behavior: "ignore" },
      { id: "q2", roomId: "dr02", name: "Student F", isYou: false, status: "waiting", joinedAt: t0 - 15 * MINUTE, behavior: "accept" },
      { id: "q3", roomId: "mr01", name: "Student G", isYou: false, status: "waiting", joinedAt: t0 - 10 * MINUTE, behavior: "accept" },
    ],
    log: [],
  };
}

export function who(entry) {
  return entry.isYou ? "You" : entry.name;
}

/** The live line for a room: people still waiting or holding an offer, oldest first. */
export function lineFor(queue, roomId) {
  return queue
    .filter((q) => q.roomId === roomId && (q.status === "waiting" || q.status === "offered"))
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

function releaseRoom(room) {
  Object.assign(room, {
    status: "available",
    holder: null,
    isYou: false,
    heldFor: null,
    startAt: null,
    checkInDeadline: null,
    arrivesAt: null,
    endTime: null,
  });
}

function acceptEntry(room, entry, now) {
  entry.status = "accepted";
  Object.assign(room, {
    status: "reserved",
    holder: entry.name,
    isYou: entry.isYou,
    heldFor: null,
    startAt: now,
    checkInDeadline: now + CHECK_IN_GRACE,
    arrivesAt: entry.isYou ? null : now + 2 * MINUTE,
    endTime: now + 120 * MINUTE,
  });
}

function clone(state) {
  return {
    rooms: state.rooms.map((r) => ({ ...r })),
    queue: state.queue.map((q) => ({ ...q })),
    log: [...state.log],
  };
}

/** Applies all time-based rules. Returns the same object if nothing changed. */
export function advance(state, now) {
  const next = clone(state);
  let changed = false;
  const add = (text) => next.log.unshift({ id: newId(), time: now, text });

  // Several passes so chains resolve in one tick
  // (e.g. no-show → room free → offered to next person).
  for (let pass = 0; pass < 6; pass++) {
    let passChanged = false;

    for (const room of next.rooms) {
      if (room.status === "reserved") {
        if (room.arrivesAt && now >= room.arrivesAt) {
          room.status = "occupied";
          room.arrivesAt = null;
          add(`${room.holder} checked in to ${room.name}.`);
          passChanged = true;
        } else if (now >= room.checkInDeadline) {
          const holder = room.isYou ? "Your" : `${room.holder}'s`;
          if (room.isYou) {
            const mine = next.queue.find((q) => q.roomId === room.id && q.isYou && q.status === "accepted");
            if (mine) mine.status = "cancelled";
          }
          add(`${holder} booking for ${room.name} was auto-cancelled: no check-in within 15 minutes.`);
          releaseRoom(room);
          passChanged = true;
        }
      } else if (room.status === "occupied" && room.endTime && now >= room.endTime) {
        add(`${room.holder} checked out of ${room.name}.`);
        releaseRoom(room);
        passChanged = true;
      } else if (room.status === "held") {
        const entry = next.queue.find((q) => q.id === room.heldFor);
        if (!entry || entry.status !== "offered") {
          releaseRoom(room);
          passChanged = true;
        } else if (!entry.isYou && entry.behavior === "accept" && now >= entry.offeredAt + MINUTE) {
          // Sample students who accept do so one minute after the offer
          // (checked before expiry so "Skip time" doesn't jump past it).
          acceptEntry(room, entry, entry.offeredAt + MINUTE);
          add(`${entry.name} accepted ${room.name}.`);
          passChanged = true;
        } else if (now >= entry.expiresAt) {
          entry.status = "expired";
          add(`${who(entry)} didn't accept ${room.name} in time, so it passed to the next person.`);
          releaseRoom(room);
          passChanged = true;
        }
      }

      if (room.status === "available") {
        const first = lineFor(next.queue, room.id).find((q) => q.status === "waiting");
        if (first) {
          first.status = "offered";
          first.offeredAt = now;
          first.expiresAt = now + OFFER_WINDOW;
          room.status = "held";
          room.heldFor = first.id;
          add(`${room.name} offered to ${who(first)} (first in queue).`);
          passChanged = true;
        }
      }
    }

    if (!passChanged) break;
    changed = true;
  }

  if (!changed) return state;
  next.log = next.log.slice(0, 12);
  return next;
}

/** You join a room's queue. If the room is free and nobody is ahead, you get the offer straight away. */
export function joinRoom(state, roomId, now) {
  const next = clone(state);
  next.queue.push({ id: newId(), roomId, name: "You", isYou: true, status: "waiting", joinedAt: now });
  return advance(next, now);
}

export function acceptOffer(state, entryId, now) {
  const next = clone(state);
  const entry = next.queue.find((q) => q.id === entryId);
  if (!entry || entry.status !== "offered") return state;
  if (now >= entry.expiresAt) return advance(next, now); // let the rules expire it
  const room = next.rooms.find((r) => r.id === entry.roomId);
  acceptEntry(room, entry, now);
  next.log.unshift({ id: newId(), time: now, text: `You accepted ${room.name}. Check in at the counter within 15 minutes.` });
  return next;
}

/** Leave the queue, decline an offer, or cancel a room you accepted. The room moves on to the next person. */
export function leaveEntry(state, entryId, now) {
  const next = clone(state);
  const entry = next.queue.find((q) => q.id === entryId);
  if (!entry) return state;
  const room = next.rooms.find((r) => r.id === entry.roomId);

  if (entry.status === "offered" && room?.heldFor === entry.id) {
    releaseRoom(room);
    next.log.unshift({ id: newId(), time: now, text: `You declined ${room.name}, so it passed to the next person.` });
  }
  if (entry.status === "accepted" && room?.isYou) {
    releaseRoom(room);
    next.log.unshift({ id: newId(), time: now, text: `You cancelled your booking for ${room.name}.` });
  }
  next.queue = next.queue.filter((q) => q.id !== entryId);
  return advance(next, now);
}

/** Demo only: what the staff QR scan will do once the check-in feature exists. */
export function simulateCheckIn(state, entryId, now) {
  const next = clone(state);
  const entry = next.queue.find((q) => q.id === entryId);
  const room = entry && next.rooms.find((r) => r.id === entry.roomId);
  if (!entry || entry.status !== "accepted" || !room?.isYou) return state;
  entry.status = "checked_in";
  room.status = "occupied";
  next.log.unshift({ id: newId(), time: now, text: `You checked in to ${room.name}.` });
  return next;
}