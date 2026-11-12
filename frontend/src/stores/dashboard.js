// Shared filter state + API data for every dashboard component.
// Change `filters` (via the helpers below) and the data stores refetch themselves.
import { writable, get } from 'svelte/store';
import * as api from '../services/landcoverApi.js';

const idle = () => ({ loading: false, error: null, data: null });

export const filters = writable({
  regionType: 'hkh',
  region: '',
  year: 2022,
  className: 'Forest',
  showTrend: true,
  missing: false, // true when the selected region has no data in the database
});

export const catalog = writable({ loading: true, error: null, data: null });
export const summary = writable(idle());
export const trend = writable(idle());
export const records = writable(idle());

// ---- helpers used by components (and by the map) ---------------------------
const remembered = {}; // last region chosen per region type

export function regionsOf(regionType) {
  const cat = get(catalog).data;
  return cat?.region_types.find((t) => t.region_type === regionType)?.regions ?? [];
}

export function rememberedRegion(regionType) {
  return remembered[regionType] ?? regionsOf(regionType)[0] ?? '';
}

/** Select a region. Unknown regions are still selected, but flagged as missing. */
export function selectRegion(regionType, region) {
  const known = regionsOf(regionType).includes(region);
  if (known) remembered[regionType] = region;
  filters.update((f) => ({ ...f, regionType, region, missing: !known }));
  return known;
}

export function selectRegionType(regionType) {
  selectRegion(regionType, rememberedRegion(regionType));
}

export function setFilter(key, value) {
  filters.update((f) => ({ ...f, [key]: value }));
}

// ---- fetch plumbing --------------------------------------------------------
function makeRunner(store) {
  let controller;

  const run = async (fn) => {
    controller?.abort(); // a newer request cancels the older one
    const mine = (controller = new AbortController());
    store.update((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn(mine.signal);
      if (!mine.signal.aborted) store.set({ loading: false, error: null, data });
    } catch (e) {
      if (e.name === 'AbortError') return;
      store.set({ loading: false, error: e.message, data: null });
    }
  };

  // Cancel any in-flight request and empty the store
  run.clear = () => {
    controller?.abort();
    store.set(idle());
  };

  return run;
}

const runSummary = makeRunner(summary);
const runTrend = makeRunner(trend);
const runRecords = makeRunner(records);

export async function initDashboard() {
  try {
    const data = await api.getRegions();
    catalog.set({ loading: false, error: null, data });

    // Make sure the starting filters point at values that exist in the database.
    filters.update((f) => {
      const names = data.region_types.find((t) => t.region_type === f.regionType)?.regions ?? [];
      return {
        ...f,
        region: names.includes(f.region) ? f.region : names[0] ?? '',
        year: data.years.includes(f.year) ? f.year : data.years[data.years.length - 1],
        className: data.classes.includes(f.className) ? f.className : data.classes[0],
        missing: false,
      };
    });
  } catch (e) {
    catalog.set({ loading: false, error: e.message, data: null });
    return;
  }

  // Refetch only the pieces whose inputs changed (e.g. changing the class only reloads the trend).
  const last = {};
  const when = (name, key, fn) => {
    if (last[name] !== key) { last[name] = key; fn(); }
  };

  filters.subscribe((f) => {
    if (!f.region) return;

    // Region is not in the database: clear everything and show "no data".
    if (f.missing) {
      // Reset the cache so returning to a known region always refetches.
      last.summary = last.records = last.trend = null;
      runSummary.clear();
      runRecords.clear();
      runTrend.clear();
      return;
    }

    const base = { region_type: f.regionType, region: f.region };
    when('summary', `${f.regionType}|${f.region}|${f.year}`, () =>
      runSummary((s) => api.getSummary({ ...base, year: f.year }, s)));
    when('records', `${f.regionType}|${f.region}|${f.year}`, () =>
      runRecords((s) => api.getRecords({ ...base, year: f.year }, s)));
    when('trend', `${f.regionType}|${f.region}|${f.className}`, () =>
      runTrend((s) => api.getTrend({ ...base, class_name: f.className }, s)));
  });
}

export function applyFilters({ regionType, region, year, className }) {
  const known = regionsOf(regionType).includes(region);
  if (known) remembered[regionType] = region;
  filters.update((f) => ({
    ...f,
    regionType,
    region,
    missing: !known,
    year: Number.isFinite(year) ? year : f.year,
    className: className || f.className,
  }));
  return known;
}