/**
 * Issue reports: talks to the Laravel backend, or uses sample data.
 *
 * .env.local:
 *   VITE_USE_MOCK_REPORTS=false   <- use the real backend (default: sample data)
 *   VITE_API_URL=http://localhost:8000/api
 *
 * Backend endpoints expected (all need "Authorization: Bearer <token>"):
 *   GET  /reports/bookings  -> { bookings: [{ id, room_id, room_name, room_type, start_at, end_at }] }
 *   GET  /reports/mine      -> { reports: [{ id, booking_id, room_name, issue_category, description,
 *                                            image_url, status, created_at }] }
 *   POST /reports           (multipart/form-data: booking_id, issue_category, description, image?)
 *                           -> { report: { ...same shape as above } }
 * Matches the issue_reports table in database/database.sql.
 */

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
export const USE_MOCK_REPORTS = import.meta.env.VITE_USE_MOCK_REPORTS !== "false";

export const ISSUE_CATEGORIES = [
  { id: "lighting", label: "Lighting", icon: "💡" },
  { id: "air_conditioning", label: "Air-conditioning", icon: "❄" },
  { id: "furniture", label: "Furniture", icon: "🪑" },
  { id: "power", label: "Power sockets", icon: "🔌" },
  { id: "display", label: "Whiteboard / screen", icon: "🖥" },
  { id: "wifi", label: "Wi-Fi", icon: "📶" },
  { id: "cleanliness", label: "Cleanliness", icon: "🧹" },
  { id: "other", label: "Other", icon: "✎" },
];

export function categoryLabel(id) {
  return ISSUE_CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

/* ---------- Real backend ---------- */

async function request(path, { method = "GET", token, body } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
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
    // Laravel validation errors come back as { message, errors: { field: [..] } }
    const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : null;
    throw new Error(firstFieldError || data?.message || "Something went wrong. Please try again.");
  }
  return data;
}

const realApi = {
  async listBookings(token) {
    return (await request("/reports/bookings", { token })).bookings ?? [];
  },
  async listReports(token) {
    return (await request("/reports/mine", { token })).reports ?? [];
  },
  async createReport(token, { bookingId, category, description, image }) {
    const form = new FormData();
    form.append("booking_id", bookingId);
    form.append("issue_category", category);
    form.append("description", description);
    if (image) form.append("image", image);
    return (await request("/reports", { method: "POST", token, body: form })).report;
  },
};

/* ---------- Sample data (saved in this browser) ---------- */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const storageKey = (userId) => `psz-reports-${userId}`;

function daysFromNow(days, hour) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function sampleBookings() {
  return [
    { id: 3, room_id: 4, room_name: "Discussion Room 02", room_type: "discussion", start_at: daysFromNow(-2, 14), end_at: daysFromNow(-2, 16) },
    { id: 2, room_id: 8, room_name: "Carrel Room 08", room_type: "carrel", start_at: daysFromNow(0, 9), end_at: daysFromNow(0, 11) },
    { id: 1, room_id: 1, room_name: "Discussion Room 01", room_type: "discussion", start_at: daysFromNow(-6, 10), end_at: daysFromNow(-6, 12) },
  ];
}

function sampleReports() {
  return [
    {
      id: 12,
      booking_id: 1,
      room_name: "Discussion Room 01",
      issue_category: "display",
      description: "The TV screen does not turn on when connected with HDMI.",
      image_url: null,
      status: "in_progress",
      created_at: daysFromNow(-6, 11),
    },
  ];
}

function loadReports(userId) {
  try {
    const saved = window.localStorage.getItem(storageKey(userId));
    return saved ? JSON.parse(saved) : sampleReports();
  } catch {
    return sampleReports();
  }
}

function saveReports(userId, reports) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(reports));
  } catch {
    /* storage unavailable: reports last until refresh */
  }
}

function makeMockApi(userId) {
  return {
    async listBookings() {
      await wait(250);
      return sampleBookings();
    },
    async listReports() {
      await wait(250);
      return loadReports(userId);
    },
    async createReport(_token, { bookingId, category, description, image }) {
      await wait(600);
      const booking = sampleBookings().find((item) => item.id === Number(bookingId));
      const reports = loadReports(userId);
      const report = {
        id: Math.max(100, ...reports.map((item) => item.id)) + 1,
        booking_id: Number(bookingId),
        room_name: booking?.room_name ?? "Room",
        issue_category: category,
        description,
        image_url: null, // sample mode keeps only the file name
        image_name: image?.name ?? null,
        status: "submitted",
        created_at: new Date().toISOString(),
      };
      saveReports(userId, [report, ...reports]);
      return report;
    },
  };
}

export function reportApi(userId) {
  return USE_MOCK_REPORTS ? makeMockApi(userId) : realApi;
}