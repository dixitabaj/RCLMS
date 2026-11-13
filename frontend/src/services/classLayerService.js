/* ------------------------------------------------------------------ */
/* Class filter: show only the selected land-cover classes             */
/* Paste this block into mapService.js right after toggleLandcover().  */
/* It replaces the earlier ForestLayer / createForestLayer block.      */
/* ------------------------------------------------------------------ */

// Colours taken from the service legend (RGB). Keys match the legend labels.
import L from "leaflet";

const MAP_SERVER_URL =
    "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Landcover/MapServer";
    
export const CLASS_COLOURS = {
    "Water body":      [0, 92, 230],
    "Snow and glacier": [115, 223, 255],
    "Forest":          [38, 115, 0],
    "Riverbed":        [33, 151, 255],
    "Built-up area":   [230, 0, 0],
    "Cropland":        [255, 255, 0],
    "Bare soil":       [215, 194, 158],
    "Bare rock":       [232, 190, 255],
    "Grassland":       [186, 255, 163]
};

const COLOUR_TOLERANCE = 12;

const ClassLayer = L.GridLayer.extend({
    initialize(layerId, options) {
        this._landcoverId = layerId;
        this._classes = [];
        L.GridLayer.prototype.initialize.call(this, options);
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
        this.redraw();
    },

    createTile(coords, done) {
        const size = this.getTileSize();
        const tile = document.createElement("canvas");
        tile.width = size.x;
        tile.height = size.y;

        // Colours of the classes that should stay visible
        const wanted = this._classes
            .map(name => CLASS_COLOURS[name])
            .filter(Boolean);

        if (wanted.length === 0) {
            done(null, tile); // nothing selected: empty tile
            return tile;
        }

        // Tile bounds in Web Mercator metres
        const bounds = this._tileCoordsToBounds(coords);
        const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
        const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());

        const url =
            `${MAP_SERVER_URL}/export` +
            `?bbox=${sw.x},${sw.y},${ne.x},${ne.y}` +
            `&bboxSR=3857&imageSR=3857&size=${size.x},${size.y}&dpi=96` +
            `&format=png32&transparent=true&layers=show:${this._landcoverId}&f=image`;

        fetch(url)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.blob();
            })
            .then(blob => createImageBitmap(blob))
            .then(bitmap => {
                const ctx = tile.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(bitmap, 0, 0, size.x, size.y);

                const image = ctx.getImageData(0, 0, size.x, size.y);
                const px = image.data;

                for (let i = 0; i < px.length; i += 4) {
                    let keep = false;

                    if (px[i + 3] > 0) {
                        for (const c of wanted) {
                            if (
                                Math.abs(px[i] - c[0]) <= COLOUR_TOLERANCE &&
                                Math.abs(px[i + 1] - c[1]) <= COLOUR_TOLERANCE &&
                                Math.abs(px[i + 2] - c[2]) <= COLOUR_TOLERANCE
                            ) {
                                keep = true;
                                break;
                            }
                        }
                    }

                    if (!keep) px[i + 3] = 0; // hide every other class
                }

                ctx.putImageData(image, 0, 0);
                done(null, tile);
            })
            .catch(error => {
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