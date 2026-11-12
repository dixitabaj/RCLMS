<script>
  import { summary, trend, filters } from '../stores/dashboard.js';
  import { full } from '../lib/format.js';
  import { colorFor } from '../lib/classes.js';
  import AsyncState from './AsyncState.svelte';

  // Optional: { region, year, className, loading, error, points, total }
  // When given (ecoregion that is not in the database), it replaces the database store.
  export let override = null;

  // ---------- where the data comes from ----------
  $: state = override
    ? { loading: override.loading, error: override.error, data: { points: override.points } }
    : $trend;
  $: region = override ? override.region : $filters.region;
  $: year = override ? override.year : $filters.year;
  $: className = override ? override.className : $filters.className;
  $: missing = override ? false : $filters.missing;
  $: total = override ? override.total : ($summary.data?.total_area_ha ?? 0);

  // Ignore years the source had no row for (stored as 0, not a real zero)
  $: pts = (state.data?.points ?? []).filter((p) => !p.filled_missing);

  $: first = pts[0];
  $: cur = pts.find((p) => p.year === year) ?? pts[pts.length - 1];
  $: peak = pts.reduce((a, p) => (!a || p.area_ha > a.area_ha ? p : a), null);
  $: low = pts.reduce((a, p) => (!a || p.area_ha < a.area_ha ? p : a), null);

  $: change = first && cur ? cur.area_ha - first.area_ha : 0;
  $: changePct = first?.area_ha ? (100 * change) / first.area_ha : 0;
  $: sign = (v) => (v > 0 ? '+' : '');

  $: color = colorFor(className);

  $: cards = first && cur ? [
    {
      label: `${className} in ${cur.year}`,
      value: full(cur.area_ha),
      sub: total ? `${((100 * cur.area_ha) / total).toFixed(1)}% of region` : '',
      color,
    },
    {
      label: `Change since ${first.year}`,
      value: `${sign(change)}${full(change)}`,
      sub: `${sign(changePct)}${changePct.toFixed(2)}% vs ${first.year}`,
      color: change < 0 ? '#c0392b' : '#0a7d3b',
    },
    {
      label: 'Peak year',
      value: full(peak.area_ha),
      sub: String(peak.year),
      color,
    },
    {
      label: 'Lowest year',
      value: full(low.area_ha),
      sub: String(low.year),
      color,
    },
  ] : [];

  $: emptyText = missing
    ? `No data found for "${region}".`
    : 'No yearly records for this class and region.';
</script>

<AsyncState {state} isEmpty={cards.length === 0} {emptyText}>
  <div class="cards">
    {#each cards as c}
      <div class="card" style="--accent:{c.color}">
        <div class="label">{c.label}</div>
        <div class="value">{c.value} <span>ha</span></div>
        <div class="sub">{c.sub}</div>
      </div>
    {/each}
  </div>
</AsyncState>

<style>
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .card {
    background: #fff; border-radius: 6px; padding: 12px 14px;
    border-left: 6px solid var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,.18);
  }
  .label { font-size: .9rem; color: #4a5a50; }
  .value { font-size: 1.45rem; font-weight: 600; color: #14301f; margin: 2px 0; }
  .value span { font-size: .85rem; font-weight: 400; color: #6a7a70; }
  .sub { font-size: .82rem; color: #6a7a70; }
  @media (max-width: 900px) { .cards { grid-template-columns: repeat(2, 1fr); } }
</style>