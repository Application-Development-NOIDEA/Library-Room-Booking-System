/**
 * Room bookings: talks to the Laravel backend (BookingController).
 * Needs a real login token, so VITE_USE_MOCK_AUTH must be false.
 *
 *   GET  /rooms/{type}/availability?date=YYYY-MM-DD&duration=1
 *   POST /bookings                 { room_type, date, start_time, duration }
 *   GET  /bookings/mine
 *   POST /bookings/{id}/cancel
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

export function getAvailability(token, roomType, date, duration) {
  const query = new URLSearchParams({ date, ...(duration ? { duration: String(duration) } : {}) });
  return request(`/rooms/${encodeURIComponent(roomType)}/availability?${query}`, { token });
}

export async function createBooking(token, { roomType, date, startTime, duration }) {
  const data = await request("/bookings", {
    method: "POST",
    token,
    body: { room_type: roomType, date, start_time: startTime, duration },
  });
  return data.booking;
}

export async function listMyBookings(token) {
  return (await request("/bookings/mine", { token })).bookings ?? [];
}

export async function cancelBooking(token, id) {
  return (await request(`/bookings/${id}/cancel`, { method: "POST", token })).booking;
}

/* ---------- Display helpers (times come from the API in Malaysian time) ---------- */

export function formatBookingDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTime(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatTimeRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}
