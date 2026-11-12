<script>
    import { onMount, createEventDispatcher } from "svelte";

    import L from "leaflet";
    import * as esri from "esri-leaflet";

    import "leaflet/dist/leaflet.css";
    import "leaflet-draw";
    import "leaflet-draw/dist/leaflet.draw.css";

    import { years } from "../data/landcoverYears.js";

    import {
        createMap,
        changeLandcoverYear,
        loadEcoregionInfo,
        createEcoregionLayer,
        filterEcoregion,
        createBiodiversityLayer,
        filterBiodiversityHotspot,
        clearBiodiversityHighlight,
        highlightEcoregion,
        clearEcoregionHighlight
    } from "../services/mapService.js";

    // --------------------------------
    // PROPS FROM APP.SVELTE
    // --------------------------------

    export let filters = {};
    const API = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

    export let showHKH = false;
    export let showEcoregion = false;
    export let showBiodiversity = false;

    // --------------------------------
    // EVENTS TO APP.SVELTE
    // --------------------------------

    const dispatch = createEventDispatcher();

    // --------------------------------
    // MAP VARIABLES
    // --------------------------------

    let mapElement;
    let map;

    let landcoverLayer;
    let hkhBoundaryLayer;
    let ecoregionLayer;
    let biodiversityLayer;

    // Nepal provinces (clickable, shown only in "province" mode)
    let provinceLayer;
    let selectedProvinceLayer = null;
    let provinceStatus = "Loading provinces…";

    // Polygon drawing (started from the sidebar, no toolbar on the map)
    let drawnItems;
    let polygonDrawer;

    // Tighter box around the HKH. Format: [[south, west], [north, east]] in degrees.
    const HKH_BOUNDS = [
        [21, 60.5],
        [40, 105.5]
    ];

    let ecoregionInfo = null;
    let ecoregionStatus = "Loading ecoregions…";

    // --------------------------------
    // SHOW / HIDE LAYERS
    // --------------------------------

    function setVisible(mapRef, layer, visible) {
        if (!mapRef || !layer) return;

        const onMap = mapRef.hasLayer(layer);

        if (visible && !onMap) {
            layer.addTo(mapRef);
        } else if (!visible && onMap) {
            mapRef.removeLayer(layer);
        }
    }

    $: setVisible(map, hkhBoundaryLayer, showHKH);
    $: setVisible(map, ecoregionLayer, showEcoregion);
    $: setVisible(map, biodiversityLayer, showBiodiversity);

    // --------------------------------
    // SELECTED LANDCOVER YEAR
    // --------------------------------

    $: selectedLayer = years.find(
        item => item.year === Number(filters.year)
    );

    $: if (landcoverLayer && selectedLayer) {
        changeLandcoverYear(
            landcoverLayer,
            selectedLayer.layerId
        );
    }

    // --------------------------------
    // SELECTED ECOREGION
    // --------------------------------

    $: selectedEcoregion =
        filters.parameter === "ecoregion"
            ? filters.ecoregion || ""
            : "";

    // --------------------------------
    // FILTER ECOREGIONS
    // --------------------------------

    $: if (ecoregionLayer && ecoregionInfo) {
        filterEcoregion(
            ecoregionLayer,
            ecoregionInfo.nameField,
            selectedEcoregion
        );
    }

    // --------------------------------
    // HIGHLIGHT SELECTED ECOREGION
    // --------------------------------

    let lastHighlightedEcoregion = null;

    $: if (
        map &&
        ecoregionInfo &&
        selectedEcoregion !== lastHighlightedEcoregion
    ) {
        lastHighlightedEcoregion = selectedEcoregion;

        if (selectedEcoregion) {
            highlightEcoregion(
                map,
                ecoregionInfo.nameField,
                selectedEcoregion
            );
        } else {
            clearEcoregionHighlight(map);
        }
    }

    // --------------------------------
    // SELECTED BIODIVERSITY HOTSPOT
    // --------------------------------

    $: selectedHotspot =
        filters.parameter === "hotspot"
            ? filters.hotspot || ""
            : "";

    // --------------------------------
    // FILTER BIODIVERSITY HOTSPOTS
    // --------------------------------

    let lastFilteredHotspot = null;

    $: if (
        map &&
        biodiversityLayer &&
        selectedHotspot &&
        selectedHotspot !== lastFilteredHotspot
    ) {
        lastFilteredHotspot = selectedHotspot;

        filterBiodiversityHotspot(
            map,
            biodiversityLayer,
            selectedHotspot
        );
    }

    // Remove the red hotspot outline when no hotspot is selected
    $: if (map && biodiversityLayer && !selectedHotspot) {
        lastFilteredHotspot = null;
        clearBiodiversityHighlight(map);
    }

    // --------------------------------
    // ZOOM TO HKH
    // --------------------------------

    $: parameter = filters.parameter;

    $: if (map && parameter === "hkh") {
        map.invalidateSize();

        map.fitBounds(HKH_BOUNDS, {
            padding: [10, 10],
            maxZoom: 6
        });
    }

    // --------------------------------
    // POLYGON DRAWING (controlled by the sidebar "Draw polygon" option)
    // --------------------------------

    $: polygonMode = parameter === "polygon";

    $: if (map && polygonDrawer && drawnItems) {
        if (polygonMode) {
            // Start drawing as soon as "Draw polygon" is selected in the sidebar
            polygonDrawer.enable();
        } else {
            // Leaving polygon mode: stop drawing and remove the old polygon
            polygonDrawer.disable();

            if (drawnItems.getLayers().length > 0) {
                drawnItems.clearLayers();
                dispatch("polygon", null);
            }
        }
    }

    // --------------------------------
    // NEPAL PROVINCES (controlled by the sidebar "Nepal province" option)
    // --------------------------------

    $: provinceMode = parameter === "province";

    // Debug: check the browser console after selecting "Nepal province"
    $: console.log(
        "province mode:", provinceMode,
        "| layer loaded:", !!provinceLayer,
        "| on map:", !!(provinceLayer && map && map.hasLayer(provinceLayer))
    );

    // Provinces are only visible in province mode
    $: setVisible(map, provinceLayer, provinceMode);

        // Zoom to Nepal once each time "Nepal province" is selected
    let zoomedToProvinces = false;

    $: if (!provinceMode) {
        zoomedToProvinces = false;
    } else if (map && provinceLayer && !zoomedToProvinces) {
        zoomedToProvinces = true;

        map.invalidateSize();
        map.fitBounds(provinceLayer.getBounds(), {
            padding: [20, 20]
        });
    }

    // Leaving province mode: clear the highlight and tell App.svelte
    $: if (!provinceMode && selectedProvinceLayer && provinceLayer) {
        provinceLayer.resetStyle(selectedProvinceLayer);
        selectedProvinceLayer = null;
        dispatch("province", null);
    }

    // Province styles: thin dark outline, soft white glow on hover, amber when selected
    const PROVINCE_STYLE = {
        color: "#0f172a",
        weight: 1.5,
        opacity: 0.75,
        fillColor: "#ffffff",
        fillOpacity: 0.02,
        lineJoin: "round"
    };

    const PROVINCE_HOVER = {
        color: "#ffffff",
        weight: 3,
        opacity: 1,
        fillColor: "#ffffff",
        fillOpacity: 0.3
    };

    const PROVINCE_SELECTED = {
        color: "#f59e0b",
        weight: 3.5,
        opacity: 1,
        fillColor: "#fbbf24",
        fillOpacity: 0.28
    };

    async function loadNepalProvinces() {
        try {
            // Province GeoJSON comes through Django (Vite proxies /backend to it),
            // so the browser never talks to GitHub or geoBoundaries directly
            const response = await fetch(`${API}/provinces/`);

            if (!response.ok) {
                let message = "Province API failed";
                try {
                    const body = await response.json();
                    message = body.error || message;
                } catch {
                    // response was not JSON
                }
                throw new Error(message);
            }

            const geojson = await response.json();

            console.log("Province GeoJSON:", geojson);

            provinceLayer = L.geoJSON(geojson, {
                pane: "provincePane",
                interactive: true,
                style: PROVINCE_STYLE,

                onEachFeature: (feature, layer) => {
                    const name =
                        feature.properties?.shapeName ||
                        feature.properties?.name ||
                        "Unknown Province";

                    layer.bindTooltip(name, {
                        sticky: true,
                        direction: "top",
                        className: "province-tooltip"
                    });

                    // Make the shape unfocusable so no focus rectangle can appear
                    layer.on("add", () => {
                        const el = layer.getElement && layer.getElement();
                        if (el) {
                            el.setAttribute("focusable", "false");
                            el.removeAttribute("tabindex");
                            el.style.outline = "none";
                        }
                    });

                    // Hover: brighten (the selected province keeps its amber style)
                    layer.on("mouseover", () => {
                        if (layer === selectedProvinceLayer) return;
                        layer.setStyle(PROVINCE_HOVER);
                        layer.bringToFront();
                    });

                    layer.on("mouseout", () => {
                        if (layer === selectedProvinceLayer) return;
                        provinceLayer.resetStyle(layer);
                    });

                    layer.on("click", () => {
                        if (selectedProvinceLayer && selectedProvinceLayer !== layer) {
                            provinceLayer.resetStyle(selectedProvinceLayer);
                        }

                        selectedProvinceLayer = layer;

                        layer.setStyle(PROVINCE_SELECTED);
                        layer.bringToFront();

                        // Drop browser focus so no focus box is drawn
                        const el = layer.getElement && layer.getElement();
                        if (el && el.blur) el.blur();

                        // Send the selection up, like the drawn polygon
                        dispatch("province", {
                            name,
                            geometry: feature.geometry
                        });

                        console.log("Selected province:", name);
                    });
                }
            });
            // Not added to the map here: setVisible does that reactively

            provinceStatus = `${geojson.features.length} provinces loaded.`;

            console.log("Nepal provinces loaded successfully!");
        } catch (error) {
            console.error("Province loading error:", error);

            provinceStatus = "Could not load province boundaries.";
        }
    }

    // --------------------------------
    // INITIALIZE MAP
    // --------------------------------

    onMount(() => {

        const result = createMap(mapElement);

        map = result.map;
        landcoverLayer = result.landcoverLayer;

        // Own pane above the other overlays so province clicks are not swallowed
        map.createPane("provincePane");
        map.getPane("provincePane").style.zIndex = 650;

        // Load Nepal province boundaries (hidden until province mode)
        loadNepalProvinces();

        // Allow zoom levels like 4.25 so fitBounds can fit tighter
        map.options.zoomSnap = 0.25;
        map.options.zoomDelta = 0.5;

        // Slightly zoom in when the map first opens
        map.setZoom(5);

        // --------------------------------
        // RESPONSIVE MAP
        // --------------------------------

        const resizeObserver = new ResizeObserver(() => {
            map.invalidateSize();
        });

        resizeObserver.observe(mapElement);

        const onWindowResize = () => {
            map.invalidateSize();
        };

        window.addEventListener("resize", onWindowResize);

        // --------------------------------
        // HKH BOUNDARY LAYER
        // --------------------------------

        hkhBoundaryLayer = esri.dynamicMapLayer({
            url: "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Outline/MapServer",
            opacity: 0.9
        });

        // --------------------------------
        // BIODIVERSITY LAYER
        // --------------------------------

        biodiversityLayer = createBiodiversityLayer(map);

        // --------------------------------
        // POLYGON DRAWING (no toolbar: started from the sidebar)
        // --------------------------------

        drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);

        polygonDrawer = new L.Draw.Polygon(map, {
            allowIntersection: false,
            showArea: false,
            shapeOptions: {
                color: "#0b7d3b",
                weight: 3
            }
        });

        map.on(L.Draw.Event.CREATED, (event) => {
            drawnItems.clearLayers();

            const polygon = event.layer;

            drawnItems.addLayer(polygon);

            const geojson = polygon.toGeoJSON();

            console.log("Selected polygon:", geojson);

            // Send the geometry up to App.svelte
            dispatch("polygon", geojson.geometry);

            // Stay in drawing mode so the next click starts a new polygon
            if (polygonMode) {
                polygonDrawer.enable();
            }
        });

        // --------------------------------
        // INITIAL LANDCOVER YEAR
        // --------------------------------

        if (selectedLayer) {
            changeLandcoverYear(
                landcoverLayer,
                selectedLayer.layerId
            );
        }

        // --------------------------------
        // LOAD ECOREGION LAYER
        // --------------------------------

        loadEcoregionInfo()
            .then(info => {
                console.log("Ecoregion layer info:", info);

                ecoregionInfo = info;

                ecoregionLayer = createEcoregionLayer(map, info);

                if (!info.nameField) {
                    ecoregionStatus =
                        "Layer loaded, but no name field was found.";
                } else if (info.names.length === 0) {
                    ecoregionStatus =
                        `Name field "${info.nameField}" has no populated values.`;
                } else {
                    ecoregionStatus =
                        `${info.names.length} ecoregions available.`;
                }
            })
            .catch(error => {
                console.error("Ecoregion loading error:", error);

                ecoregionStatus = "Could not load the ecoregion layer.";
            });

        // --------------------------------
        // CLEANUP
        // --------------------------------

        return () => {
            resizeObserver.disconnect();

            window.removeEventListener("resize", onWindowResize);

            polygonDrawer.disable();

            map.remove();
        };
    });
</script>

<div
    class="map-container"
    bind:this={mapElement}
></div>

<style>
    /* Remove the rectangular focus box browsers draw around a clicked map shape */
    :global(.leaflet-container *:focus),
    :global(.leaflet-container *:focus-visible),
    :global(.leaflet-container path.leaflet-interactive),
    :global(.leaflet-container svg) {
        outline: none !important;
        -webkit-tap-highlight-color: transparent;
    }

    :global(.province-tooltip) {
        background: rgba(15, 23, 42, 0.9);
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    :global(.province-tooltip::before) {
        display: none;
    }

    .map-container {
        flex: 1;
        width: 100%;
        min-width: 0;
        min-height: 0;
        border-radius: 6px;
        overflow: hidden;
    }
</style>