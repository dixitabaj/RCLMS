<script>
  import { summary, filters } from '../stores/dashboard.js';
  import { REGION_TYPE_NOUN, colorFor } from '../lib/classes.js';
  import { compact, full, niceScale } from '../lib/format.js';
  import AsyncState from './AsyncState.svelte';

  const W = 900, H = 300, M = { l: 62, r: 16, t: 14, b: 34 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;

  $: rows = $summary.data?.classes ?? [];
  $: scale = niceScale(Math.max(0, ...rows.map((r) => r.area_ha)));
  $: band = iw / Math.max(rows.length, 1);
  $: y = (v) => M.t + ih - (v / scale.max) * ih;
  $: total = rows.reduce((sum, r) => sum + r.area_ha, 0);
  $: title = $filters.regionType === 'hkh'
    ? `Land cover of HKH region in ${$filters.year}`
    : `Land cover of ${$filters.region} ${REGION_TYPE_NOUN[$filters.regionType]} in ${$filters.year}`;

  // ---------- Hover tooltip ----------
  let wrapEl;
  let tip = null;

  function showTip(event, r) {
    if (!wrapEl) return;
    const b = wrapEl.getBoundingClientRect();
    const x = event.clientX - b.left;
    const yy = event.clientY - b.top;
    tip = { r, x, y: yy, flip: x > b.width / 2, below: yy < 70 };
  }

  function hideTip() {
    tip = null;
  }
</script>

<h3>{title}</h3>
<AsyncState state={$summary} isEmpty={rows.length === 0}
            emptyText="No land-cover records for this region and year.">
  <div class="wrap" bind:this={wrapEl} on:mouseleave={hideTip} role="presentation">
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={title}>
      <text class="axis-title" transform="rotate(-90) translate({-(M.t + ih / 2)} 14)" text-anchor="middle">Area (ha)</text>
      {#each scale.ticks as t}
        <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} class="grid" />
        <text x={M.l - 8} y={y(t) + 4} text-anchor="end" class="tick">{compact(t)}</text>
      {/each}

      {#each rows as r, i}
        {@const cx = M.l + band * i + band / 2}
        {@const bw = band * 0.42}
        <g class:active={tip && tip.r.class_name === r.class_name}>
          <!-- Full-height hover area, so thin or empty bars are still easy to hover -->
          <rect class="hit" x={M.l + band * i} y={M.t} width={band} height={ih}
                on:mouseenter={(e) => showTip(e, r)}
                on:mousemove={(e) => showTip(e, r)}
                on:mouseleave={hideTip}
                role="presentation" />
          {#if r.filled_missing}
            <rect x={cx - bw / 2} y={M.t + ih - 14} width={bw} height="14" class="filled" />
            <text x={cx} y={M.t + ih - 18} text-anchor="middle" class="note">no data</text>
          {:else}
            <rect class="bar" x={cx - bw / 2} y={y(r.area_ha)} width={bw}
                  height={Math.max(M.t + ih - y(r.area_ha), r.area_ha > 0 ? 1 : 0)}
                  fill={colorFor(r.class_name)} />
          {/if}
          <text x={cx} y={H - 12} text-anchor="middle" class="tick">{r.class_name}</text>
        </g>
      {/each}
    </svg>

    {#if tip}
      <div class="tip" class:flip={tip.flip} class:below={tip.below}
           style="left: {tip.x}px; top: {tip.y}px;">
        <div class="tip-name">
          <span class="swatch" style="background: {colorFor(tip.r.class_name)}"></span>
          {tip.r.class_name}
        </div>
        <div class="tip-value">{full(tip.r.area_ha)} ha</div>
        {#if total > 0}
          <div class="tip-sub">{((tip.r.area_ha / total) * 100).toFixed(1)}% of total</div>
        {/if}
        {#if tip.r.filled_missing}
          <div class="tip-note">No row in source chart, stored as 0</div>
        {/if}
      </div>
    {/if}
  </div>
  {#if $summary.data?.has_filled_missing}
    <p class="foot">“No data” means the original chart had no row for that class, so the database holds 0 as a placeholder.</p>
  {/if}
</AsyncState>

<style>
  h3 { margin: 0 0 4px; font-weight: 400; font-size: 1.15rem; text-align: center; color: #222; }
  .wrap { position: relative; }
  svg { width: 100%; height: auto; display: block; }
  .grid { stroke: #dfe5e1; }
  .tick { font-size: 12.5px; fill: #444; }
  .axis-title { font-size: 12.5px; fill: #555; }
  .note { font-size: 11px; fill: #9a5a00; }
  .filled { fill: #e9dfc9; stroke: #b98a2c; stroke-dasharray: 3 2; }
  .foot { margin: 4px 0 0; font-size: .82rem; color: #7a5a1c; }

  .hit { fill: transparent; cursor: default; }
  g.active .hit { fill: rgba(11, 125, 59, 0.08); }
  g.active .bar { stroke: rgba(0, 0, 0, 0.45); stroke-width: 1; }

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
  .tip-name { display: flex; align-items: center; gap: 6px; font-weight: 700; }
  .swatch { width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(255, 255, 255, 0.6); }
  .tip-value { font-size: 14px; }
  .tip-sub { color: #cfcfcf; }
  .tip-note { color: #ffcf7a; }
</style>