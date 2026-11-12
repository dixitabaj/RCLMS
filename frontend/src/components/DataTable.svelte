<script>
  import { records, filters } from '../stores/dashboard.js';
  import { exportUrl } from '../services/landcoverApi.js';
  import { full } from '../lib/format.js';
  import { colorFor } from '../lib/classes.js';
  import AsyncState from './AsyncState.svelte';
  import ExportMenu from './ExportMenu.svelte';

  let captureEl;   // the part that gets exported as an image / PDF

  // Largest class first
  $: rows = [...($records.data?.results ?? [])].sort((a, b) => b.area_ha - a.area_ha);
  $: total = rows.reduce((sum, r) => sum + r.area_ha, 0);
  $: maxShare = total ? (100 * (rows[0]?.area_ha ?? 0)) / total : 0;
  $: share = (v) => (total ? (100 * v) / total : 0);
  $: anyFilled = rows.some((r) => r.filled_missing);

  $: base = { region_type: $filters.regionType, region: $filters.region };
  $: urlYear = exportUrl({ ...base, year: $filters.year });
  $: urlAll = exportUrl(base);

  $: emptyText = $filters.missing
    ? `No data found for "${$filters.region}".`
    : 'No records for this region and year.';
</script>

<div class="head">
  <h3>Land cover by class: {$filters.region}, {$filters.year}</h3>
  <ExportMenu
    target={captureEl}
    {rows}
    region={$filters.region}
    year={$filters.year}
    {urlYear}
    {urlAll}
    disabled={rows.length === 0} />
</div>

<div class="capture" bind:this={captureEl}>
  <h4 class="capture-title">{$filters.region}, {$filters.year}</h4>
  <AsyncState state={$records} isEmpty={rows.length === 0} {emptyText}>
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
            <tr class:sel={r.class_name === $filters.className}>
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
</div>

<style>
  .head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  h3 { margin: 0; font-weight: 400; font-size: 1.15rem; color: #222; }

  /* White background so PNG / JPG / PDF are not transparent */
  .capture { background: #fff; padding: 8px; }
  .capture-title { display: none; margin: 0 0 6px; font-weight: 600; }

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