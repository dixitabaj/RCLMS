// All calls to the Django REST API live here. Components never call fetch() directly.
export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/landcover'
).replace(/\/$/, '');

function query(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v !== null && v !== undefined) p.set(k, v);
  }
  return p.toString();
}

async function get(path, params = {}, signal) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}?${query(params)}`, { signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Cannot reach the data API. Is the Django server running (python manage.py runserver)?');
  }
  if (!res.ok) {
    let msg = `The API returned an error (${res.status}).`;
    try {
      const body = await res.json();
      if (body.errors) msg = Object.entries(body.errors).map(([k, v]) => `${k}: ${v}`).join('; ');
    } catch { /* body was not JSON */ }
    throw new Error(msg);
  }
  return res.json();
}

export const getRegions = (signal) => get('/regions/', {}, signal);
export const getSummary = ({ region_type, region, year }, signal) =>
  get('/summary/', { region_type, region, year }, signal);
export const getTrend = ({ region_type, region, class_name }, signal) =>
  get('/trend/', { region_type, region, class_name }, signal);
export const getRecords = (filters, signal) => get('/records/', filters, signal);
export const exportUrl = (filters) => `${API_BASE}/export/?${query(filters)}`;
