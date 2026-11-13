<script>
    import { onMount } from "svelte";
    import { CLASS_COLORS } from "../lib/classes.js";

    // Layer of the HKH Landcover service whose legend is shown (same service the map uses)
    export let layerId = 21;

    // Classes ticked in the legend, e.g. ["Forest", "Cropland"].
    // Bound from App.svelte and passed on to the map.
    export let selectedClasses = [];

    const LEGEND_URL =
        "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Landcover/MapServer/legend?f=pjson";

    // Local spellings -> the label the map service uses (must match the map's colour table)
    const LABEL_ALIASES = {
        "Built-up": "Built-up area"
    };

    const className = (label) => LABEL_ALIASES[label] ?? label;

    let legendLayers = [];
    let loading = true;
    let usingFallback = false;

    onMount(async () => {
        try {
            const response = await fetch(LEGEND_URL);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            legendLayers = data.layers || [];
        } catch (err) {
            // Most common cause: the ICIMOD server certificate is not trusted by the browser
            console.warn("Legend service unavailable, using local colours:", err);
        } finally {
            loading = false;
        }
    });

    // Legend from the ArcGIS service for the selected layer
    $: serviceItems =
        legendLayers.find((layer) => layer.layerId === Number(layerId))?.legend ?? [];

    // Local fallback built from the same colours used by the chart
    $: fallbackItems = Object.entries(CLASS_COLORS).map(([label, color]) => ({ label, color }));

    $: usingFallback = !loading && serviceItems.length === 0;
    $: items = usingFallback ? fallbackItems : serviceItems;

    function toggleClass(label, checked) {
        const name = className(label);

        selectedClasses = checked
            ? [...new Set([...selectedClasses, name])]
            : selectedClasses.filter((c) => c !== name);
    }

    function clearSelection() {
        selectedClasses = [];
    }
</script>

<div class="legend">
    <h3>Land cover</h3>

    {#if loading}
        <p class="note">Loading legend…</p>
    {:else}
        {#each items as item}
            <label class="legend-item">
                <input
                    type="checkbox"
                    checked={selectedClasses.includes(className(item.label || ""))}
                    on:change={(e) => toggleClass(item.label || "", e.currentTarget.checked)}
                />

                {#if item.imageData}
                    <img
                        src="data:{item.contentType};base64,{item.imageData}"
                        alt=""
                    />
                {:else}
                    <span class="swatch" style="background: {item.color}"></span>
                {/if}

                <span>{item.label || "Unlabelled class"}</span>
            </label>
        {/each}

        {#if selectedClasses.length > 0}
            <button type="button" class="clear" on:click={clearSelection}>
                Show all classes
            </button>
        {:else}
            <p class="note">Tick a class to show only that class on the map.</p>
        {/if}

        {#if usingFallback}
            <p class="note">Legend service unreachable, showing local colours.</p>
        {/if}
    {/if}
</div>

<style>
    .legend {
        margin-top: 12px;
    }

    h3 {
        margin: 0 0 8px;
        font-size: 14px;
        color: #234b35;
    }

    .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 6px 0;
        font-size: 13px;
        color: #333;
        cursor: pointer;
    }

    input[type="checkbox"] {
        margin: 0;
        accent-color: #1684e8;
    }

    .legend-item img {
        width: 20px;
        height: 20px;
        object-fit: contain;
    }

    .swatch {
        width: 18px;
        height: 18px;
        border: 1px solid rgba(0, 0, 0, 0.25);
        flex-shrink: 0;
    }

    .clear {
        margin-top: 6px;
        padding: 3px 10px;
        border: 1px solid #0b7d3b;
        border-radius: 14px;
        background: white;
        color: #0b7d3b;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
    }

    .clear:hover {
        background: #0b7d3b;
        color: white;
    }

    .clear:focus-visible {
        outline: 2px solid #0b6fd6;
        outline-offset: 1px;
    }

    .note {
        margin: 8px 0 0;
        font-size: 12px;
        color: #777;
    }
</style>