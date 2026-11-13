import L from "leaflet";
import * as esri from "esri-leaflet";
import intersect from "@turf/intersect";

const MAP_SERVER_URL =
    "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Landcover/MapServer";

const ECOREGION_URL =
    "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Environment/MapServer/2";

// Box around the Hindu Kush Himalaya (west, south, east, north in degrees).
// Ecoregions and hotspots that do not touch this box (Europe, Africa, ...) are left out.
const HKH_ENVELOPE = "60.5,21,105.5,40";

// HKH outline (same service the "HKH boundary" layer uses). Layer 0 = the outline polygon.
const HKH_OUTLINE_URL =
    "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Outline/MapServer/0";

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

// GeoJSON outer rings -> Leaflet [lat, lng] rings
function outerRings(geometry) {
    const polygons =
        geometry?.type === "Polygon" ? [geometry.coordinates] :
        geometry?.type === "MultiPolygon" ? geometry.coordinates : [];

    return polygons.map(poly => poly[0].map(([lng, lat]) => [lat, lng]));
}

/* ---- Clip hotspots to the HKH outline -------------------------------- */

let hkhOutlinePromise = null;

function loadHkhOutline() {
    if (!hkhOutlinePromise) {
        hkhOutlinePromise = new Promise((resolve, reject) => {
            esri.query({ url: HKH_OUTLINE_URL })
                .where("1=1")
                .run((error, featureCollection) => {
                    if (error || !featureCollection?.features?.length) {
                        reject(error || new Error("HKH outline is empty"));
                        return;
                    }
                    resolve(featureCollection.features);
                });
        }).catch(error => {
            hkhOutlinePromise = null; // allow a retry
            throw error;
        });
    }

    return hkhOutlinePromise;
}

/**
 * Keep only the four hotspots and cut them to the HKH outline,
 * so they stop at the same border as the ecoregions.
 * If the outline can't be loaded, the unclipped hotspots are used.
 */
async function clipHotspotsToHkh(data) {
    const wanted = data.features.filter(f => ALLOWED_HOTSPOTS.has(hotspotName(f)));

    try {
        const outline = await loadHkhOutline();
        const clipped = [];

        for (const feature of wanted) {
            for (const part of outline) {
                const piece = intersect(feature, part);

                if (piece) {
                    piece.properties = feature.properties;
                    clipped.push(piece);
                }
            }
        }

        return { type: "FeatureCollection", features: clipped };
    } catch (error) {
        console.warn("Could not clip hotspots to the HKH, showing them unclipped:", error);
        return { type: "FeatureCollection", features: wanted };
    }
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
            dashArray: "6 4",      // dashed so it differs from the solid ecoregion outlines
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
        `${BIODIVERSITY_URL}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326` +
        `&geometry=${HKH_ENVELOPE}&geometryType=esriGeometryEnvelope&inSR=4326` +
        `&spatialRel=esriSpatialRelIntersects&f=geojson`
    )
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            return response.json();
        })
        .then(async data => {
            if (!data.features || data.features.length === 0) {
                throw new Error("No biodiversity features returned");
            }

            console.log("Biodiversity features loaded:", data.features.length);

            layer.addData(await clipHotspotsToHkh(data));

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

/* White fade over the HKH, outside the selected hotspot */
let hotspotMask = null;

export function clearBiodiversityHighlight(map) {
    hotspotRequestId++; // invalidates any selection still loading

    if (map && hotspotMask) {
        map.removeLayer(hotspotMask);
    }
    hotspotMask = null;

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
                color: "#f57c00",      // solid orange, thicker (selected ecoregion stays red)
                weight: 2,
                opacity: 1,
                fillColor: "#ffb74d",
                fillOpacity: 0.08
            }
        }
    ).addTo(map);

    // Fade the rest of the HKH: HKH outline with the selected hotspot cut out
    loadHkhOutline()
        .then(outline => {
            if (requestId !== hotspotRequestId) return;

            const hkhRings = outline.flatMap(f => outerRings(f.geometry));
            const holes = matches.flatMap(f => outerRings(f.geometry));

            if (!map.getPane("hotspotMask")) {
                map.createPane("hotspotMask");
                map.getPane("hotspotMask").style.zIndex = 440; // above land cover, below outlines
                map.getPane("hotspotMask").style.pointerEvents = "none";
            }

            hotspotMask = L.polygon([...hkhRings, ...holes], {
                pane: "hotspotMask",
                stroke: false,
                fillColor: "#ffffff",
                fillOpacity: 0.8   // raise for a paler background, lower to see more
            }).addTo(map);
        })
        .catch(error => {
            console.warn("Could not fade the area outside the hotspot:", error);
        });

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
            geometry: HKH_ENVELOPE,
            geometryType: "esriGeometryEnvelope",
            inSR: "4326",
            spatialRel: "esriSpatialRelIntersects",
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

/**
 * NEW: get the boundary of one ecoregion as a GeoJSON geometry (Polygon or MultiPolygon),
 * so it can be sent to the analysis API like a drawn polygon.
 * Used for ecoregions that are not in the database.
 */
export async function fetchEcoregionGeometry(name) {
    const info = await loadEcoregionInfo();

    if (!info.nameField || !name) return null;

    const params = new URLSearchParams({
        where: buildWhere(info.nameField, name),
        outFields: info.nameField,
        returnGeometry: "true",
        outSR: "4326",
        maxAllowableOffset: "0.002", // simplify to ~200 m so the request stays small
        geometryPrecision: "5",
        f: "geojson"
    });

    const data = await fetchJson(`${ECOREGION_URL}/query?${params}`);

    // One ecoregion can be several features: merge them into a single geometry
    const polygons = [];

    for (const feature of data.features || []) {
        const g = feature.geometry;
        if (g?.type === "Polygon") polygons.push(g.coordinates);
        else if (g?.type === "MultiPolygon") polygons.push(...g.coordinates);
    }

    if (polygons.length === 0) return null;

    return polygons.length === 1
        ? { type: "Polygon", coordinates: polygons[0] }
        : { type: "MultiPolygon", coordinates: polygons };
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
                weight: 1,
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
/* Selected ecoregion: red outline + fade the other HKH ecoregions     */
/* ------------------------------------------------------------------ */

let selectedEcoregionLayer = null;
let ecoregionMask = null;

function clearEcoregionMask(map) {
    if (map && ecoregionMask) {
        map.removeLayer(ecoregionMask);
    }
    ecoregionMask = null;
}

/**
 * Fade every OTHER ecoregion with a white, semi-transparent fill.
 * The ecoregion layer only covers the HKH, so the rest of the map stays untouched.
 */
function showEcoregionMask(map, nameField, name) {
    clearEcoregionMask(map);

    // Above the land cover, below the ecoregion overlay and the red outline
    if (!map.getPane("ecoregionMask")) {
        map.createPane("ecoregionMask");
        map.getPane("ecoregionMask").style.zIndex = 440;
        map.getPane("ecoregionMask").style.pointerEvents = "none"; // clicks go through
    }

    const safeName = name.replace(/'/g, "''");

    ecoregionMask = esri.featureLayer({
        url: ECOREGION_URL,
        pane: "ecoregionMask",
        useCors: true,
        where: `${nameField} <> '${safeName}' OR ${nameField} IS NULL`,
        simplifyFactor: 0.5,
        precision: 5,

        style: {
            stroke: false,
            fillColor: "#ffffff",
            fillOpacity: 0.8   // raise for a paler background, lower to see more
        }
    }).addTo(map);
}

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

    // Fade everything outside the selected ecoregion
    showEcoregionMask(map, nameField, name);

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
    clearEcoregionMask(map);

    if (selectedEcoregionLayer) {
        map.removeLayer(selectedEcoregionLayer);
        selectedEcoregionLayer = null;
    }
}
