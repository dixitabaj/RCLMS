<script>
  import { createEventDispatcher } from 'svelte';
  import { trend, filters } from '../stores/dashboard.js';
  import { colorFor } from '../lib/classes.js';
  import { compact, full } from '../lib/format.js';
  import AsyncState from './AsyncState.svelte';

  const dispatch = createEventDispatcher();

  // Same names as the sidebar and the Django API (the API rejects any other spelling)
  const landcoverClasses = [
    'Forest',
    'Grassland',
    'Cropland',
    'Bare soil',
    'Bare rock',
    'Built-up',
    'Snow and glacier',
    'Water body',
    'Riverbed'
  ];

  // Tell App.svelte, which owns the selection and passes it back to the sidebar too
  function handleClassChange(event) {
    dispatch('classChange', event.target.value);
  }

  // The chart is drawn at the real pixel size of its box, so text stays the
  // same size and the chart always fills the card (no stretched fonts).
  const M = { l: 74, r: 22, t: 14, b: 32 };

  let W = 0, H = 0;                       // measured size of the plot box
  $: w = Math.max(W, 280);
  $: h = Math.max(H, 150);
  $: iw = w - M.l - M.r;
  $: ih = h - M.t - M.b;

  // No points at all when the region is missing from the database
  $: pts = $filters.missing ? [] : ($trend.data?.points ?? []);
  $: vals = pts.map((p) => p.area_ha);
  $: lo = vals.length ? Math.min(...vals) : 0;
  $: hi = vals.length ? Math.max(...vals) : 1;
  $: pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
  $: yMin = Math.max(0, lo - pad);
  $: yMax = hi + pad;

  // Fewer gridlines when the chart is short
  $: tickCount = Math.max(2, Math.min(5, Math.floor(ih / 60)));
  $: yTicks = Array.from({ length: tickCount + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / tickCount);

  $: x0 = pts[0]?.year ?? 2000;
  $: x1 = pts[pts.length - 1]?.year ?? 2022;
  $: x = (yr) => M.l + ((yr - x0) / Math.max(x1 - x0, 1)) * iw;
  $: y = (v) => M.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  $: path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.year)},${y(p.area_ha)}`).join(' ');

  // Label every year when there is room, every 2nd / 3rd year when narrow
  $: pxPerYear = iw / Math.max(x1 - x0, 1);
  $: yearStep = Math.max(1, Math.ceil(36 / pxPerYear));

  $: color = colorFor($filters.className);
  $: stroke = $filters.className === 'Cropland' || $filters.className === 'Grassland' ? '#6b7d00' : color;

  $: emptyMessage = $filters.missing
    ? `No data found for "${$filters.region}".`
    : 'No yearly records for this class and region.';

  // ---------- Hover tooltip ----------
  let wrapEl;
  let tip = null;

  function showTip(event, p) {
    if (!wrapEl) return;
    const b = wrapEl.getBoundingClientRect();
    const px = event.clientX - b.left;
    const py = event.clientY - b.top;
    tip = { p, x: px, y: py, flip: px > b.width / 2, below: py < 70 };
  }

  function hideTip() {
    tip = null;
  }
</script>

<div class="trend-root">
  <div class="trend-controls">
    <label for="landcover-class">Land cover:</label>

    <select
      id="landcover-class"
      value={$filters.className}
      on:change={handleClassChange}
    >
      {#each landcoverClasses as className}
        <option value={className}>{className}</option>
      {/each}
    </select>
  </div>

  <h3>
    {$filters.className} in {$filters.region}{pts.length ? `, ${x0}–${x1}` : ''}
  </h3>

  <div class="plot" bind:clientWidth={W} bind:clientHeight={H}>
    <AsyncState state={$trend} isEmpty={pts.length === 0} emptyText={emptyMessage}>
      <div class="wrap" bind:this={wrapEl} on:mouseleave={hideTip} role="presentation">
        <svg width={w} height={h} viewBox="0 0 {w} {h}" role="img" aria-label="Trend of {$filters.className} over time">
          <text class="axis-title" transform="rotate(-90) translate({-(M.t + ih / 2)} 14)" text-anchor="middle">Area (ha)</text>
          {#each yTicks as t}
            <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} class="grid" />
            <text x={M.l - 8} y={y(t) + 4} text-anchor="end" class="tick">{compact(t)}</text>
          {/each}
          {#each pts as p}
            {#if (p.year - x0) % yearStep === 0}
              <text x={x(p.year)} y={h - 10} text-anchor="middle" class="tick year">{p.year}</text>
            {/if}
          {/each}

          <!-- Guide line under the hovered year -->
          {#if tip}
            <line class="guide" x1={x(tip.p.year)} x2={x(tip.p.year)} y1={M.t} y2={M.t + ih} />
          {/if}

          <path d={path} fill="none" stroke={stroke} stroke-width="2.5" stroke-linejoin="round" />
          {#each pts as p}
            <circle cx={x(p.year)} cy={y(p.area_ha)}
                    r={p.year === $filters.year || (tip && tip.p.year === p.year) ? 6 : 3.5}
                    fill={p.filled_missing ? '#fff' : stroke}
                    stroke={p.filled_missing ? '#c26a00' : '#fff'} stroke-width="2" />
            <!-- Larger invisible circle: easy to hover -->
            <circle class="hit" cx={x(p.year)} cy={y(p.area_ha)} r="14"
                    on:mouseenter={(e) => showTip(e, p)}
                    on:mousemove={(e) => showTip(e, p)}
                    on:mouseleave={hideTip}
                    role="presentation" />
          {/each}
        </svg>

        {#if tip}
          <div class="tip" class:flip={tip.flip} class:below={tip.below}
               style="left: {tip.x}px; top: {tip.y}px;">
            <div class="tip-name">{$filters.className} · {tip.p.year}</div>
            <div class="tip-value">{full(tip.p.area_ha)} ha</div>
            {#if tip.p.filled_missing}
              <div class="tip-note">No row in source chart, stored as 0</div>
            {/if}
          </div>
        {/if}
      </div>
    </AsyncState>
  </div>

  {#if pts.length}
    <p class="foot">The line has a gap between 2011 and 2013 because the source has no data for 2012. The larger dot marks the selected year.</p>
  {/if}
</div>

<style>
  .trend-root {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .trend-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-bottom: 4px;
    flex-shrink: 0;
  }

  .trend-controls label {
    font-size: 13px;
    color: #555;
  }

  .trend-controls select {
    padding: 4px 10px;
    border: 1px solid #dfe5e1;
    border-radius: 6px;
    background: white;
    font-size: 13px;
  }

  h3 {
    margin: 0 0 4px;
    flex-shrink: 0;
    font-weight: 400;
    font-size: clamp(13px, 1.3vw, 16px);
    text-align: center;
    color: #222;
  }

  /* The box we measure; the chart is drawn at exactly this size */
  .plot {
    flex: 1;
    min-height: 0;
    min-width: 0;
    position: relative;
    overflow: hidden;
  }

  .wrap { position: absolute; inset: 0; }
  svg { display: block; }

  .grid { stroke: #dfe5e1; }
  .guide { stroke: #9db8a8; stroke-dasharray: 4 3; }
  .tick { font-size: 12px; fill: #444; }
  .year { font-size: 11px; }
  .axis-title { font-size: 12px; fill: #555; }
  .foot { margin: 4px 0 0; flex-shrink: 0; font-size: .82rem; color: #6a7a70; }

  .hit { fill: transparent; cursor: default; }

  .tip {
    position: absolute;
    z-index: 20;
    pointer-events: none;
    white-space: nowrap;
    padding: 6px 10px;
    border-radius: 6px;
    background: rgba(30, 30, 30, 0.93);
    color: #fff;
    font-size: 12px;
    line-height: 1.35;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    transform: translate(12px, calc(-100% - 10px));
  }
  .tip.flip { transform: translate(calc(-100% - 12px), calc(-100% - 10px)); }
  .tip.below { transform: translate(12px, 14px); }
  .tip.flip.below { transform: translate(calc(-100% - 12px), 14px); }
  .tip-name { font-weight: 700; }
  .tip-value { font-size: 14px; }
  .tip-note { color: #ffcf7a; }
</style>