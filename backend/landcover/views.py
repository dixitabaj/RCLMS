from django.shortcuts import render

# Create your views here.
import json
import requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from .services import area_by_class, YEAR_LAYER

@csrf_exempt          # fine for local dev; use proper CSRF or token auth before deploying
@require_POST
def analysis(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    year, geometry = body.get("year"), body.get("geometry")
    if year not in YEAR_LAYER:
        return JsonResponse({"error": f"No land-cover layer for year {year}"}, status=400)
    if not geometry or geometry.get("type") not in ("Polygon", "MultiPolygon"):
        return JsonResponse({"error": "geometry must be a GeoJSON Polygon or MultiPolygon"}, status=400)

    try:
        result = area_by_class(geometry, YEAR_LAYER[year])
    except requests.RequestException as e:
        return JsonResponse({"error": f"ICIMOD service unavailable: {e}"}, status=502)
    return JsonResponse({"year": year, "area_ha": result, "approximate": True})

import csv
from functools import wraps

from django.http import HttpResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import LandcoverRecord
from .serializers import LandcoverRecordSerializer

# Display order used everywhere (matches the legend on the ICIMOD site).
CLASS_ORDER = [
    "Forest", "Grassland", "Cropland", "Bare soil", "Bare rock",
    "Built-up", "Snow and glacier", "Water body", "Riverbed",
]
CLASS_INDEX = {name: i for i, name in enumerate(CLASS_ORDER)}
CLASS_LOOKUP = {name.lower(): name for name in CLASS_ORDER}

REGION_TYPES = [
    ("hkh", "Hindu Kush Himalaya region"),
    ("ecoregion", "Ecoregion"),
    ("hotspot", "Biodiversity hotspot"),
]
REGION_TYPE_CODES = {code for code, _ in REGION_TYPES}


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
class FilterError(Exception):
    def __init__(self, errors):
        self.errors = errors


def parse_filters(params, required=()):
    """Validate query-string filters. Raises FilterError (-> HTTP 400)."""
    errors, f = {}, {}

    region_type = params.get("region_type")
    if region_type:
        if region_type in REGION_TYPE_CODES:
            f["region_type"] = region_type
        else:
            errors["region_type"] = "Must be one of: " + ", ".join(sorted(REGION_TYPE_CODES))

    region = params.get("region")
    if region:
        f["region"] = region

    year = params.get("year")
    if year:
        try:
            f["year"] = int(year)
        except ValueError:
            errors["year"] = "Must be an integer, e.g. 2022."

    class_name = params.get("class_name")
    if class_name:
        match = CLASS_LOOKUP.get(class_name.strip().lower())
        if match:
            f["class_name"] = match
        else:
            errors["class_name"] = "Must be one of: " + ", ".join(CLASS_ORDER)

    for key in required:
        if key not in f and key not in errors:
            errors[key] = "This parameter is required."

    if errors:
        raise FilterError(errors)
    return f


def handle_filter_errors(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        try:
            return view(request, *args, **kwargs)
        except FilterError as exc:
            return Response({"errors": exc.errors}, status=400)
    return wrapper


def sort_key(row):
    return (row.region_type, row.region, row.year, CLASS_INDEX.get(row.class_name, 99))


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------
@api_view(["GET"])
def regions(request):
    """GET /api/landcover/regions/ -> region types, region names, years, classes."""
    pairs = (
        LandcoverRecord.objects.values_list("region_type", "region")
        .distinct()
        .order_by("region")
    )
    grouped = {}
    for region_type, region in pairs:
        grouped.setdefault(region_type, []).append(region)

    region_types = []
    for code, label in REGION_TYPES:
        names = sorted(grouped.get(code, []), key=lambda n: (n == "Other", n))  # "Other" last
        region_types.append({"region_type": code, "label": label, "regions": names})

    years = list(
        LandcoverRecord.objects.values_list("year", flat=True).distinct().order_by("year")
    )
    present = set(LandcoverRecord.objects.values_list("class_name", flat=True).distinct())
    classes = [c for c in CLASS_ORDER if c in present] + sorted(present - set(CLASS_ORDER))

    return Response({"region_types": region_types, "years": years, "classes": classes})


@api_view(["GET"])
@handle_filter_errors
def summary(request):
    """GET /api/landcover/summary/?region_type=&region=&year= -> all classes."""
    f = parse_filters(request.query_params, required=("region_type", "region", "year"))
    rows = sorted(LandcoverRecord.objects.filter(**f), key=sort_key)

    classes = [
        {
            "class_name": r.class_name,
            "area_ha": float(r.area_ha),
            "filled_missing": r.filled_missing,
        }
        for r in rows
    ]
    return Response({
        "region_type": f["region_type"],
        "region": f["region"],
        "year": f["year"],
        "total_area_ha": sum(c["area_ha"] for c in classes),
        "has_filled_missing": any(c["filled_missing"] for c in classes),
        "classes": classes,
    })


@api_view(["GET"])
@handle_filter_errors
def trend(request):
    """GET /api/landcover/trend/?region_type=&region=&class_name= -> every year."""
    f = parse_filters(request.query_params, required=("region_type", "region", "class_name"))
    qs = LandcoverRecord.objects.filter(**f).order_by("year")

    points = [
        {"year": r.year, "area_ha": float(r.area_ha), "filled_missing": r.filled_missing}
        for r in qs
    ]
    return Response({
        "region_type": f["region_type"],
        "region": f["region"],
        "class_name": f["class_name"],
        "points": points,
    })


@api_view(["GET"])
@handle_filter_errors
def records(request):
    """GET /api/landcover/records/?region_type=&region=&year=&class_name="""
    f = parse_filters(request.query_params)
    rows = sorted(LandcoverRecord.objects.filter(**f), key=sort_key)
    data = LandcoverRecordSerializer(rows, many=True).data
    return Response({"count": len(data), "results": data})


@api_view(["GET"])
@handle_filter_errors
def export_csv(request):
    """GET /api/landcover/export/?... -> CSV of the filtered records."""
    f = parse_filters(request.query_params)
    rows = sorted(LandcoverRecord.objects.filter(**f), key=sort_key)

    name_bits = [str(f[k]).replace(" ", "_").replace("/", "-") for k in ("region", "year", "class_name") if k in f]
    filename = "landcover_" + ("_".join(name_bits) or "all") + ".csv"

    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(["region_type", "region", "year", "class", "area_ha", "filled_missing"])
    for r in rows:
        writer.writerow([r.region_type, r.region, r.year, r.class_name, r.area_ha, r.filled_missing])
    return response
