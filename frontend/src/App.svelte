<script>
    import { onMount } from "svelte";

    import Header from "./components/Header.svelte";
    import Map from "./components/Map.svelte";
    import Sidebar from "./components/Sidebar.svelte";
    import LayerSelector from "./components/LayerSelector.svelte";
    import LandcoverChart from "./components/LandcoverChart.svelte";
    import Legend from "./components/Legend.svelte";
    // NEW: dashboard pieces that read from the database store
    import TrendChart from "./components/TrendChart.svelte";
    import SummaryCards from "./components/SummaryCards.svelte";
    import DataTable from "./components/DataTable.svelte";
    import ChangeChart from "./components/ChangeChart.svelte";

    import { loadEcoregionInfo } from "./services/mapService.js";
    import { fetchAreaByClass } from "./services/analysisService.js";
    import { years } from "./data/landcoverYears.js";
    // NEW: database store (the store's own `filters` is not imported on purpose,
    // so it can't clash with the local `filters` below)
    import { initDashboard, applyFilters, catalog, summary } from "./stores/dashboard.js";

    let filters = {
        parameter: "hkh",
        ecoregion: "",
        hotspot: "Himalaya",
        year: "2022",
        showTrend: true,
        landcover: "Forest"
    };

    // Boundary visibility states
    let showHKH = false;
    let showEcoregion = false;
    let showBiodiversity = false;

    // Real ecoregion names read from the ArcGIS layer
    let ecoregionNames = [];

    // ---------- Polygon analysis (unchanged, still uses analysisService) ----------
    let selectedGeometry = null;
    let polyAreaHa = null;
    let polyLoading = false;
    let polyError = null;
    let latestRequestId = 0;

    function handleFiltersChange(event) {
        filters = { ...event.detail };
    }

    function handlePolygon(event) {
        selectedGeometry = event.detail;
    }

    async function runAnalysis(geometry, year) {
        const requestId = ++latestRequestId;
        polyLoading = true;
        polyError = null;

        try {
            const result = await fetchAreaByClass(geometry, year);
            if (requestId !== latestRequestId) return;
            polyAreaHa = result.area_ha;
        } catch (error) {
            if (requestId !== latestRequestId) return;
            console.error(error);
            polyError = error.message;
            polyAreaHa = null;
        } finally {
            if (requestId === latestRequestId) polyLoading = false;
        }
    }

    // Polygon mode = the "Draw polygon" option is selected in the sidebar
    $: polygonMode = filters.parameter === "polygon";

    $: if (polygonMode && selectedGeometry && filters.year) {
        runAnalysis(selectedGeometry, filters.year);
    }

    // ---------- Database mode (HKH / ecoregion / hotspot) ----------
    // Turn the sidebar choice into a (region_type, region) pair that exists in PostgreSQL
    function resolveTarget(f) {
        switch (f.parameter) {
            case "hkh":
                return { regionType: "hkh", region: "Hindu Kush Himalaya" };
            case "ecoregion":
                return f.ecoregion ? { regionType: "ecoregion", region: f.ecoregion } : null;
            case "hotspot":
                return f.hotspot ? { regionType: "hotspot", region: f.hotspot } : null;
            default:
                return null;
        }
    }

    // The database calls this class "Built-up"; the chart component calls it "Built-up area"
    const CHART_NAME = { "Built-up": "Built-up area" };

    let regionMissing = false;
    $: dbTarget = resolveTarget(filters);

    // Push the sidebar choices into the store -> it fetches summary, trend and records
    $: if ($catalog.data && dbTarget) {
        regionMissing = !applyFilters({
            ...dbTarget,
            year: Number(filters.year),
            className: filters.landcover
        });
    }

    $: dbClasses = $summary.data?.classes ?? [];
    $: dbAreaHa = dbTarget && !regionMissing && dbClasses.length
        ? Object.fromEntries(dbClasses.map((c) => [CHART_NAME[c.class_name] ?? c.class_name, c.area_ha]))
        : null;
    $: dbFilled = dbClasses.filter((c) => c.filled_missing).map((c) => CHART_NAME[c.class_name] ?? c.class_name);
    $: dbHint = !dbTarget
        ? "Choose a region on the left to see its land cover"
        : regionMissing
            ? `"${dbTarget.region}" is not in the database`
            : `No database records for ${dbTarget.region} in ${filters.year}`;

    // ---------- What the chart receives ----------
    $: chartAreaHa = polygonMode ? polyAreaHa : dbAreaHa;
    $: chartLoading = polygonMode ? polyLoading : $catalog.loading || $summary.loading;
    $: chartError = polygonMode ? polyError : $catalog.error || $summary.error;
    $: chartFilled = polygonMode ? [] : dbFilled;
    $: chartHint = polygonMode ? "Draw a polygon on the map to see its land cover" : dbHint;

    // Name of the selected area (used in the chart title)
    $: selectedArea = (() => {
        if (polygonMode) return selectedGeometry ? "the drawn polygon" : "custom polygon";

        switch (filters.parameter) {
            case "hkh":
                return "Hindu Kush Himalaya region";
            case "ecoregion":
                return filters.ecoregion || "all ecoregions";
            case "hotspot":
                return filters.hotspot;
            default:
                return "Nepal";
        }
    })();

    $: chartTitle = `Land cover of ${selectedArea} in ${filters.year || "2022"}`;

    // Layer id used for the legend (falls back to 21 if landcoverYears.js has no layerId field)
    $: legendLayerId =
        years.find((y) => String(y.year) === String(filters.year))?.layerId ?? 21;

    // Fallback: if ArcGIS can't be reached, fill the ecoregion list from the database
    $: if (ecoregionNames.length === 0 && $catalog.data) {
        ecoregionNames =
            $catalog.data.region_types.find((t) => t.region_type === "ecoregion")?.regions ?? [];
    }

    // Chart card tabs
    let tab = "chart";
    $: if (polygonMode) tab = "chart";

    // "chart" = bar + line, "trend" = line chart only, "change" = gain/loss chart, "table" = table and export
    $: showBar = polygonMode || tab === "chart";
    $: showLine = !polygonMode && (tab === "trend" || (tab === "chart" && filters.showTrend));

    // ---------- Resizable middle section ----------
    // mapFraction: share of the height used by the map row (the charts get the rest)
    // chartSplit: share of the chart card's width used by the bar chart (the line chart gets the rest)
    const DEFAULT_MAP = 0.625;
    const DEFAULT_SPLIT = 0.5;

    function loadSize(key, fallback) {
        try {
            const v = Number(localStorage.getItem(key));
            return v > 0 && v < 1 ? v : fallback;
        } catch {
            return fallback;
        }
    }

    function saveSize(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch {
            /* storage not available: sizes just won't be remembered */
        }
    }

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    let mapFraction = loadSize("rlcms.mapFraction", DEFAULT_MAP);
    let chartSplit = loadSize("rlcms.chartSplit", DEFAULT_SPLIT);
    let centerEl;
    let chartsEl;
    let dragging = false;

    // Generic pointer drag: keeps receiving events even when the pointer is over the map
    function startDrag(event, onMove, onEnd) {
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        dragging = true;

        const move = (e) => onMove(e);
        const stop = () => {
            dragging = false;
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", stop);
            handle.removeEventListener("pointercancel", stop);
            onEnd();
        };

        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", stop);
        handle.addEventListener("pointercancel", stop);
    }

    function startRowDrag(event) {
        startDrag(
            event,
            (e) => {
                // The map / chart split only lives in the middle column
                const r = centerEl.getBoundingClientRect();
                mapFraction = clamp((e.clientY - r.top - 6) / (r.height - 12), 0.15, 0.85);
            },
            () => saveSize("rlcms.mapFraction", mapFraction)
        );
    }

    function startColDrag(event) {
        startDrag(
            event,
            (e) => {
                const r = chartsEl.getBoundingClientRect();
                chartSplit = clamp((e.clientX - r.left) / r.width, 0.15, 0.85);
            },
            () => saveSize("rlcms.chartSplit", chartSplit)
        );
    }

    // Keyboard: arrow keys move the divider, Home resets it
    function rowKey(e) {
        if (e.key === "ArrowUp") mapFraction = clamp(mapFraction - 0.03, 0.15, 0.85);
        else if (e.key === "ArrowDown") mapFraction = clamp(mapFraction + 0.03, 0.15, 0.85);
        else if (e.key === "Home") mapFraction = DEFAULT_MAP;
        else return;
        e.preventDefault();
        saveSize("rlcms.mapFraction", mapFraction);
    }

    function colKey(e) {
        if (e.key === "ArrowLeft") chartSplit = clamp(chartSplit - 0.03, 0.15, 0.85);
        else if (e.key === "ArrowRight") chartSplit = clamp(chartSplit + 0.03, 0.15, 0.85);
        else if (e.key === "Home") chartSplit = DEFAULT_SPLIT;
        else return;
        e.preventDefault();
        saveSize("rlcms.chartSplit", chartSplit);
    }

    function resetAll() {
        mapFraction = DEFAULT_MAP;
        chartSplit = DEFAULT_SPLIT;
        try {
            ["mapFraction", "chartSplit"].forEach((k) =>
                localStorage.removeItem("rlcms." + k)
            );
        } catch {
            /* ignore */
        }
    }

    function resetRow() {
        mapFraction = DEFAULT_MAP;
        saveSize("rlcms.mapFraction", mapFraction);
    }

    function resetCol() {
        chartSplit = DEFAULT_SPLIT;
        saveSize("rlcms.chartSplit", chartSplit);
    }

    onMount(async () => {
        initDashboard(); // NEW: load region list + data from the Django API

        try {
            const info = await loadEcoregionInfo();
            ecoregionNames = info.names;

            if (filters.ecoregion && !ecoregionNames.includes(filters.ecoregion)) {
                filters = { ...filters, ecoregion: "" };
            }
        } catch (error) {
            console.error("Could not load ecoregion names:", error);
        }
    });
</script>

<div class="app" class:dragging>

    <div class="header-slot">
        <Header />
    </div>

    <div class="layout">

        <!-- LEFT COLUMN (fixed height split, does not follow the map resize) -->
        <div class="col side">
        <!-- LEFT TOP: parameters -->
        <section class="panel params">
            <h2>Parameters</h2>
            <div class="panel-body">
                <Sidebar
                    {ecoregionNames}
                    on:filtersChange={handleFiltersChange}
                />
            </div>
        </section>

        <!-- LEFT BOTTOM: useful links -->
        <section class="panel links">
            <h2>Useful links</h2>
            <div class="panel-body">
                <p class="link-group"><strong>Data</strong></p>
                <p>
                    <a href="https://doi.org/10.26066/RDS.1972511" target="_blank" rel="noreferrer">
                        Land cover of HKH region
                    </a>
                </p>

                <p class="link-group"><strong>Application guide</strong></p>
                <p>
                    <!-- TODO: put the real user-guide URL here -->
                    <a href="#">RLCMS user guide</a>
                </p>
            </div>
        </section>
        </div>

        <!-- MIDDLE COLUMN (map + charts: the only part that resizes) -->
        <div class="col center" bind:this={centerEl}
             style="--map-row: {mapFraction * 100}fr; --chart-row: {(1 - mapFraction) * 100}fr;">
        <!-- CENTER TOP: map -->
        <div class="card map-card">
            <!-- Clips the map to its card and keeps Leaflet's high z-index layers inside it -->
            <div class="map-clip">
                <Map
                    {filters}
                    {showHKH}
                    {showEcoregion}
                    {showBiodiversity}
                    on:polygon={handlePolygon}
                />
            </div>
        </div>

        <!-- CENTER BOTTOM: chart / trend / table -->
        <div class="card chart-card">
            <!-- Drag up/down to resize the map and the charts. Double-click resets. -->
            <div
                class="row-handle"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize map and charts"
                aria-valuemin="15"
                aria-valuemax="85"
                aria-valuenow={Math.round(mapFraction * 100)}
                tabindex="0"
                on:pointerdown={startRowDrag}
                on:keydown={rowKey}
                on:dblclick={resetRow}
            ></div>

            {#if !polygonMode}
                <div class="tabs" role="tablist">
                    <button role="tab" aria-selected={tab === "chart"}
                            class:active={tab === "chart"} on:click={() => (tab = "chart")}>
                        Chart
                    </button>
                    <button role="tab" aria-selected={tab === "trend"}
                            class:active={tab === "trend"} on:click={() => (tab = "trend")}>
                        Line chart only
                    </button>
                    <button role="tab" aria-selected={tab === "change"}
                            class:active={tab === "change"} on:click={() => (tab = "change")}>
                        Change
                    </button>
                    <button role="tab" aria-selected={tab === "table"}
                            class:active={tab === "table"} on:click={() => (tab = "table")}>
                        Table and export
                    </button>
                    <button class="reset-layout" on:click={resetAll} title="Restore the default panel sizes">
                        Reset layout
                    </button>
                </div>
            {/if}

            {#if polygonMode || tab === "chart" || tab === "trend"}
                <div
                    class="charts"
                    bind:this={chartsEl}
                    style="--bar-grow: {chartSplit * 100}; --trend-grow: {(1 - chartSplit) * 100};"
                >
                    {#if showBar}
                        <div class="bar-slot" class:alone={!showLine}>
                            <LandcoverChart
                                title={chartTitle}
                                areaHa={chartAreaHa}
                                year={filters.year}
                                loading={chartLoading}
                                error={chartError}
                                hint={chartHint}
                                filled={chartFilled}
                            />
                        </div>
                    {/if}

                    {#if showBar && showLine}
                        <!-- Drag left/right to resize the bar chart and the line chart -->
                        <div
                            class="col-handle"
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize bar chart and line chart"
                            aria-valuemin="15"
                            aria-valuemax="85"
                            aria-valuenow={Math.round(chartSplit * 100)}
                            tabindex="0"
                            on:pointerdown={startColDrag}
                            on:keydown={colKey}
                            on:dblclick={resetCol}
                        ></div>
                    {/if}

                    {#if showLine}
                        <div class="trend" class:alone={!showBar}><TrendChart /></div>
                    {/if}
                </div>
            {:else if tab === "change"}
                <div class="change-slot"><ChangeChart /></div>
            {:else}
                <div class="data">
                    <SummaryCards />
                    <DataTable />
                </div>
            {/if}
        </div>
        </div>

        <!-- RIGHT COLUMN (fixed height split, does not follow the map resize) -->
        <div class="col side">
        <!-- RIGHT TOP: layers -->
        <section class="panel layers">
            <h2>Layers</h2>
            <div class="panel-body">
                <LayerSelector
                    bind:showHKH
                    bind:showEcoregion
                    bind:showBiodiversity
                />
                <Legend layerId={legendLayerId} />
            </div>
        </section>

        <!-- RIGHT BOTTOM: about -->
        <section class="panel about">
            <h2>About</h2>
            <div class="panel-body">
                <p>
                    The web-based application provides easy access to the
                    harmonized land cover database for the entire HKH region.
                </p>
                <p>
                    <a
                        href="https://servir.icimod.org/science-applications/regional-land-cover-monitoring-system-for-the-hindu-kush-himalaya/"
                        target="_blank"
                        rel="noreferrer"
                    >
                        View more…
                    </a>
                </p>
            </div>
        </section>
        </div>

    </div>
</div>

<style>
    :global(*),
    :global(*::before),
    :global(*::after) {
        box-sizing: border-box;
    }

    :global(html),
    :global(body) {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
    }

    :global(body) {
        display: block;
        place-items: unset;
        background: #f8faf8;
    }

    :global(#app) {
        width: 100%;
        height: 100%;
        max-width: none;
        margin: 0;
        padding: 0;
        text-align: left;
    }

    .app {
        display: flex;
        flex-direction: column;
        height: 100dvh;
        min-height: 560px;
        background: #f9fcfa;
        font-family: Lato, "Segoe UI", Arial, sans-serif;
        color: #222;
    }

    .header-slot {
        flex-shrink: 0;
        position: relative;
        z-index: 1000;
    }

    .layout {
        flex: 1;
        min-height: 0;
        display: grid;
        gap: 12px;
        padding: 12px;
        grid-template-columns:
    clamp(230px, 19vw, 290px)
    minmax(0, 1fr)
    clamp(230px, 19vw, 290px);
        grid-template-rows: minmax(0, 1fr);
    }

    /* Each column has its own rows, so resizing the map never touches the side panels */
    .col {
        display: grid;
        gap: 12px;
        min-height: 0;
        min-width: 0;
    }

    .col.side {
        grid-template-rows: minmax(0, 62.5fr) minmax(0, 37.5fr);
    }

    .col.center {
        grid-template-rows: minmax(0, var(--map-row, 62.5fr)) minmax(0, var(--chart-row, 37.5fr));
    }

    .panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        background: #f2f2f2;
        border-radius: 8px;
        overflow: hidden;
    }

    .panel h2 {
        margin: 0;
        padding: 10px 14px;
        background: #0b7d3b;
        color: white;
        font-size: clamp(15px, 1.3vw, 18px);
        font-weight: 700;
    }

    .panel-body {
        flex: 1;
        min-height: 0;
        padding: 12px 14px;
        overflow: auto;
        font-size: 14px;
    }

    .panel-body p { margin: 0 0 8px; }
    .panel-body a { color: #0b6fd6; text-decoration: none; }
    .panel-body a:hover { text-decoration: underline; }
    .link-group { margin-top: 4px; }

    .card {
        display: flex;
        min-height: 0;
        min-width: 0;
        border-radius: 8px;
        padding: 8px;
    }

    .map-card { position: relative; background: #f2f2f2; }

    .map-clip {
        flex: 1;
        display: flex;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        isolation: isolate;
        border-radius: 6px;
    }

    /* Column layout so tabs sit above the chart / table */
    .chart-card {
        position: relative;
        background: white;
        padding: 8px 12px;
        flex-direction: column;
        gap: 6px;
    }

    /* ---- resize handles (middle section only) ---- */
    .row-handle,
    .col-handle {
        touch-action: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .row-handle {
        position: absolute;
        left: 0;
        right: 0;
        top: -18px;
        height: 22px;
        cursor: row-resize;
        z-index: 5;
    }

    .row-handle::before {
        content: "";
        width: 80px;
        height: 6px;
        border-radius: 3px;
        background: #9db8a8;
    }

    .col-handle {
        flex: 0 0 18px;
        cursor: col-resize;
    }

    .col-handle::before {
        content: "";
        width: 6px;
        height: 80px;
        border-radius: 3px;
        background: #9db8a8;
    }

    .reset-layout {
        margin-left: auto;
        font-size: 12px;
        color: #555;
        border-color: #bbb;
    }

    .row-handle:hover::before,
    .col-handle:hover::before,
    .row-handle:focus-visible::before,
    .col-handle:focus-visible::before,
    .dragging .row-handle::before,
    .dragging .col-handle::before {
        background: #0b7d3b;
    }

    .row-handle:focus-visible,
    .col-handle:focus-visible {
        outline: 2px solid #0b6fd6;
    }

    /* no text selection and a steady cursor while dragging */
    .app.dragging {
        user-select: none;
        -webkit-user-select: none;
    }

    .tabs { display: flex; gap: 6px; flex-shrink: 0; }

    .tabs button {
        font: inherit;
        font-size: 13px;
        padding: 3px 12px;
        border: 1px solid #0b7d3b;
        background: white;
        color: #0b7d3b;
        border-radius: 14px;
        cursor: pointer;
    }

    .tabs button.active { background: #0b7d3b; color: white; }
    .tabs button:focus-visible { outline: 2px solid #0b6fd6; outline-offset: 2px; }

    .charts { flex: 1; min-height: 0; display: flex; gap: 0; overflow: hidden; }
    .bar-slot { flex: var(--bar-grow, 50) 1 0; min-width: 0; min-height: 0; display: flex; }
    .bar-slot.alone { flex: 1 1 0; }
    .trend { flex: var(--trend-grow, 50) 1 0; min-width: 0; min-height: 0; overflow: hidden; }
    .trend.alone { flex: 1 1 0; }
    .change-slot { flex: 1; min-height: 0; min-width: 0; display: flex; overflow: hidden; }
    .data { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; }

    
/* Medium laptops */
@media (max-width: 1200px) and (min-width: 901px) {
    .layout {
        gap: 8px;
        padding: 8px;
        grid-template-columns:
            clamp(165px, 17vw, 205px)
            minmax(0, 1fr)
            clamp(165px, 17vw, 205px);
    }

    .col {
        gap: 8px;
    }

    .panel h2 {
        padding: 9px 11px;
        font-size: 15px;
    }

    .panel-body {
        padding: 10px;
        font-size: 13px;
    }
}

/* Tablets and smaller screens */
@media (max-width: 900px) {
    .app {
        height: auto;
        min-height: 100dvh;
    }

    .layout {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: none;
        grid-template-areas:
            "params"
            "map"
            "chart"
            "layers"
            "links"
            "about";
        gap: 10px;
        padding: 10px;
    }

    .col {
        display: contents;
    }

    .params {
        grid-area: params;
    }

    .map-card {
        grid-area: map;
        min-height: 55vh;
    }

    .chart-card {
        grid-area: chart;
        min-height: 400px;
    }

    .layers {
        grid-area: layers;
    }

    .links {
        grid-area: links;
    }

    .about {
        grid-area: about;
    }

    .panel {
        min-height: 120px;
    }

    .panel-body {
        max-height: 260px;
        overflow-y: auto;
    }

    .charts {
        flex-direction: column;
        gap: 12px;
    }

    .bar-slot,
    .trend {
        flex: 1 1 auto;
        min-height: 250px;
    }

    .row-handle,
    .col-handle {
        display: none;
    }
}

/* Mobile phones */
@media (max-width: 600px) {
    .layout {
        gap: 8px;
        padding: 7px;
    }

    .map-card {
        min-height: 52vh;
        padding: 5px;
    }

    .chart-card {
        min-height: 420px;
        padding: 8px;
    }

    .panel h2 {
        padding: 10px;
        font-size: 15px;
    }

    .panel-body {
        padding: 10px;
        font-size: 13px;
        max-height: 220px;
    }

    .tabs {
        flex-wrap: wrap;
        gap: 5px;
    }

    .tabs button {
        font-size: 11px;
        padding: 5px 9px;
    }

    .reset-layout {
        margin-left: 0;
    }

    .charts {
        overflow-y: auto;
    }

    .bar-slot,
    .trend {
        min-height: 260px;
    }
}

</style>