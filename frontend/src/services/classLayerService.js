// Class filter: show only the selected land-cover classes.
// If mapService.js already imports Leaflet as L, delete the import below.
import L from "leaflet";

const MAP_SERVER_URL =
    "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Landcover/MapServer";

// Colours from the service legend (RGB). Keys match the legend labels.
export const CLASS_COLOURS = {
    "Water body":       [0, 92, 230],
    "Snow and glacier": [115, 223, 255],
    "Forest":           [38, 115, 0],
    "Riverbed":         [33, 151, 255],
    "Built-up area":    [230, 0, 0],
    "Cropland":         [255, 255, 0],
    "Bare soil":        [215, 194, 158],
    "Bare rock":        [232, 190, 255],
    "Grassland":        [186, 255, 163]
};

const COLOUR_TOLERANCE = 12;
const MAX_CACHED_TILES = 400; // cached PNG blobs (a few KB each)

const ClassLayer = L.GridLayer.extend({
    initialize(layerId, options) {
        this._landcoverId = layerId;
        this._classes = [];
        this._wanted = [];
        this._blobCache = new Map(); // url -> Promise<Blob>
        L.GridLayer.prototype.initialize.call(this, options);

        // Cancel downloads for tiles that scrolled out of view
        this.on("tileunload", (e) => {
            if (e.tile && e.tile._abort) e.tile._abort.abort();
        });
    },

    setLandcoverId(layerId) {
        if (layerId === this._landcoverId) return;
        this._landcoverId = layerId;
        this.redraw();
    },

    setClasses(classNames) {
        const next = [...classNames].sort();
        const same =
            next.length === this._classes.length &&
            next.every((name, i) => name === this._classes[i]);
        if (same) return;

        this._classes = next;
        this._wanted = next.map((n) => CLASS_COLOURS[n]).filter(Boolean);
        this.redraw();
    },

    // Download once, reuse when only the class selection changes
    _getBlob(url, signal) {
        let p = this._blobCache.get(url);
        if (p) return p;

        p = fetch(url, { signal }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.blob();
        });

        p.catch(() => this._blobCache.delete(url)); // don't cache failures/aborts
        this._blobCache.set(url, p);

        if (this._blobCache.size > MAX_CACHED_TILES) {
            this._blobCache.delete(this._blobCache.keys().next().value);
        }
        return p;
    },

    _matches(r, g, b) {
        for (const c of this._wanted) {
            if (
                Math.abs(r - c[0]) <= COLOUR_TOLERANCE &&
                Math.abs(g - c[1]) <= COLOUR_TOLERANCE &&
                Math.abs(b - c[2]) <= COLOUR_TOLERANCE
            ) return true;
        }
        return false;
    },

    // Land cover has ~9 colours, so resolve each distinct colour once
    // and reuse the answer instead of comparing every pixel to every class.
    _filterPixels(px) {
        const lookup = new Map();
        let lastKey = -1;
        let lastKeep = false;

        for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] === 0) continue;

            const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
            if (key !== lastKey) {
                let keep = lookup.get(key);
                if (keep === undefined) {
                    keep = this._matches(px[i], px[i + 1], px[i + 2]);
                    lookup.set(key, keep);
                }
                lastKey = key;
                lastKeep = keep;
            }

            if (!lastKeep) px[i + 3] = 0;
        }
    },

    createTile(coords, done) {
        const size = this.getTileSize();
        const tile = document.createElement("canvas");
        tile.width = size.x;
        tile.height = size.y;

        if (this._wanted.length === 0) {
            // Nothing selected: empty tile, no network request at all
            setTimeout(() => done(null, tile), 0);
            return tile;
        }

        const bounds = this._tileCoordsToBounds(coords);
        const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
        const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());

        const url =
            `${MAP_SERVER_URL}/export` +
            `?bbox=${sw.x},${sw.y},${ne.x},${ne.y}` +
            `&bboxSR=3857&imageSR=3857&size=${size.x},${size.y}&dpi=96` +
            `&format=png32&transparent=true&layers=show:${this._landcoverId}&f=image`;

        const abort = new AbortController();
        tile._abort = abort;

        this._getBlob(url, abort.signal)
            .then((blob) => createImageBitmap(blob))
            .then((bitmap) => {
                const ctx = tile.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(bitmap, 0, 0, size.x, size.y);
                bitmap.close();

                const image = ctx.getImageData(0, 0, size.x, size.y);
                this._filterPixels(image.data);
                ctx.putImageData(image, 0, 0);
                done(null, tile);
            })
            .catch((error) => {
                if (error.name === "AbortError") return; // tile was scrolled away
                console.error("Class tile failed:", error);
                done(error, tile);
            });

        return tile;
    }
});

export function createClassLayer(layerId) {
    return new ClassLayer(layerId, { tileSize: 256, opacity: 0.9 });
}

export function changeClassYear(classLayer, layerId) {
    classLayer.setLandcoverId(layerId);
}

export function setClassFilter(classLayer, classNames) {
    classLayer.setClasses(classNames);
}