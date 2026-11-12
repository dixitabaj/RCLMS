<script>
    import { onMount } from "svelte";
    import { CLASS_COLORS } from "../lib/classes.js";

    // Layer of the HKH Landcover service whose legend is shown (same service the map uses)
    export let layerId = 21;

    const LEGEND_URL =
        "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Landcover/MapServer/legend?f=pjson";

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
</script>

<div class="legend">
    <h3>Land cover</h3>

    {#if loading}
        <p class="note">Loading legend…</p>
    {:else}
        {#each items as item}
            <div class="legend-item">
                {#if item.imageData}
                    <img
                        src="data:{item.contentType};base64,{item.imageData}"
                        alt=""
                    />
                {:else}
                    <span class="swatch" style="background: {item.color}"></span>
                {/if}
                <span>{item.label || "Unlabelled class"}</span>
            </div>
        {/each}

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
        margin: 5px 0;
        font-size: 13px;
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

    .note {
        margin: 8px 0 0;
        font-size: 12px;
        color: #777;
    }
</style>