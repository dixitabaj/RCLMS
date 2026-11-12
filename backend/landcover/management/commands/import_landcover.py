"""
python manage.py import_landcover [SOURCE] [--allow-partial]

SOURCE can be
  * the downloads FOLDER written by download_all.py   (default), or
  * a combined landcover_all.csv file.

What it does
  1. reads and VALIDATES everything first (nothing is written if anything is wrong),
  2. inserts the rows in one transaction,
  3. is safe to run again: existing rows are updated, never duplicated.
"""
import csv
import math
import re
from collections import Counter
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from landcover.models import LandcoverRecord

DEFAULT_SOURCE = r"D:\ICIMOD_RLCMS\RLCMS\downloads"

HKH = "Hindu Kush Himalaya"
ECOREGIONS = [
    "Eastern Himalayan Alpine Meadows",
    "Eastern Himalayan Broadleaf and Conifer Forests",
    "Hengduan Shan Conifer Forests",
    "Indochina Dry Forests",
    "Kayah-Karen/Tenasserim Moist Forests",
    "Middle Asian Montane Woodlands and Steppe",
    "Naga-Manapuri-Chin Hills Moist Forests",
    "North Indochina Subtropical Moist Forests",
    "Southwest China Temperate Forests",
    "Terai-Duar Savannas and Grasslands",
    "Tibetan Plateau Steppe",
    "Western Himalayan Temperate Forests",
    "Other",
]
HOTSPOTS = ["Himalaya", "Indo-Burma", "Mountains of Central Asia", "Mountains of Southwest China"]
CLASSES = ["Forest", "Grassland", "Cropland", "Bare soil", "Bare rock", "Built-up",
           "Snow and glacier", "Water body", "Riverbed"]
YEARS = [y for y in range(2000, 2023) if y != 2012]

EXPECTED_REGIONS = ([("hkh", HKH)] + [("ecoregion", e) for e in ECOREGIONS]
                    + [("hotspot", h) for h in HOTSPOTS])
PER_REGION = len(YEARS) * len(CLASSES)          # 198
EXPECTED_TOTAL = len(EXPECTED_REGIONS) * PER_REGION   # 3564

# download folder name -> region_type
FOLDERS = {"hkh": "hkh", "ecoregions": "ecoregion", "biodiversity_hotspots": "hotspot"}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


SLUG_TO_REGION = {(rt, slug(name)): name for rt, name in EXPECTED_REGIONS}


def read_combined(path):
    """landcover_all.csv -> list of dicts."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = []
        for r in csv.DictReader(f):
            rows.append({
                "region_type": r["region_type"].strip(),
                "region": r["region"].strip(),
                "year": r["year"],
                "class": r["class"].strip(),
                "area_ha": r["area_ha"],
                "filled": r.get("filled_missing", "False").strip().lower() in ("true", "1"),
                "origin": f"{path.name}",
            })
    return rows


def read_folder(root):
    """downloads\\<group>\\<region>\\<region>__all_classes_long.csv -> list of dicts."""
    rows = []
    for folder, rtype in FOLDERS.items():
        base = root / folder
        if not base.is_dir():
            continue
        for region_dir in sorted(p for p in base.iterdir() if p.is_dir()):
            s = region_dir.name
            region = SLUG_TO_REGION.get((rtype, s))
            if region is None:
                raise CommandError(f"Unexpected folder (not a known region): {region_dir}")
            long_file = region_dir / f"{s}__all_classes_long.csv"
            if not long_file.exists():
                raise CommandError(f"Missing file: {long_file}")

            filled = set()
            filled_file = region_dir / f"{s}__missing_filled.csv"
            if filled_file.exists():
                with open(filled_file, newline="", encoding="utf-8-sig") as f:
                    filled = {(r["year"].strip(), r["class"].strip()) for r in csv.DictReader(f)}

            with open(long_file, newline="", encoding="utf-8-sig") as f:
                for r in csv.DictReader(f):
                    rows.append({
                        "region_type": rtype, "region": region,
                        "year": r["year"], "class": r["class"].strip(),
                        "area_ha": r["area_ha"],
                        "filled": (r["year"].strip(), r["class"].strip()) in filled,
                        "origin": str(long_file),
                    })
    return rows


def validate(rows):
    """Return ({(rtype, region, year, class): (area, filled)}, [error messages])."""
    data, errors = {}, []
    expected = set(EXPECTED_REGIONS)
    for r in rows:
        where = r["origin"]
        key_region = (r["region_type"], r["region"])
        if key_region not in expected:
            errors.append(f"{where}: unknown region {key_region}")
            continue
        try:
            year = int(r["year"])
        except ValueError:
            errors.append(f"{where}: invalid year {r['year']!r}")
            continue
        if year not in YEARS:
            errors.append(f"{where}: year {year} is not one of the 22 expected years")
            continue
        if r["class"] not in CLASSES:
            errors.append(f"{where}: unknown class {r['class']!r}")
            continue
        try:
            area = float(r["area_ha"])
        except ValueError:
            errors.append(f"{where}: invalid area {r['area_ha']!r} ({r['region']}, {year}, {r['class']})")
            continue
        if not math.isfinite(area) or area < 0:
            errors.append(f"{where}: area must be a number >= 0, got {area} ({r['region']}, {year}, {r['class']})")
            continue
        key = (r["region_type"], r["region"], year, r["class"])
        if key in data:
            errors.append(f"{where}: duplicate row for {key}")
            continue
        data[key] = (area, r["filled"])
    return data, errors


class Command(BaseCommand):
    help = "Validate the scraped RLCMS CSVs and import them into PostgreSQL (safe to re-run)."

    def add_arguments(self, parser):
        parser.add_argument("source", nargs="?", default=DEFAULT_SOURCE,
                            help="downloads folder (default) or a landcover_all.csv file")
        parser.add_argument("--allow-partial", action="store_true",
                            help=f"import even if fewer than {EXPECTED_TOTAL} rows are found")

    def handle(self, *args, **opts):
        source = Path(opts["source"])
        if not source.exists():
            raise CommandError(f"Not found: {source}")
        self.stdout.write(f"Reading {source} ...")
        rows = read_combined(source) if source.is_file() else read_folder(source)

        data, errors = validate(rows)
        if errors:
            for e in errors[:25]:
                self.stderr.write(f"  ERROR {e}")
            raise CommandError(f"{len(errors)} problem(s) found. Nothing was imported.")

        # completeness check: every region must have 22 years x 9 classes
        per_region = Counter((k[0], k[1]) for k in data)
        incomplete = [(rt, name, per_region.get((rt, name), 0))
                      for rt, name in EXPECTED_REGIONS if per_region.get((rt, name), 0) != PER_REGION]
        if incomplete:
            for rt, name, n in incomplete:
                self.stderr.write(f"  {rt:9s} {name}: {n}/{PER_REGION} rows")
        if (len(data) != EXPECTED_TOTAL or incomplete) and not opts["allow_partial"]:
            raise CommandError(
                f"Found {len(data)} rows, expected {EXPECTED_TOTAL}. Nothing was imported. "
                f"Fix the missing data, or re-run with --allow-partial.")

        objs = [
            LandcoverRecord(region_type=k[0], region=k[1], year=k[2], class_name=k[3],
                            area_ha=v[0], filled_missing=v[1])
            for k, v in data.items()
        ]
        before = LandcoverRecord.objects.count()
        with transaction.atomic():
            LandcoverRecord.objects.bulk_create(
                objs, batch_size=1000,
                update_conflicts=True,
                unique_fields=["region_type", "region", "year", "class_name"],
                update_fields=["area_ha", "filled_missing"],
            )
        after = LandcoverRecord.objects.count()

        self.stdout.write(self.style.SUCCESS(
            f"Imported {len(objs)} rows: {after - before} new, {len(objs) - (after - before)} already existed (updated)."))
        self.stdout.write(f"Table landcover_records now holds {after} rows (expected {EXPECTED_TOTAL}).")
        by_type = Counter(k[0] for k in data)
        self.stdout.write("  by region_type: " + ", ".join(f"{t}={n}" for t, n in sorted(by_type.items())))
        self.stdout.write(f"  cells filled with 0 because the chart had no row: {sum(1 for v in data.values() if v[1])}")