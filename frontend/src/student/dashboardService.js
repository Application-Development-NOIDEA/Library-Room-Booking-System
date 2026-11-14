/**
 * Student dashboard data: talks to the Laravel backend.
 *
 *   GET /student/dashboard   (StudentDashboardController)
 *
 * Needs a real login token, so VITE_USE_MOCK_AUTH must be false.
 * In mock mode the page shows SAMPLE_DASHBOARD instead.
 */

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");

export async function fetchDashboard(token) {
  let response;
  try {
    response = await fetch(`${API_URL}/student/dashboard`, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
    throw Object.assign(new Error(data?.message || "Something went wrong. Please try again."), {
      status: response.status,
    });
  }

  return {
    bookings: data?.bookings ?? [],
    waiting: data?.waiting ?? null,
    availability: data?.availability ?? [],
    notifications: data?.notifications ?? [],
    rules: data?.rules ?? [],
  };
}

/* ---------- Sample data for mock mode (VITE_USE_MOCK_AUTH=true) ---------- */

function sampleTime(daysAhead, hour) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export const SAMPLE_DASHBOARD = {
  bookings: [
    {
      id: "BK-0001",
      room: "Discussion Room 1",
      type: "DISCUSSION ROOM",
      start: sampleTime(1, 10),
      end: sampleTime(1, 12),
      status: "confirmed",
    },
    {
      id: "BK-0002",
      room: "Carrel Room 8",
      type: "CARREL ROOM",
      start: sampleTime(2, 14),
      end: sampleTime(2, 16),
      status: "confirmed",
    },
  ],
  waiting: { room: "Discussion Room 1", position: 2 },
  availability: [
    { type: "Carrel", free: 3, total: 8 },
    { type: "Discussion", free: 1, total: 4 },
    { type: "Seminar", free: 0, total: 2 },
  ],
  notifications: [
    {
      id: 1,
      tone: "gold",
      title: "Booking Confirmed",
      text: "Carrel Room 8, 2:00 PM. Your QR code is ready.",
      read: false,
      created_at: sampleTime(0, 9),
    },
    {
      id: 2,
      tone: "maroon",
      title: "Waiting List Update",
      text: "You moved up to #2 for Discussion Room 1.",
      read: true,
      created_at: sampleTime(0, 8),
    },
  ],
  rules: [
    "Check in at the counter within 15 minutes of your start time, or the booking is cancelled.",
    "Show your QR code to collect the room key, and return it when you check out.",
    "Extensions are allowed only if nobody has booked the next slot.",
  ],
};