<script>
  import {
    filters, catalog, selectRegion, selectRegionType, setFilter, rememberedRegion,
  } from '../stores/dashboard.js';

  $: types = $catalog.data?.region_types ?? [];
  $: years = $catalog.data?.years ?? [];
  $: classes = $catalog.data?.classes ?? [];
  const regionsFor = (list, code) => list.find((t) => t.region_type === code)?.regions ?? [];
  $: ecoregions = regionsFor(types, 'ecoregion');
  $: hotspots = regionsFor(types, 'hotspot');

  // The select of the inactive type shows the region you last used there.
  $: ecoValue = $filters.regionType === 'ecoregion' ? $filters.region : rememberedRegion('ecoregion');
  $: hotValue = $filters.regionType === 'hotspot' ? $filters.region : rememberedRegion('hotspot');
</script>

{#if $catalog.error}
  <p class="error" role="alert">{$catalog.error}</p>
{:else}
  <div class="group">
    <label class="radio">
      <input type="radio" name="rtype" checked={$filters.regionType === 'hkh'}
             on:change={() => selectRegionType('hkh')} />
      Hindu Kush Himalaya region
    </label>

    <label class="radio">
      <input type="radio" name="rtype" checked={$filters.regionType === 'ecoregion'}
             on:change={() => selectRegionType('ecoregion')} />
      Ecoregion
    </label>
    <select aria-label="Ecoregion" value={ecoValue}
            on:change={(e) => selectRegion('ecoregion', e.target.value)}>
      {#each ecoregions as r}<option value={r}>{r}</option>{/each}
    </select>

    <label class="radio">
      <input type="radio" name="rtype" checked={$filters.regionType === 'hotspot'}
             on:change={() => selectRegionType('hotspot')} />
      Biodiversity hotspot
    </label>
    <select aria-label="Biodiversity hotspot" value={hotValue}
            on:change={(e) => selectRegion('hotspot', e.target.value)}>
      {#each hotspots as r}<option value={r}>{r}</option>{/each}
    </select>

    <label class="radio disabled" title="Custom polygons are not stored in the database">
      <input type="radio" name="rtype" disabled /> Draw polygon
    </label>
  </div>

  <label class="field">
    Year
    <select value={$filters.year} on:change={(e) => setFilter('year', Number(e.target.value))}>
      {#each [...years].reverse() as y}<option value={y}>{y}</option>{/each}
    </select>
  </label>

  <label class="field">
    Land-cover class
    <select value={$filters.className} on:change={(e) => setFilter('className', e.target.value)}>
      {#each classes as c}<option value={c}>{c}</option>{/each}
    </select>
  </label>

  <label class="check">
    <input type="checkbox" checked={$filters.showTrend}
           on:change={(e) => setFilter('showTrend', e.target.checked)} />
    Show trend
  </label>
{/if}

<style>
  .group { display: flex; flex-direction: column; gap: 8px; }
  .radio, .check { display: flex; align-items: center; gap: 8px; font-size: 1.02rem; cursor: pointer; }
  .disabled { color: #8b968f; cursor: not-allowed; }
  select {
    width: 100%; padding: 7px 8px; font: inherit; font-size: .95rem;
    border: 1px solid #c9d3cd; border-radius: 4px; background: #fff;
  }
  .field { display: flex; flex-direction: column; gap: 4px; margin-top: 14px; font-size: 1.02rem; }
  .check { margin-top: 14px; padding: 10px; border: 1px solid #c9d3cd; border-radius: 4px; }
  .error { color: #8a1c1c; background: #fdeaea; padding: 10px; border-radius: 6px; }
</style>
