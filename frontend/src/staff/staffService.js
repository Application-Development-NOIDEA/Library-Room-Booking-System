const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');

/** GET /api/staff/bookings  (library staff only) */
export async function listStaffBookings(token, { date, allDates, status } = {}) {
  const params = new URLSearchParams();
  if (allDates) params.set('all', '1');
  else if (date) params.set('date', date);
  if (status) params.set('status', status);

  let response;
  try {
    response = await fetch(`${API_URL}/staff/bookings?${params}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
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
    throw new Error(data?.message || 'Could not load reservations.');
  }
  return data;
}