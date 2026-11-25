
import os
import numpy as np
import rasterio

from rasterio.mask import mask
from shapely.geometry import shape, mapping
from pyproj import Geod


# Path to the original 2000 GeoTIFF
RASTER_PATH = r"C:\Users\dibajracharya\Downloads\Land cover of HKH Region 2000\data\hkh_lc-2000.tif"


# Original numeric land-cover values
CLASSES = {
    1: "Water body",
    2: "Snow and glacier",
    3: "Forest",
    4: "Riverbed",
    5: "Built-up area",
    6: "Cropland",
    7: "Bare soil",
    8: "Bare rock",
    9: "Grassland",
}

geod = Geod(ellps="WGS84")


def area_by_class_tiff(geojson_geom):

    if not os.path.exists(RASTER_PATH):
        raise FileNotFoundError(
            f"GeoTIFF not found: {RASTER_PATH}"
        )

    polygon = shape(geojson_geom)

    if not polygon.is_valid:
        polygon = polygon.buffer(0)

    # Store calculated areas in hectares
    results = {
        name: 0.0 for name in CLASSES.values()
    }

    # Store pixel counts for validation against ArcGIS
    pixel_counts = {
        value: 0 for value in CLASSES
    }

    with rasterio.open(RASTER_PATH) as src:

        # Read only raster pixels inside the polygon
        raster, transform = mask(
            src,
            [mapping(polygon)],
            crop=True,
            filled=False
        )

        pixels = raster[0]

        # Calculate the area of each pixel row
        for row in range(pixels.shape[0]):

            row_values = pixels[row]
            valid_values = row_values.compressed()

            if len(valid_values) == 0:
                continue

            # Get geographic coordinates of a pixel
            x1, y1 = transform * (0, row)
            x2, y2 = transform * (1, row + 1)

            # Calculate geodesic pixel area
            pixel_area, _ = geod.polygon_area_perimeter(
                [x1, x2, x2, x1],
                [y1, y1, y2, y2]
            )

            pixel_area_ha = abs(pixel_area) / 10000

            # Count each numeric land-cover value
            values, counts = np.unique(
                valid_values,
                return_counts=True
            )

            for value, count in zip(values, counts):

                value = int(value)
                count = int(count)

                class_name = CLASSES.get(value)

                if class_name:
                    # Record pixel count
                    pixel_counts[value] += count

                    # Calculate area in hectares
                    results[class_name] += (
                        count * pixel_area_ha
                    )

    # Print pixel counts for ArcGIS comparison
    print("\n--- Rasterio Pixel Counts ---")

    for value, name in CLASSES.items():
        print(
            f"{name} (Value {value}): "
            f"{pixel_counts[value]}"
        )

    print("\n--- Rasterio Area Results (hectares) ---")

    for name, area in results.items():
        print(f"{name}: {area:.4f} ha")

    return results
