import truststore
truststore.inject_into_ssl()
import io
import math

import numpy as np
import requests
from PIL import Image, ImageDraw
from shapely.geometry import shape


BASE = "https://geoapps.icimod.org/icimodarcgis/rest/services/HKH/Landcover/MapServer/export"
R = 6371007.2  # authalic earth radius, meters

CLASSES = {
    "Forest": (38, 115, 0),
    "Grassland": (186, 255, 163),
    "Cropland": (255, 255, 0),
    "Bare soil": (215, 194, 158),
    "Bare rock": (232, 190, 255),
    "Built-up area": (230, 0, 0),
    "Snow and glacier": (115, 223, 255),
    "Water body": (0, 92, 230),
    "Riverbed": (33, 151, 255),
}

# year -> layer id (2012 does not exist in the service)
YEAR_LAYER = {
    2000: 0, 2001: 1, 2002: 2, 2003: 3, 2004: 4, 2005: 5, 2006: 6, 2007: 7,
    2008: 8, 2009: 9, 2010: 10, 2011: 11, 2013: 12, 2014: 13, 2015: 14,
    2016: 15, 2017: 16, 2018: 17, 2019: 18, 2020: 19, 2021: 20, 2022: 21,
}


def area_by_class(geojson_geom, layer_id, max_px=2048):
    poly = shape(geojson_geom)
    minx, miny, maxx, maxy = poly.bounds
    w_deg, h_deg = maxx - minx, maxy - miny
    scale = max_px / max(w_deg, h_deg)  # same px-per-degree in x and y
    W, H = max(1, round(w_deg * scale)), max(1, round(h_deg * scale))

    r = requests.get(BASE, params={
        "f": "image", "format": "png32", "transparent": "true",
        "layers": f"show:{layer_id}", "bbox": f"{minx},{miny},{maxx},{maxy}",
        "bboxSR": 4326, "imageSR": 4326, "size": f"{W},{H}"}, timeout=120)
    r.raise_for_status()
    img = np.array(Image.open(io.BytesIO(r.content)).convert("RGBA"))

    # polygon mask (exterior filled, holes cleared)
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    for p in getattr(poly, "geoms", [poly]):
        def px(ring):
            return [((x - minx) * W / w_deg, (maxy - y) * H / h_deg) for x, y in ring.coords]
        d.polygon(px(p.exterior), fill=1)
        for hole in p.interiors:
            d.polygon(px(hole), fill=0)
    mask = np.array(m, dtype=bool) & (img[..., 3] == 255)

    # true area (ha) of each pixel row
    dlam = math.radians(w_deg / W)
    edges = np.linspace(maxy, miny, H + 1)  # top to bottom
    s = np.sin(np.radians(edges))
    row_ha = R ** 2 * dlam * (s[:-1] - s[1:]) / 10_000

    out = {}
    for name, rgb in CLASSES.items():
        hit = mask & (img[..., :3] == rgb).all(axis=-1)
        out[name] = float((hit * row_ha[:, None]).sum())
    return out