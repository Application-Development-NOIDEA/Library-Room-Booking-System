// Staff API adapter. API mode requires a real authenticated Laravel staff session.
// Frontend .env.local: VITE_STAFF_DATA_SOURCE=api (default: demo)
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const API_MODE = import.meta.env.VITE_STAFF_DATA_SOURCE === 'api';

const pretty = (status) => ({
  confirmed: 'Confirmed', held: 'Held', checked_in: 'Checked In',
  checked_out: 'Checked Out', cancelled: 'Cancelled', no_show: 'No Show',
  waiting: 'Waiting', offered: 'Offered', fulfilled: 'Fulfilled', expired: 'Expired',
  submitted: 'Submitted', in_progress: 'In Progress', resolved: 'Resolved',
  active: 'Active', maintenance: 'Maintenance', pending: 'Pending',
  approved: 'Approved', rejected: 'Rejected', declined: 'Declined',
}[status] || status);

export const normalize = (data) => ({
  rooms: (data.rooms || []).map(r => ({...r, status: pretty(r.status), type: pretty(r.type)})),
  bookings: (data.bookings || []).map(b => ({...b, status: pretty(b.status), source: pretty(b.source)})),
  waitlist: (data.waitlist || []).map(w => ({...w, type: pretty(w.type), status: pretty(w.status)})),
  reports: (data.reports || []).map(r => ({...r, status: pretty(r.status)})),
  extensions: (data.extensions || []).map(x => ({...x, status: pretty(x.status)})),
});

async function request(path, {method='GET', body} = {}) {
  const response = await fetch(`${BASE}/api/staff${path}`, {
    method,
    credentials: 'include',
    headers: {'Accept': 'application/json', ...(body ? {'Content-Type':'application/json', 'X-XSRF-TOKEN': decodeURIComponent(document.cookie.split('; ').find(x => x.startsWith('XSRF-TOKEN='))?.split('=')[1] || '')} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error('Not signed in. Log in as library staff before using API mode.');
    if (response.status === 403) throw new Error('Your account does not have staff access.');
    const details = payload.errors ? Object.values(payload.errors).flat().join(' ') : '';
    throw new Error(details || payload.message || `Request failed (${response.status})`);
  }
  return payload;
}

export const staffApi = {
  snapshot: () => request('/dashboard'),
  registerWalkIn: data => request('/walk-ins', {method:'POST', body:data}),
  lookup: query => request('/bookings/lookup', {method:'POST', body:{query}}),
  checkIn: (id, credentials) => request(`/bookings/${encodeURIComponent(id)}/check-in`, {method:'POST', body: credentials}),
  checkOut: (id, credentials) => request(`/bookings/${encodeURIComponent(id)}/check-out`, {method:'POST', body: credentials}),
  noShow: id => request(`/bookings/${encodeURIComponent(id)}/no-show`, {method:'POST'}),
  setRoomStatus: (id, status) => request(`/rooms/${encodeURIComponent(id)}/status`, {method:'PATCH', body:{status}}),
  offerRoom: (id, roomId) => request(`/waitlist/${encodeURIComponent(id)}/offer`, {method:'POST', body:{room_id:roomId}}),
  setReportStatus: (id, status) => request(`/reports/${encodeURIComponent(id)}/status`, {method:'PATCH', body:{status}}),
  setExtensionDecision: (id, decision) => request(`/extensions/${encodeURIComponent(id)}/decision`, {method:'PATCH', body:{decision}}),
  analysis: () => request('/reports/analyze'),
};

function csrfCookie() {
  return document.cookie.split('; ').find(x => x.startsWith('XSRF-TOKEN='))?.split('=')[1] || '';
}

async function authRequest(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method:'POST', credentials:'include',
    headers:{'Accept':'application/json', 'Content-Type':'application/json', 'X-XSRF-TOKEN': decodeURIComponent(csrfCookie())},
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Sign-in request failed.');
  return payload;
}

staffApi.login = async (email, password) => {
  const response = await fetch(`${BASE}/sanctum/csrf-cookie`, {credentials:'include'});
  if (!response.ok) throw new Error('Could not initialize secure login.');
  const payload = await authRequest('/login', {email, password});
  if (!['staff','admin'].includes(payload.user?.role)) {
    await authRequest('/logout', {}).catch(()=>{});
    throw new Error('This account does not have staff access.');
  }
  return payload;
};
staffApi.logout = () => authRequest('/logout', {});
