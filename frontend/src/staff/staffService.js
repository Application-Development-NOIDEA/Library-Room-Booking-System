const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');

/** One place for every staff request: bearer token in, clear error message out. */
async function staffRequest(token, path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}/staff${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
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
    if (response.status === 401) throw new Error('Your session has expired. Please sign in again.');
    if (response.status === 403) throw new Error('This account does not have staff access.');
    const details = data?.errors ? Object.values(data.errors).flat().join(' ') : '';
    throw new Error(details || data?.message || `Request failed (${response.status}).`);
  }
  return data;
}

/** POST /api/staff/bookings/scan. Resolves with the result even when the code is refused. */
async function scanRequest(token, query) {
  let response;
  try {
    response = await fetch(`${API_URL}/staff/bookings/scan`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });
  } catch {
    throw new Error("Can't reach the server. Check that the backend is running.");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('Your session has expired. Please sign in again.');
  if (response.status === 403) throw new Error('This account does not have staff access.');
  if (response.status === 429) throw new Error('Too many scans at once. Wait a moment and try again.');
  return { ok: response.ok, ...data };
}

/** GET /api/staff/bookings  (used by the Reservations tab) */
export function listStaffBookings(token, { date, allDates, status } = {}) {
  const params = new URLSearchParams();
  if (allDates) params.set('all', '1');
  else if (date) params.set('date', date);
  if (status) params.set('status', status);
  return staffRequest(token, `/bookings?${params}`);
}

export const staffApi = {
  reviewQueue: (token) => staffRequest(token, '/issue-reports/review'),
  reviewReport: (token, id, body) =>
  staffRequest(token, `/issue-reports/${id}/review`, { method: 'POST', body }),
  dashboard: (token) => staffRequest(token, '/dashboard'),
  reportSummaries: (token) => staffRequest(token, '/report-summaries'),
  generateReportSummary: (token, from, to) =>
    staffRequest(token, '/report-summaries', { method: 'POST', body: { from, to } }),

  lookup: (token, query) => staffRequest(token, '/bookings/lookup', { method: 'POST', body: { query } }),
  // Scan a QR: checks the student in, or out if they are already checked in
  scan: (token, query) => scanRequest(token, query),
  checkIn: (token, id) => staffRequest(token, `/bookings/${id}/check-in`, { method: 'POST' }),
  checkOut: (token, id) => staffRequest(token, `/bookings/${id}/check-out`, { method: 'POST' }),
  noShow: (token, id) => staffRequest(token, `/bookings/${id}/no-show`, { method: 'POST' }),
  walkIn: (token, body) => staffRequest(token, '/walk-ins', { method: 'POST', body }),

  setRoomStatus: (token, id, status) =>
    staffRequest(token, `/rooms/${id}/status`, { method: 'PATCH', body: { status } }),
  processWaitlist: (token) => staffRequest(token, '/waitlist/process', { method: 'POST' }),
  decideExtension: (token, id, decision) =>
    staffRequest(token, `/extensions/${id}/decision`, { method: 'PATCH', body: { decision } }),
  setReportStatus: (token, id, status) =>
    staffRequest(token, `/reports/${id}/status`, { method: 'PATCH', body: { status } }),
};

/** Add / edit / cancel bookings and close rooms (ReservationsPanel). */
export const staffManageApi = {
  roomOptions: (token) => staffRequest(token, '/room-options'),
  addBooking: (token, body) => staffRequest(token, '/bookings', { method: 'POST', body }),
  editBooking: (token, id, body) => staffRequest(token, `/bookings/${id}`, { method: 'PATCH', body }),
  cancelBooking: (token, id, reason) =>
    staffRequest(token, `/bookings/${id}/cancel`, { method: 'POST', body: { reason } }),
  closures: (token) => staffRequest(token, '/closures'),
  closeRoom: (token, body) => staffRequest(token, '/closures', { method: 'POST', body }),
  reopen: (token, id) => staffRequest(token, `/closures/${id}`, { method: 'DELETE' }),
};