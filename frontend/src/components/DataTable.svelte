<script>
  import { records, filters } from '../stores/dashboard.js';
  import { exportUrl } from '../services/landcoverApi.js';
  import { full } from '../lib/format.js';
  import { colorFor } from '../lib/classes.js';
  import AsyncState from './AsyncState.svelte';
  import ExportMenu from './ExportMenu.svelte';

  // Optional: { region, year, className, loading, error, rows, allRows }
  // When given (ecoregion that is not in the database), it replaces the database store.
  // rows = [{ id, class_name, area_ha, filled_missing }], allRows = [{ year, class_name, area_ha }]
  export let override = null;

  let captureEl;   // the part that gets exported as an image / PDF

  // ---------- where the data comes from ----------
  $: state = override
    ? { loading: override.loading, error: override.error, data: { results: override.rows } }
    : $records;
  $: region = override ? override.region : $filters.region;
  $: year = override ? override.year : $filters.year;
  $: className = override ? override.className : $filters.className;
  $: missing = override ? false : $filters.missing;

  // Largest class first
  $: rows = [...(state.data?.results ?? [])].sort((a, b) => b.area_ha - a.area_ha);
  $: total = rows.reduce((sum, r) => sum + r.area_ha, 0);
  $: maxShare = total ? (100 * (rows[0]?.area_ha ?? 0)) / total : 0;
  $: share = (v) => (total ? (100 * v) / total : 0);
  $: anyFilled = rows.some((r) => r.filled_missing);

  // Server-side CSV links only exist for regions in the database
  $: urlYear = override ? null : exportUrl({ region_type: $filters.regionType, region: $filters.region, year: $filters.year });
  $: urlAll = override ? null : exportUrl({ region_type: $filters.regionType, region: $filters.region });

  $: emptyText = missing
    ? `No data found for "${region}".`
    : 'No records for this region and year.';

  // ---------- CSV download (ecoregions outside the database, built in the browser) ----------
  const csvCell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  function downloadCsv(filename, header, lines) {
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const slug = (s) => String(s ?? 'region').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  function downloadYear() {
    downloadCsv(
      `${slug(region)}_${year}.csv`,
      'region,year,class,area_ha',
      rows.map((r) => [region, year, r.class_name, r.area_ha].map(csvCell).join(','))
    );
  }

  function downloadAll() {
    downloadCsv(
      `${slug(region)}_all_years.csv`,
      'region,year,class,area_ha',
      (override?.allRows ?? []).map((r) => [region, r.year, r.class_name, r.area_ha].map(csvCell).join(','))
    );
  }
</script>

<div class="head">
  <h3>Land cover by class: {region}, {year}</h3>

  {#if override}
    <div class="dl">
      <button on:click={downloadYear} disabled={rows.length === 0}>Download CSV ({year})</button>
      <button on:click={downloadAll} disabled={!override.allRows?.length}>Download CSV (all years)</button>
    </div>
  {:else}
    <ExportMenu
      target={captureEl}
      {rows}
      {region}
      {year}
      {urlYear}
      {urlAll}
      disabled={rows.length === 0} />
  {/if}
</div>

<div class="capture" bind:this={captureEl}>
  <h4 class="capture-title">{region}, {year}</h4>
  {#if override?.loading}
    <p class="loading">Loading…</p>
  {:else}
  <AsyncState {state} isEmpty={rows.length === 0} {emptyText}>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Class</th>
            <th class="num">Area (ha)</th>
            <th class="share-col">Share of region</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.id)}
            <tr class:sel={r.class_name === className}>
              <td>
                <span class="swatch" style="background:{colorFor(r.class_name)}"></span>{r.class_name}
                {#if r.filled_missing}
                  <span class="badge" title="No row in the source chart; stored as 0">filled with 0</span>
                {/if}
              </td>
              <td class="num">{full(r.area_ha)}</td>
              <td class="share-col">
                <div class="bar-wrap">
                  <div class="bar"
                       style="width:{maxShare ? (share(r.area_ha) / maxShare) * 100 : 0}%; background:{colorFor(r.class_name)}"></div>
                  <span class="pct">{share(r.area_ha).toFixed(1)}%</span>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td class="num">{full(total)}</td>
            <td class="share-col">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
    {#if anyFilled}
      <p class="note">"Filled with 0" means the source chart had no row for that class, so 0 was stored. It is not a confirmed zero.</p>
    {/if}
  </AsyncState>
  {/if}
</div>

<style>
  .head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  h3 { margin: 0; font-weight: 400; font-size: 1.15rem; color: #222; }

  .dl { display: flex; gap: 6px; flex-wrap: wrap; }
  .dl button {
    font: inherit;
    font-size: 13px;
    padding: 3px 12px;
    border: 1px solid #0b7d3b;
    background: white;
    color: #0b7d3b;
    border-radius: 14px;
    cursor: pointer;
  }
  .dl button:hover:not(:disabled) { background: #0b7d3b; color: white; }
  .dl button:disabled { opacity: 0.5; cursor: not-allowed; }
  .dl button:focus-visible { outline: 2px solid #0b6fd6; outline-offset: 2px; }

  /* White background so PNG / JPG / PDF are not transparent */
  .capture { background: #fff; padding: 8px; }
  .capture-title { display: none; margin: 0 0 6px; font-weight: 600; }

  .loading { margin: 12px 0; text-align: center; font-size: 13px; color: #777; }

  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .93rem; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #e4ebe7; white-space: nowrap; }
  th { background: #eef5f0; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .share-col { width: 45%; }
  tr.sel td { background: #f3fbe9; font-weight: 600; }
  tfoot td { font-weight: 700; border-top: 2px solid #c9d8cf; border-bottom: none; background: #f7faf8; }
  .swatch { display: inline-block; width: 11px; height: 11px; margin-right: 7px; border: 1px solid #0003; vertical-align: -1px; }
  .badge { background: #fff1d6; color: #8a5300; padding: 1px 7px; border-radius: 10px; font-size: .78rem; margin-left: 6px; font-weight: 400; }

  .bar-wrap { display: flex; align-items: center; gap: 8px; }
  .bar { height: 10px; border-radius: 3px; min-width: 2px; border: 1px solid #0002; box-sizing: border-box; }
  .pct { font-variant-numeric: tabular-nums; color: #333; min-width: 44px; }
  .note { margin: 6px 0 0; font-size: .82rem; color: #6a7a70; }
</style>