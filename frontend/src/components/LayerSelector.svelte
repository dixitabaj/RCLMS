<script>
    export let showHKH = false;
    export let showEcoregion = false;
    export let showBiodiversity = false;
    export let showForestOnly = false;
</script>

<!-- The "Layers" heading and panel box come from App.svelte -->
<div class="layer-selector">

    <label>
        <input
            type="checkbox"
            bind:checked={showHKH}
        />
        HKH boundary
    </label>

    <label>
        <input
            type="checkbox"
            bind:checked={showEcoregion}
        />
        Ecoregion
    </label>

    <label>
        <input
            type="checkbox"
            bind:checked={showBiodiversity}
        />
        Biodiversity hotspot
    </label>
   

</div>

<style>
    .layer-selector {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .layer-selector label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: #333;
        cursor: pointer;
    }

    input[type="checkbox"] {
        margin: 0;
        accent-color: #1684e8;
    }
</style>