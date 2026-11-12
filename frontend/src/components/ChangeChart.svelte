<script>
  import { filters, catalog } from '../stores/dashboard.js';
  import * as api from '../services/landcoverApi.js';
  import { REGION_TYPE_NOUN } from '../lib/classes.js';

  const GAIN = '#2e7d32';
  const LOSS = '#c62828';

  // ---------- year pickers ----------
  // "From" starts at the first year in the database, "To" follows the sidebar year
  let fromYear = null;
  let toYear = null;
  let lastSidebarYear = null;

  $: years = $catalog.data?.years ?? [];
  $: if (years.length && fromYear === null) fromYear = years[0];
  $: if ($filters.year !== lastSidebarYear) {
    lastSidebarYear = $filters.year;
    toYear = $filters.year;
  }

  let metric = 'ha'; // 'ha' = change in hectares, 'pct' = change in %

  // ---------- data: summary of the region for two years ----------
  let data = null;
  let loading = false;
  let error = null;
  let reqId = 0;
  let controller;

  async function load(regionType, region, a, b) {
    controller?.abort();
    const mine = ++reqId;
    controller = new AbortController();
    const { signal } = controller;

    loading = true;
    error = null;

    try {
      const base = { region_type: regionType, region };
      const [sa, sb] = await Promise.all([
        api.getSummary({ ...base, year: a }, signal),
        api.getSummary({ ...base, year: b }, signal)
      ]);
      if (mine !== reqId) return;
      data = { a: sa, b: sb };
    } catch (e) {
      if (e.name === 'AbortError' || mine !== reqId) return;
      error = e.message;
      data = null;
    } finally {
      if (mine === reqId) loading = false;
    }
  }

  $: sameYear = fromYear !== null && fromYear === toYear;

  $: if ($filters.region && fromYear !== null && toYear !== null && !sameYear) {
    load($filters.regionType, $filters.region, fromYear, toYear);
  }

  // ---------- one row per land cover class ----------
  function build({ a, b }) {
    const mapA = new Map(a.classes.map((c) => [c.class_name, c]));
    const mapB = new Map(b.classes.map((c) => [c.class_name, c]));
    const names = [...new Set([...a.classes, ...b.classes].map((c) => c.class_name))];

    return names.map((name) => {
      const ca = mapA.get(name);
      const cb = mapB.get(name);
      const va = Number(ca?.area_ha) || 0;
      const vb = Number(cb?.area_ha) || 0;
      const delta = vb - va;
      return {
        name,
        va,
        vb,
        delta,
        pct: va > 0 ? (delta / va) * 100 : null,
        // a "no data" placeholder (0) in either year makes the change meaningless
        missing: !ca || !cb || !!ca.filled_missing || !!cb.filled_missing
      };
    });
  }

  $: rows = !sameYear && data ? build(data) : [];

  $: plotRows = rows.map((r) => {
    const value = metric === 'pct' ? r.pct : r.delta;
    return { ...r, value, drawn: !r.missing && value !== null };
  });

  $: anyMissing = plotRows.some((r) => r.missing);

  // ---------- formatting ----------
  function short(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return `${Number((a / 1e9).toFixed(2))}B`;
    if (a >= 1e6) return `${Number((a / 1e6).toFixed(2))}M`;
    if (a >= 1e3) return `${Number((a / 1e3).toFixed(1))}K`;
    return String(Number(a.toFixed(1)));
  }

  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const signedShort = (v) => sign(v) + short(v);
  const tickText = (v) => (v < 0 ? '−' : '') + short(v) + (metric === 'pct' ? '%' : '');
  const area = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const signedArea = (v) => sign(v) + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 1 });

  function niceTicks(lo, hi, count) {
    const span = hi - lo || 1;
    const rough = span / count;
    const pow = 10 ** Math.floor(Math.log10(rough));
    const f = rough / pow;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
    return { min, max, ticks };
  }

  // ---------- chart geometry (drawn at the real pixel size of its box) ----------
  let W = 0, H = 0;
  $: w = Math.max(W, 300);
  $: h = Math.max(H, 180);

  $: count = plotRows.length || 1;
  $: iw = w - 74 - 16;
  $: band = iw / count;
  $: tilt = band < 80;                       // tilt the class names when columns are narrow
  $: M = { l: 74, r: 16, t: 18, b: tilt ? 66 : 36 };
  $: ih = h - M.t - M.b;

  $: values = plotRows.filter((r) => r.drawn).map((r) => r.value);
  $: lo = Math.min(0, ...values);
  $: hi = Math.max(0, ...values);
  $: scale = niceTicks(lo, hi === 0 && lo === 0 ? 1 : hi, Math.max(2, Math.min(6, Math.floor(ih / 50))));
  $: y = (v) => M.t + ih - ((v - scale.min) / (scale.max - scale.min)) * ih;
  $: zeroY = y(0);

  // ---------- hover tooltip ----------
  let wrapEl;
  let tip = null;

  function showTip(event, r) {
    if (!wrapEl) return;
    const b = wrapEl.getBoundingClientRect();
    const x = event.clientX - b.left;
    const py = event.clientY - b.top;
    tip = { r, x, y: py, flip: x > b.width / 2, below: py < 110 };
  }

  const hideTip = () => (tip = null);

  // ---------- text ----------
  $: regionLabel = $filters.regionType === 'hkh'
    ? 'HKH region'
    : `${$filters.region} ${REGION_TYPE_NOUN[$filters.regionType] ?? ''}`.trim();

  $: message = error
    ? error
    : sameYear
      ? 'Choose two different years to see the change'
      : loading && !rows.length
        ? 'Loading…'
        : !rows.length
          ? 'No land-cover records for this region and years'
          : values.length === 0
            ? 'No change can be shown for this selection'
            : '';
</script>

<div class="change-root">
  <div class="toolbar">
    <label>
      From
      <select bind:value={fromYear}>
        {#each years as yr}<option value={yr}>{yr}</option>{/each}
      </select>
    </label>
    <label>
      To
      <select bind:value={toYear}>
        {#each years as yr}<option value={yr}>{yr}</option>{/each}
      </select>
    </label>

    <div class="toggle" role="group" aria-label="Change measured in">
      <button class:active={metric === 'ha'} on:click={() => (metric = 'ha')}>Hectares</button>
      <button class:active={metric === 'pct'} on:click={() => (metric = 'pct')}>Percent</button>
    </div>
  </div>

  <h3>Change in land cover of {regionLabel}, {fromYear} → {toYear}</h3>

  <div class="plot" bind:clientWidth={W} bind:clientHeight={H}>
    <div class="wrap" bind:this={wrapEl} on:mouseleave={hideTip} role="presentation">
      <svg width={w} height={h} viewBox="0 0 {w} {h}" role="img"
           aria-label="Change in land cover area between {fromYear} and {toYear}" class:dim={loading}>
        <text class="axis-title" transform="rotate(-90) translate({-(M.t + ih / 2)} 14)" text-anchor="middle">
          {metric === 'pct' ? 'Change (%)' : 'Change in area (ha)'}
        </text>

        {#each scale.ticks as t}
          <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} class="grid" />
          <text x={M.l - 8} y={y(t) + 4} text-anchor="end" class="tick">{tickText(t)}</text>
        {/each}

        {#if plotRows.length}
          <line x1={M.l} x2={w - M.r} y1={zeroY} y2={zeroY} class="zero" />
        {/if}

        {#each plotRows as r, i}
          {@const cx = M.l + band * i + band / 2}
          {@const bw = Math.min(band * 0.5, 56)}
          <g class:active={tip && tip.r.name === r.name}>
            <rect class="hit" x={M.l + band * i} y={M.t} width={band} height={ih}
                  on:mouseenter={(e) => showTip(e, r)}
                  on:mousemove={(e) => showTip(e, r)}
                  on:mouseleave={hideTip}
                  role="presentation" />

            {#if r.drawn}
              {@const top = Math.min(y(r.value), zeroY)}
              {@const bh = Math.abs(y(r.value) - zeroY)}
              <rect x={cx - bw / 2} y={top} width={bw}
                    height={r.value === 0 ? 0 : Math.max(bh, 1)}
                    fill={r.value >= 0 ? GAIN : LOSS} />
              {#if band >= 52}
                <text class="value" x={cx} text-anchor="middle"
                      y={r.value >= 0 ? top - 5 : top + bh + 13}>
                  {signedShort(r.value)}{metric === 'pct' ? '%' : ''}
                </text>
              {/if}
            {:else}
              <text class="note" x={cx} y={zeroY - 6} text-anchor="middle">
                {r.missing ? 'no data' : 'n/a'}
              </text>
            {/if}

            {#if tilt}
              <text class="cls" text-anchor="end"
                    transform="translate({cx + 4} {h - M.b + 14}) rotate(-35)">{r.name}</text>
            {:else}
              <text class="cls" x={cx} y={h - M.b + 18} text-anchor="middle">{r.name}</text>
            {/if}
          </g>
        {/each}
      </svg>

      {#if message}
        <div class="empty" class:error={!!error}>{message}</div>
      {/if}

      {#if tip}
        <div class="tip" class:flip={tip.flip} class:below={tip.below}
             style="left: {tip.x}px; top: {tip.y}px;">
          <div class="tip-name">{tip.r.name}</div>
          <div class="tip-line">{fromYear}: {area(tip.r.va)} ha</div>
          <div class="tip-line">{toYear}: {area(tip.r.vb)} ha</div>
          {#if tip.r.missing}
            <div class="tip-note">No source row in one of the years, change is not reliable</div>
          {:else}
            <div class="tip-value" style="color: {tip.r.delta >= 0 ? '#8ee59a' : '#ff9a9a'}">
              {signedArea(tip.r.delta)} ha
              {#if tip.r.pct !== null}({sign(tip.r.pct)}{Math.abs(tip.r.pct).toFixed(1)}%){/if}
            </div>
            {#if tip.r.pct === null}
              <div class="tip-sub">% change not defined: area was 0 in {fromYear}</div>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <p class="foot">
    <span class="dot gain"></span> grew
    <span class="dot loss"></span> shrank
    {#if anyMissing}· “no data” = the source had no row for that class in one of the two years{/if}
  </p>
</div>

<style>
  .change-root {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .toolbar {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    margin-bottom: 4px;
    font-size: 13px;
    color: #444;
  }

  .toolbar label { display: flex; align-items: center; gap: 6px; }

  .toolbar select {
    font: inherit;
    padding: 2px 6px;
    border: 1px solid #bbb;
    border-radius: 4px;
    background: white;
  }

  .toggle { margin-left: auto; display: flex; gap: 6px; }

  .toggle button {
    font: inherit;
    font-size: 12px;
    padding: 2px 10px;
    border: 1px solid #0b7d3b;
    background: white;
    color: #0b7d3b;
    border-radius: 12px;
    cursor: pointer;
  }

  .toggle button.active { background: #0b7d3b; color: white; }
  .toggle button:focus-visible,
  .toolbar select:focus-visible { outline: 2px solid #0b6fd6; outline-offset: 2px; }

  h3 {
    flex-shrink: 0;
    margin: 0 0 4px;
    font-weight: 400;
    font-size: clamp(13px, 1.3vw, 16px);
    text-align: center;
    color: #222;
  }

  .plot { flex: 1; min-height: 0; min-width: 0; position: relative; overflow: hidden; }
  .wrap { position: absolute; inset: 0; }
  svg { display: block; transition: opacity 0.2s ease; }
  svg.dim { opacity: 0.4; }

  .grid { stroke: #e3e8e5; }
  .zero { stroke: #555; stroke-width: 1.5; }
  .tick { font-size: 12px; fill: #444; }
  .axis-title { font-size: 12px; fill: #555; }
  .cls { font-size: 11.5px; fill: #444; }
  .value { font-size: 11px; fill: #333; }
  .note { font-size: 11px; fill: #9a5a00; }

  .hit { fill: transparent; cursor: default; }
  g.active .hit { fill: rgba(11, 125, 59, 0.08); }

  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    text-align: center;
    font-size: 13px;
    color: #777;
    pointer-events: none;
  }
  .empty.error { color: #b00020; }

  .foot {
    flex-shrink: 0;
    margin: 4px 0 0;
    font-size: .82rem;
    color: #6a7a70;
  }

  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin: 0 3px 0 8px;
    border-radius: 2px;
    vertical-align: -1px;
  }
  .dot:first-child { margin-left: 0; }
  .dot.gain { background: #2e7d32; }
  .dot.loss { background: #c62828; }

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
    line-height: 1.4;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    transform: translate(12px, calc(-100% - 10px));
  }
  .tip.flip { transform: translate(calc(-100% - 12px), calc(-100% - 10px)); }
  .tip.below { transform: translate(12px, 14px); }
  .tip.flip.below { transform: translate(calc(-100% - 12px), 14px); }
  .tip-name { font-weight: 700; }
  .tip-value { font-size: 14px; font-weight: 700; margin-top: 2px; }
  .tip-sub { color: #cfcfcf; }
  .tip-note { color: #ffcf7a; margin-top: 2px; }
</style>