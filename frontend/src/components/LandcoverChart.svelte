<script>
    export let title = "Land cover area";

    // Result: { Forest: 1200.5, Grassland: 300.2, ... } in hectares.
    // null means there is nothing to show yet.
    export let areaHa = null;
    export let year = "";
    export let loading = false;
    export let error = null;

    // Text shown when areaHa is null (no data / nothing selected)
    export let hint = "Draw a polygon on the map to see its land cover";

    // Class names whose value was filled with 0 (not confirmed by the source chart)
    export let filled = [];

    // Fixed class order, so bars never jump around between requests
    const CLASS_NAMES = [
        "Forest",
        "Grassland",
        "Cropland",
        "Bare soil",
        "Bare rock",
        "Built-up area",
        "Snow and glacier",
        "Water body",
        "Riverbed"
    ];

    // Display colours only (matched to the legend)
    const COLORS = {
        "Forest": "#267300",
        "Grassland": "#b4ff9f",
        "Cropland": "#ffff00",
        "Bare soil": "#d7c29e",
        "Bare rock": "#e8beff",
        "Built-up area": "#ff0000",
        "Snow and glacier": "#73dfff",
        "Water body": "#0066ff",
        "Riverbed": "#2b9cff"
    };

    // Pick a "nice" top value and tick marks, e.g. max 150M -> 0, 50M, 100M, 150M
    function niceScale(max) {
        if (max <= 0) return { top: 1, ticks: [0] };

        const rough = max / 4;
        const pow = 10 ** Math.floor(Math.log10(rough));
        const f = rough / pow;
        const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
        const top = Math.ceil(max / step) * step;

        const ticks = [];
        for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);

        return { top, ticks };
    }

    function formatTick(v) {
        if (v >= 1e9) return `${Number((v / 1e9).toFixed(1))}B`;
        if (v >= 1e6) return `${Number((v / 1e6).toFixed(1))}M`;
        if (v >= 1e3) return `${Number((v / 1e3).toFixed(1))}K`;
        return String(Number(v.toFixed(2)));
    }

    function formatArea(v) {
        return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }

    $: bars = CLASS_NAMES.map(name => ({
        name,
        value: Number(areaHa?.[name]) || 0,
        color: COLORS[name],
        filled: filled.includes(name)
    }));

    $: maxValue = Math.max(...bars.map(b => b.value), 0);
    $: ({ top, ticks } = niceScale(maxValue));
    $: totalHa = bars.reduce((sum, b) => sum + b.value, 0);

    $: emptyMessage = error
        ? error
        : loading
            ? "Loading…"
            : areaHa
                ? "All classes are zero for this selection"
                : hint;

    // ---------- Hover tooltip ----------
    let fieldEl;
    let tip = null;

    function showTip(event, bar) {
        if (!fieldEl || loading || error || !areaHa) return;

        const r = fieldEl.getBoundingClientRect();
        const x = event.clientX - r.left;
        const y = event.clientY - r.top;

        tip = { bar, x, y, flip: x > r.width / 2, below: y < 70 };
    }

    function hideTip() {
        tip = null;
    }
</script>

<div class="chart">
    <h3 class="title">{title}</h3>

    {#if areaHa && !loading && !error}
        <p class="summary">
            Total {formatArea(totalHa)} ha
            {#if year}· {year}{/if}
            {#if filled.length}· {filled.length} class(es) had no source data, shown as 0{/if}
        </p>
    {/if}

    <div class="plot">
        <div class="y-title">Area (ha)</div>

        <!-- Y axis labels -->
        <div class="y-axis">
            {#each ticks as t}
                <span class="tick" style="bottom: {(t / top) * 100}%">
                    {formatTick(t)}
                </span>
            {/each}
        </div>

        <!-- Gridlines + bars -->
        <div class="field" bind:this={fieldEl} on:mouseleave={hideTip} role="presentation">
            {#each ticks as t}
                <div class="gridline" style="bottom: {(t / top) * 100}%"></div>
            {/each}

            <div class="bars" class:dim={loading}>
                {#each bars as b}
                    <div
                        class="bar-col"
                        class:active={tip && tip.bar.name === b.name}
                        role="presentation"
                        on:mouseenter={(e) => showTip(e, b)}
                        on:mousemove={(e) => showTip(e, b)}
                        on:mouseleave={hideTip}
                    >
                        <div
                            class="bar"
                            style="height: {(b.value / top) * 100}%; background: {b.color};"
                        ></div>
                    </div>
                {/each}
            </div>

            {#if error || loading || maxValue === 0}
                <div class="empty" class:error={!!error}>{emptyMessage}</div>
            {/if}

            {#if tip}
                <div
                    class="tip"
                    class:flip={tip.flip}
                    class:below={tip.below}
                    style="left: {tip.x}px; top: {tip.y}px;"
                >
                    <div class="tip-name">
                        <span class="swatch" style="background: {tip.bar.color}"></span>
                        {tip.bar.name}
                    </div>
                    <div class="tip-value">{formatArea(tip.bar.value)} ha</div>
                    {#if totalHa > 0}
                        <div class="tip-sub">{((tip.bar.value / totalHa) * 100).toFixed(1)}% of total</div>
                    {/if}
                    {#if tip.bar.filled}
                        <div class="tip-note">No source row, stored as 0</div>
                    {/if}
                </div>
            {/if}
        </div>

        <!-- X axis labels -->
        <div class="labels">
            {#each bars as b}
                <div class="label" title={b.name}>
                    {b.name}{#if b.filled}<span class="star">*</span>{/if}
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    .chart {
        container-type: inline-size;
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .title {
        margin: 0 0 6px;
        text-align: center;
        font-size: clamp(13px, 1.3vw, 16px);
        font-weight: 400;
        color: #333;
    }

    .summary {
        margin: 0 0 6px;
        text-align: center;
        font-size: 12px;
        color: #666;
    }

    .plot {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: 20px 48px minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr) auto;
        column-gap: 4px;
    }

    .y-title {
        grid-column: 1;
        grid-row: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        font-size: 11px;
        color: #666;
    }

    .y-axis {
        grid-column: 2;
        grid-row: 1;
        position: relative;
    }

    .tick {
        position: absolute;
        right: 4px;
        transform: translateY(50%);
        font-size: 11px;
        color: #666;
        white-space: nowrap;
    }

    .field {
        grid-column: 3;
        grid-row: 1;
        position: relative;
        border-bottom: 1px solid #ccc;
    }

    .gridline {
        position: absolute;
        left: 0;
        right: 0;
        height: 0;
        border-top: 1px solid #e3e3e3;
    }

    .bars {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: stretch;
        transition: opacity 0.2s ease;
    }

    .bars.dim {
        opacity: 0.35;
    }

    .bar-col {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        cursor: default;
    }

    .bar-col.active {
        background: rgba(11, 125, 59, 0.08);
    }

    .bar {
        width: 55%;
        max-width: 48px;
        min-height: 0;
        transition: height 0.3s ease;
    }

    .bar-col.active .bar {
        filter: brightness(0.9);
        outline: 1px solid rgba(0, 0, 0, 0.35);
    }

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

    .empty.error {
        color: #b00020;
    }

    /* ---- hover tooltip ---- */
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

    .tip.flip {
        transform: translate(calc(-100% - 12px), calc(-100% - 10px));
    }

    .tip.below {
        transform: translate(12px, 14px);
    }

    .tip.flip.below {
        transform: translate(calc(-100% - 12px), 14px);
    }

    .tip-name {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
    }

    .swatch {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        border: 1px solid rgba(255, 255, 255, 0.6);
    }

    .tip-value {
        font-size: 14px;
    }

    .tip-sub {
        color: #cfcfcf;
    }

    .tip-note {
        color: #ffcf7a;
    }

    .labels {
        grid-column: 3;
        grid-row: 2;
        display: flex;
        padding-top: 4px;
    }

    .label {
        flex: 1;
        min-width: 0;
        text-align: center;
        font-size: clamp(9px, 0.9vw, 12px);
        color: #555;
        overflow-wrap: anywhere;
        line-height: 1.2;
    }

    .star {
        color: #c26a00;
        font-weight: 700;
    }

    @container (max-width: 560px) {
        .label {
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            text-align: left;
            white-space: nowrap;
            font-size: 10px;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .bar,
        .bars {
            transition: none;
        }
    }
</style>