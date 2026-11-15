/**
 * Waiting list: talks to the Laravel backend (WaitingListController).
 * Needs a real login token, so VITE_USE_MOCK_AUTH must be false.
 *
 *   GET  /waiting-list/mine
 *   POST /waiting-list               { room_type, date, start_time, duration }
 *   POST /waiting-list/{id}/accept
 *   POST /waiting-list/{id}/leave
 *
 * Free/full slots come from the booking API: GET /rooms/{type}/availability
 */

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");

async function request(path, { method = "GET", token, body } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Check that the backend is running.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty body */
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw Object.assign(new Error("Your session has expired. Please sign in again."), { status: 401 });
    }
    const fieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : null;
    throw Object.assign(new Error(fieldError || data?.message || "Something went wrong. Please try again."), {
      status: response.status,
    });
  }
  return data;
}

export function listMyWaiting(token) {
  return request("/waiting-list/mine", { token });
}

export async function joinWaitingList(token, { roomType, date, startTime, duration }) {
  const data = await request("/waiting-list", {
    method: "POST",
    token,
    body: { room_type: roomType, date, start_time: startTime, duration },
  });
  return data.entry;
}

export function acceptOffer(token, entryId) {
  return request(`/waiting-list/${entryId}/accept`, { method: "POST", token });
}

export async function leaveWaitingList(token, entryId) {
  return (await request(`/waiting-list/${entryId}/leave`, { method: "POST", token })).entry;
}

export function getSlots(token, roomType, date, duration) {
  const query = new URLSearchParams({ date, ...(duration ? { duration: String(duration) } : {}) });
  return request(`/rooms/${encodeURIComponent(roomType)}/availability?${query}`, { token });
}

/** Room types students can queue for (the bookable ones on Browse Rooms). */
export const QUEUE_ROOM_TYPES = [
  { id: "discussion", name: "Discussion Rooms" },
  { id: "carrel", name: "Carrel Rooms" },
  { id: "seminar", name: "Seminar Room 3" },
  { id: "viewing", name: "Viewing Room" },
  { id: "lab", name: "Information Searching Laboratory" },
];