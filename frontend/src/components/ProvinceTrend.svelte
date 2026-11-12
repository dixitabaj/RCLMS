<script>
    // Line chart + table for a geometry (province) whose per-year areas are
    // computed one year at a time. No chart library needed (plain SVG).

    // { [year]: { [className]: area_ha } }
    export let series = {};
    // Class shown in the line chart (same naming as the bar chart)
    export let className = "Forest";
    export let title = "";
    export let progress = { done: 0, total: 0 };
    export let error = null;

    let view = "line"; // "line" | "table"

    // ---------- data ----------
    $: yearList = Object.keys(series).map(Number).sort((a, b) => a - b);

    $: points = yearList
        .map((y) => ({ year: y, value: series[y]?.[className] }))
        .filter((p) => typeof p.value === "number");

    $: classNames = yearList.length ? Object.keys(series[yearList[0]] ?? {}) : [];

    $: loading = progress.total > 0 && progress.done < progress.total;

    // ---------- chart geometry ----------
    const W = 520;
    const H = 260;
    const M = { top: 20, right: 20, bottom: 36, left: 64 };
    const innerW = W - M.left - M.right;
    const innerH = H - M.top - M.bottom;

    $: minY = points.length ? Math.min(...points.map((p) => p.value)) : 0;
    $: maxY = points.length ? Math.max(...points.map((p) => p.value)) : 1;
    $: pad = (maxY - minY) * 0.12 || Math.max(maxY * 0.05, 1);
    $: yLo = Math.max(0, minY - pad);
    $: yHi = maxY + pad;

    $: xMin = points.length ? points[0].year : 0;
    $: xMax = points.length ? points[points.length - 1].year : 1;

    const sx = (year, lo, hi) =>
        M.left + (hi === lo ? innerW / 2 : ((year - lo) / (hi - lo)) * innerW);
    const sy = (v, lo, hi) =>
        M.top + innerH - (hi === lo ? 0 : ((v - lo) / (hi - lo)) * innerH);

    $: coords = points.map((p) => ({
        ...p,
        x: sx(p.year, xMin, xMax),
        y: sy(p.value, yLo, yHi)
    }));

    $: linePath = coords.map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

    $: yTicks = Array.from({ length: 5 }, (_, i) => yLo + ((yHi - yLo) * i) / 4);

    // Show about 6 year labels at most
    $: xLabelStep = Math.max(1, Math.ceil(coords.length / 6));

    const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
    const full = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

    // ---------- CSV export ----------
    function downloadCsv() {
        const header = ["Year", ...classNames].join(",");
        const rows = yearList.map((y) =>
            [y, ...classNames.map((c) => series[y]?.[c] ?? "")].join(",")
        );
        const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(title || "province").replace(/[^a-z0-9]+/gi, "_")}_landcover.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="wrap">
    <div class="head">
        <div class="title">
            {title || "Land cover trend"}
        </div>

        <div class="switch" role="tablist">
            <button role="tab" aria-selected={view === "line"}
                    class:active={view === "line"} on:click={() => (view = "line")}>
                Line
            </button>
            <button role="tab" aria-selected={view === "table"}
                    class:active={view === "table"} on:click={() => (view = "table")}>
                Table
            </button>
        </div>
    </div>

    {#if error && !yearList.length}
        <div class="msg error">{error}</div>
    {:else if !yearList.length}
        <div class="msg">
            {loading ? `Loading years… ${progress.done}/${progress.total}` : "Click a province to see its trend"}
        </div>
    {:else if view === "line"}
        <svg viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet" role="img"
             aria-label="Trend of {className}">
            <!-- grid + y axis -->
            {#each yTicks as t}
                <line class="grid" x1={M.left} x2={W - M.right}
                      y1={sy(t, yLo, yHi)} y2={sy(t, yLo, yHi)} />
                <text class="tick" x={M.left - 8} y={sy(t, yLo, yHi) + 4} text-anchor="end">
                    {compact.format(t)}
                </text>
            {/each}

            <!-- x axis labels -->
            {#each coords as c, i}
                {#if i % xLabelStep === 0 || i === coords.length - 1}
                    <text class="tick" x={c.x} y={H - M.bottom + 18} text-anchor="middle">
                        {c.year}
                    </text>
                {/if}
            {/each}

            <text class="axis-title" x={14} y={M.top + innerH / 2}
                  transform="rotate(-90 14 {M.top + innerH / 2})" text-anchor="middle">
                {className} (ha)
            </text>

            <!-- line + points -->
            <path class="line" d={linePath} />
            {#each coords as c}
                <circle class="dot" cx={c.x} cy={c.y} r="4">
                    <title>{c.year}: {full.format(c.value)} ha</title>
                </circle>
            {/each}
        </svg>

        {#if loading}
            <div class="progress">Loading years… {progress.done}/{progress.total}</div>
        {/if}
    {:else}
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Year</th>
                        {#each classNames as c}<th>{c}</th>{/each}
                    </tr>
                </thead>
                <tbody>
                    {#each yearList as y}
                        <tr>
                            <td>{y}</td>
                            {#each classNames as c}
                                <td>{typeof series[y]?.[c] === "number" ? full.format(series[y][c]) : "–"}</td>
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <div class="foot">
            <span>Area in hectares</span>
            <button class="csv" on:click={downloadCsv}>Download CSV</button>
        </div>
    {/if}
</div>

<style>
    .wrap {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        min-width: 0;
        padding: 0 8px;
        font-family: Lato, "Segoe UI", Arial, sans-serif;
        color: #222;
    }

    .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-shrink: 0;
        margin-bottom: 4px;
    }

    .title {
        font-size: 14px;
        font-weight: 700;
        color: #0b7d3b;
    }

    .switch { display: flex; gap: 4px; }

    .switch button,
    .csv {
        font: inherit;
        font-size: 12px;
        padding: 2px 10px;
        border: 1px solid #0b7d3b;
        background: white;
        color: #0b7d3b;
        border-radius: 12px;
        cursor: pointer;
    }

    .switch button.active { background: #0b7d3b; color: white; }

    svg { flex: 1; min-height: 0; width: 100%; }

    .grid { stroke: #e3e8e5; stroke-width: 1; }
    .tick { font-size: 11px; fill: #555; }
    .axis-title { font-size: 11px; fill: #555; }
    .line { fill: none; stroke: #0b7d3b; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .dot { fill: white; stroke: #0b7d3b; stroke-width: 2; }
    .dot:hover { fill: #0b7d3b; }

    .msg {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        color: #666;
        text-align: center;
    }
    .msg.error { color: #b00020; }

    .progress { font-size: 12px; color: #666; text-align: center; }

    .table-wrap { flex: 1; min-height: 0; overflow: auto; }

    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 4px 8px; text-align: right; border-bottom: 1px solid #eee; white-space: nowrap; }
    th:first-child, td:first-child { text-align: left; }
    thead th { position: sticky; top: 0; background: #f2f2f2; }

    .foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        color: #666;
        padding-top: 4px;
        flex-shrink: 0;
    }
</style>