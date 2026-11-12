import L from "leaflet";
import * as esri from "esri-leaflet";

const MAP_SERVER_URL =
    "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Landcover/MapServer";

const ECOREGION_URL =
    "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Environment/MapServer/2";

const BIODIVERSITY_URL =
    "https://services6.arcgis.com/NonisTlG4TcVAsSk/ArcGIS/rest/services/Biodiversity_Hotspots/FeatureServer/0";

/* ------------------------------------------------------------------ */
/* Land cover                                                          */
/* ------------------------------------------------------------------ */

export function createMap(element) {
    const map = L.map(element).setView([28.3, 84.0], 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const landcoverLayer = esri.dynamicMapLayer({
        url: MAP_SERVER_URL,
        layers: [21],
        opacity: 0.8,
        useCors: true
    });

    landcoverLayer.addTo(map);

    return { map, landcoverLayer };
}

export function changeLandcoverYear(landcoverLayer, layerId) {
    landcoverLayer.setLayers([layerId]);
}

export function toggleLandcover(map, landcoverLayer, visible) {
    if (visible) {
        if (!map.hasLayer(landcoverLayer)) {
            landcoverLayer.addTo(map);
        }
    } else {
        map.removeLayer(landcoverLayer);
    }
}

/* ------------------------------------------------------------------ */
/* Biodiversity                                                        */
/* ------------------------------------------------------------------ */

/* NEW: only these four hotspots are used by the dashboard */
const ALLOWED_HOTSPOTS = new Set([
    "himalaya",
    "indo-burma",
    "mountains of central asia",
    "mountains of southwest china"
]);

function hotspotName(feature) {
    const p = feature?.properties || {};
    return String(p.name || p.NAME || "").trim().toLowerCase();
}

/**
 * Overlay layer with the four dashboard hotspot polygons (toggled by the layer selector).
 * It also acts as the in-memory data store used by the selection function.
 */
export function createBiodiversityLayer(map) {
    const layer = L.geoJSON(null, {
        // CHANGED: keep only the four hotspots, drop the rest of the world
        filter: feature => ALLOWED_HOTSPOTS.has(hotspotName(feature)),

        // CHANGED: outline only (fill is invisible but still clickable for the popup)
        style: {
            color: "#d97706",
            weight: 2,
            opacity: 1,
            fillColor: "#f59e0b",
            fillOpacity: 0
        },

        onEachFeature: (feature, featureLayer) => {
            const name =
                feature.properties?.name ||
                feature.properties?.NAME ||
                "Biodiversity hotspot";

            featureLayer.bindPopup(name);
        }
    });

    layer._biodiversityLoaded = fetch(
        `${BIODIVERSITY_URL}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson`
    )
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data.features || data.features.length === 0) {
                throw new Error("No biodiversity features returned");
            }

            console.log("Biodiversity features loaded:", data.features.length);

            layer.addData(data);

            const kept = layer.getLayers().length;
            console.log(`Biodiversity: kept ${kept} of ${data.features.length} polygons`);

            if (kept === 0) {
                console.warn(
                    "No hotspot matched the four allowed names. Names in the service:",
                    [...new Set(data.features.map(f => f.properties?.name || f.properties?.NAME))]
                );
            }
        })
        .catch(error => {
            console.error("Biodiversity loading failed:", error);
        });

    return layer;
}

/* The currently selected hotspot outline (separate from the overlay) */
let selectedHotspotLayer = null;

/* CHANGED: counts selections so an old, slower request can't draw after
   the user has already switched to something else */
let hotspotRequestId = 0;

export function clearBiodiversityHighlight(map) {
    hotspotRequestId++; // invalidates any selection still loading

    if (map && selectedHotspotLayer) {
        map.removeLayer(selectedHotspotLayer);
    }
    selectedHotspotLayer = null;
}

/**
 * Highlight and zoom to the selected hotspot.
 * Works whether or not the all-hotspots overlay is switched on.
 */
export async function filterBiodiversityHotspot(map, layer, name) {
    clearBiodiversityHighlight(map);
    const requestId = hotspotRequestId;

    if (!map || !layer || !name) return;

    // Wait until the GeoJSON data has finished loading
    await layer._biodiversityLoaded;

    // CHANGED: the user picked something else while we were waiting
    if (requestId !== hotspotRequestId) return;

    const wanted = name.trim().toLowerCase();
    const matches = [];

    layer.eachLayer(featureLayer => {
        const p = featureLayer.feature?.properties || {};
        const n = (p.name || p.NAME || "").trim().toLowerCase();

        if (n === wanted) {
            matches.push(featureLayer.feature);
        }
    });

    if (matches.length === 0) {
        console.warn("Hotspot not found:", name);
        console.log(
            "Available hotspot names:",
            layer.getLayers().map(
                l => l.feature?.properties?.name || l.feature?.properties?.NAME
            )
        );
        return;
    }

    // Own pane so the outline sits above other layers
    if (!map.getPane("selectedHotspot")) {
        map.createPane("selectedHotspot");
        map.getPane("selectedHotspot").style.zIndex = 640;
    }

    selectedHotspotLayer = L.geoJSON(
        { type: "FeatureCollection", features: matches },
        {
            pane: "selectedHotspot",
            style: {
                color: "#ff0000",
                weight: 3,
                opacity: 1,
                fillColor: "#ffff00",
                fillOpacity: 0.08
            }
        }
    ).addTo(map);

    const bounds = selectedHotspotLayer.getBounds();

    if (bounds.isValid()) {
        console.log("Zooming to hotspot:", name);
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
    }
}

/**
 * Show or hide all biodiversity boundaries.
 */
export function toggleBiodiversity(map, layer, visible) {
    if (!map || !layer) return;

    if (visible) {
        if (!map.hasLayer(layer)) {
            layer.addTo(map);
        }
    } else {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    }
}

/* ------------------------------------------------------------------ */
/* Ecoregions                                                          */
/* ------------------------------------------------------------------ */

async function fetchJson(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Request failed (${response.status}): ${url}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(`ArcGIS error: ${JSON.stringify(data.error)}`);
    }

    return data;
}

async function fetchEcoregionInfo() {
    const meta = await fetchJson(`${ECOREGION_URL}?f=json`);

    const renderer = meta.drawingInfo && meta.drawingInfo.renderer;

    const nameField =
        renderer && renderer.field1 ? renderer.field1 : null;

    let names = [];

    if (nameField) {
        const params = new URLSearchParams({
            where: "1=1",
            outFields: nameField,
            returnGeometry: "false",
            returnDistinctValues: "true",
            orderByFields: nameField,
            f: "json"
        });

        const data = await fetchJson(`${ECOREGION_URL}/query?${params}`);

        const values = (data.features || [])
            .map(feature => feature.attributes[nameField])
            .filter(
                value => typeof value === "string" && value.trim() !== ""
            );

        names = [...new Set(values)].sort();
    }

    return {
        nameField,
        names,
        extent: meta.extent,
        geometryType: meta.geometryType,
        maxRecordCount: meta.maxRecordCount,
        fields: (meta.fields || []).map(f => f.name)
    };
}

let ecoregionInfoPromise = null;

export function loadEcoregionInfo() {
    if (!ecoregionInfoPromise) {
        ecoregionInfoPromise = fetchEcoregionInfo().catch(error => {
            ecoregionInfoPromise = null;
            throw error;
        });
    }

    return ecoregionInfoPromise;
}

function buildWhere(nameField, name) {
    if (!nameField || !name) {
        return "1=1";
    }

    const safeName = name.replace(/'/g, "''");

    return `${nameField} = '${safeName}'`;
}

export function createEcoregionLayer(map, info) {
    const { nameField, names } = info;

    if (!map.getPane("ecoregions")) {
        map.createPane("ecoregions");
        map.getPane("ecoregions").style.zIndex = 450;
    }

    const colours = new Map(
        names.map((name, i) => [
            name,
            `hsl(${Math.round((i * 137.5) % 360)}, 65%, ${
                i % 2 === 0 ? 45 : 60
            }%)`
        ])
    );

    const options = {
        url: ECOREGION_URL,
        pane: "ecoregions",
        useCors: true,
        simplifyFactor: 0.5,
        precision: 5,

        style: feature => {
            const name = nameField ? feature.properties[nameField] : null;

            const fill = colours.get(name) || "#3d7a5a";

            return {
                color: "#333333",
                weight: 1.5,
                fillColor: fill,
                fillOpacity: 0.25
            };
        }
    };

    const layer = esri.featureLayer(options);

    if (nameField) {
        layer.bindPopup(l => {
            return String(l.feature.properties[nameField] ?? "");
        });
    }

    return layer;
}

export function toggleEcoregion(map, layer, visible) {
    if (!layer) return;

    if (visible) {
        if (!map.hasLayer(layer)) {
            layer.addTo(map);
        }
    } else {
        map.removeLayer(layer);
    }
}

export function filterEcoregion(layer, nameField, name) {
    if (!layer) return;

    layer.setWhere(buildWhere(nameField, name));
}

export function zoomToEcoregion(map, layer, nameField, name) {
    if (!nameField || !name || !layer) return;

    layer
        .query()
        .where(buildWhere(nameField, name))
        .bounds((error, bounds) => {
            if (!error && bounds && bounds.isValid()) {
                map.fitBounds(bounds, { padding: [30, 30] });
            }
        });
}

/* ------------------------------------------------------------------ */
/* Selected ecoregion boundary highlight                               */
/* ------------------------------------------------------------------ */

let selectedEcoregionLayer = null;

export function highlightEcoregion(map, nameField, name) {
    clearEcoregionHighlight(map);

    if (!map || !nameField || !name) return;

    const where = buildWhere(nameField, name);

    if (!map.getPane("selectedEcoregion")) {
        map.createPane("selectedEcoregion");
        map.getPane("selectedEcoregion").style.zIndex = 650;
    }

    selectedEcoregionLayer = esri.featureLayer({
        url: ECOREGION_URL,
        pane: "selectedEcoregion",
        useCors: true,
        where: where,
        simplifyFactor: 0,
        precision: 6,

        style: {
            color: "#ff0000",
            weight: 2,
            opacity: 1,
            fillColor: "#ffff00",
            fillOpacity: 0.05
        }
    });

    selectedEcoregionLayer.addTo(map);

    selectedEcoregionLayer
        .query()
        .where(where)
        .bounds((error, bounds) => {
            if (error) {
                console.error("Ecoregion boundary query failed:", error);
                return;
            }

            if (bounds && bounds.isValid()) {
                map.fitBounds(bounds, { padding: [40, 40] });
            } else {
                console.warn("No boundary found for:", name);
            }
        });
}

export function clearEcoregionHighlight(map) {
    if (selectedEcoregionLayer) {
        map.removeLayer(selectedEcoregionLayer);
        selectedEcoregionLayer = null;
    }
}