<script>
    import { createEventDispatcher } from "svelte";
    import { years } from "../data/landcoverYears.js";

    const dispatch = createEventDispatcher();

    // Real ecoregion names from the ArcGIS layer (passed in by App.svelte)
    export let ecoregionNames = [];

    // Selected geographic filter
    let selectedParameter = "hkh";

    let selectedEcoregion = ""; // "" = all ecoregions
    let selectedHotspot = "Himalaya";

    // Land-cover settings
    let selectedYear = "2022";
    let showTrend = true;
    let selectedLandcover = "Forest";

    // Biodiversity hotspots
    const hotspots = [
        "Himalaya",
        "Indo-Burma",
        "Mountains of Central Asia",
        "Mountains of Southwest China"
    ];

    // Land-cover classes
    const landcoverClasses = [
        "Forest",
        "Grassland",
        "Cropland",
        "Bare soil",
        "Bare rock",
        "Built-up",
        "Snow and glacier",
        "Water body",
        "Riverbed"
    ];

    function updateFilters() {
        dispatch("filtersChange", {
            parameter: selectedParameter,
            ecoregion: selectedEcoregion,
            hotspot: selectedHotspot,
            year: selectedYear,
            showTrend,
            landcover: selectedLandcover
        });
    }
</script>

<aside class="sidebar">

    <div class="sidebar-content">

        <!-- Hindu Kush Himalaya region -->
        <div class="radio-group">
            <label>
                <input
                    type="radio"
                    name="parameter"
                    value="hkh"
                    bind:group={selectedParameter}
                    on:change={updateFilters}
                />
                Hindu Kush Himalaya region
            </label>
        </div>

        <!-- Ecoregion -->
        <div class="radio-group">
            <label>
                <input
                    type="radio"
                    name="parameter"
                    value="ecoregion"
                    bind:group={selectedParameter}
                    on:change={updateFilters}
                />
                Ecoregion
            </label>

            <select
                bind:value={selectedEcoregion}
                on:change={updateFilters}
                disabled={selectedParameter !== "ecoregion"}
            >
                <option value="">All ecoregions</option>
                {#each ecoregionNames as ecoregion}
                    <option value={ecoregion}>
                        {ecoregion}
                    </option>
                {/each}
            </select>
        </div>

        <!-- Biodiversity hotspot -->
        <div class="radio-group">
            <label>
                <input
                    type="radio"
                    name="parameter"
                    value="hotspot"
                    bind:group={selectedParameter}
                    on:change={updateFilters}
                />
                Biodiversity hotspot
            </label>

            <select
                bind:value={selectedHotspot}
                on:change={updateFilters}
                disabled={selectedParameter !== "hotspot"}
            >
                {#each hotspots as hotspot}
                    <option value={hotspot}>
                        {hotspot}
                    </option>
                {/each}
            </select>
        </div>

        <!-- Draw polygon -->
        <div class="radio-group">
            <label>
                <input
                    type="radio"
                    name="parameter"
                    value="polygon"
                    bind:group={selectedParameter}
                    on:change={updateFilters}
                />
                Draw polygon
            </label>
        </div>

        <!-- Nepal province -->
        <div class="radio-group">
            <label>
                <input
                    type="radio"
                    name="parameter"
                    value="province"
                    bind:group={selectedParameter}
                    on:change={updateFilters}
                />
                Nepal province
            </label>

            {#if selectedParameter === "province"}
                <p class="hint">Click a province on the map to select it.</p>
            {/if}
        </div>

        <!-- Year -->
        <div class="year-group">
            <label for="year">Year</label>

            <select
                id="year"
                bind:value={selectedYear}
                on:change={updateFilters}
            >
                {#each years as item}
                    <option value={String(item.year)}>
                        {item.year}
                    </option>
                {/each}
            </select>
        </div>

        <!-- Land-cover trend -->
        <div class="trend-group">

            <label class="trend-checkbox">
                <input
                    type="checkbox"
                    bind:checked={showTrend}
                    on:change={updateFilters}
                />
                Show trend
            </label>

            <select
                bind:value={selectedLandcover}
                on:change={updateFilters}
            >
                {#each landcoverClasses as landcover}
                    <option value={landcover}>
                        {landcover}
                    </option>
                {/each}
            </select>

        </div>

    </div>

</aside>

<style>
    .sidebar {
        width: 100%;
        min-height: 610px;
        background: #f0f0f0;
        border-radius: 9px;
        overflow: hidden;
        font-family: Arial, sans-serif;
        box-sizing: border-box;
    }

    .sidebar-heading {
        background: #008443;
        color: white;
        padding: 11px 15px;
        font-size: 16px;
        font-weight: 600;
    }

    .sidebar-content {
        padding: 10px 14px;
    }

    .radio-group {
        margin-bottom: 8px;
    }

    .radio-group label {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        color: #333;
        cursor: pointer;
    }

    input[type="radio"] {
        margin: 0;
        accent-color: #1684e8;
    }

    select {
        width: 100%;
        height: 27px;
        margin-top: 5px;
        padding: 3px 8px;
        border: 1px solid #cbd2d8;
        border-radius: 4px;
        background: white;
        color: #444;
        font-size: 13px;
    }

    .hint {
        margin: 4px 0 0 20px;
        font-size: 12px;
        color: #666;
    }

    .year-group {
        margin-top: 12px;
        margin-bottom: 7px;
    }

    .year-group label {
        display: block;
        margin-bottom: 3px;
        font-size: 13px;
    }

    .trend-group {
        padding: 7px;
        border: 1px solid #ccc;
        background: #f0f0f0;
    }

    .trend-checkbox {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 7px;
        font-size: 13px;
        cursor: pointer;
    }

    input[type="checkbox"] {
        margin: 0;
        accent-color: #1684e8;
    }

    .trend-group select {
        margin-top: 0;
    }
</style>