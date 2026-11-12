"""
download_all.py - build the yearly CSV for every land-cover class and region
from the RLCMS page.

How it works (confirmed from your Console output):
  * The page has ONE Highcharts chart. Its getCSV() returns all 9 classes for the
    selected region and year:   "Category","Area" / "Forest",1608529.5 / ...
  * The CSV is built in the browser, so there is no server endpoint to call.
  * For each region we select every year (2000-2022 except 2012), read the chart,
    and assemble one file per class:   "Category","Built-up" / "2000",... / "2001",...

Run (PowerShell, venv active):
  python download_all.py --dry-run                 # show plan, writes nothing
  python download_all.py --groups hkh --limit 1    # first test: overall HKH only
  python download_all.py --groups ecoregion        # the 13 ecoregions
  python download_all.py                           # everything it can reach
Finished regions are skipped on re-run (use --overwrite to redo them).
"""
import argparse
import csv
import json
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

URL = "https://geoapps.icimod.org/RLCMS/"
OUT_DIR = Path(r"D:\ICIMOD_RLCMS\RLCMS\downloads")

# The four dropdowns, in page order (from your Console output):
#   0 = ecoregion, 1 = biodiversity hotspot, 2 = year, 3 = land-cover class
SEL = {
    "ecoregion": "select >> nth=0",
    "hotspot": "select >> nth=1",
    "year": "select >> nth=2",
    "cls": "select >> nth=3",
}
# The hotspot dropdown is DISABLED while an ecoregion is selected. If something on
# the page enables it (a radio button, toggle, tab...), put a selector for that
# element here and the script will click it before choosing a hotspot.
# Leave as None if you don't know yet: hotspots will then be skipped with a message.
ACTIVATE_HOTSPOT = "#hotspot"      # radio button "Biodiversity hotspot" (found with find_activator.py)
# Same idea for ecoregions: BOTH region dropdowns are disabled when the page loads
# (your inspection report), so something on the page must enable them. Put a selector
# for that control (radio button, toggle, tab...) here.
ACTIVATE_ECOREGION = "#ecoregion"  # radio button "Ecoregion" (found with find_activator.py)

HKH_LABEL = "Hindu Kush Himalaya"   # text in the chart title when the whole region is shown
GROUP_DIR = {"hkh": "hkh", "ecoregion": "ecoregions", "hotspot": "biodiversity_hotspots"}
TIMEOUT_MS = 20000
RETRIES = 3
# The chart leaves out classes that don't occur in a region/year. We treat "row missing"
# as zero area and write this value, AND record every filled cell in a report file so you
# can verify it against your manually downloaded CSVs. Use "" to leave those cells blank.
MISSING_VALUE = "0"


class ControlDisabled(Exception):
    pass


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def settle(page, ms=800):
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass  # map apps often never go fully idle
    page.wait_for_timeout(ms)


def options_of(page, selector):
    return page.locator(selector).evaluate("el => [...el.options].map(o => o.text.trim())")


def set_select(page, selector, label):
    loc = page.locator(selector)
    loc.wait_for(state="attached", timeout=TIMEOUT_MS)
    try:
        expect(loc).to_be_enabled(timeout=5000)
    except AssertionError:
        raise ControlDisabled(selector)
    loc.select_option(label=label)


def wait_for_chart(page, label, year):
    """Wait until the chart title shows this region AND this year (so we never read stale data)."""
    page.wait_for_function(
        """([label, year]) => {
            const cs = (window.Highcharts && Highcharts.charts || []).filter(Boolean);
            if (!cs.length) return false;
            const t = (cs[cs.length - 1].title.textStr) || '';
            return t.endsWith(' in ' + year) && (!label || t.includes(label));
        }""",
        arg=[label, year], timeout=TIMEOUT_MS)
    page.wait_for_timeout(300)


def read_chart(page, classes):
    res = page.evaluate("""() => {
        const cs = (window.Highcharts && Highcharts.charts || []).filter(Boolean);
        if (!cs.length) return null;
        const c = cs[cs.length - 1];
        return { title: c.title.textStr, csv: c.getCSV() };
    }""")
    if not res:
        raise RuntimeError("no Highcharts chart on page")
    rows = list(csv.reader(res["csv"].splitlines()))
    if rows[0] != ["Category", "Area"]:
        raise RuntimeError(f"unexpected CSV header {rows[0]}")
    values = {r[0]: r[1] for r in rows[1:]}
    unexpected = [k for k in values if k not in classes]
    if unexpected:
        raise RuntimeError(f"unexpected classes in chart data: {unexpected}")
    if not values:
        raise RuntimeError("chart has no data rows (not loaded yet?)")
    missing = [c for c in classes if c not in values]
    for c in missing:
        values[c] = MISSING_VALUE
    return values, missing


def prepare(page, group, label):
    """Fresh page load, then choose the region."""
    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    settle(page, 2000)
    if group == "ecoregion":
        if ACTIVATE_ECOREGION:
            page.locator(ACTIVATE_ECOREGION).click()
            settle(page)
        set_select(page, SEL["ecoregion"], label)
    elif group == "hotspot":
        if ACTIVATE_HOTSPOT:
            page.locator(ACTIVATE_HOTSPOT).click()
            settle(page)
        set_select(page, SEL["hotspot"], label)
    # group == "hkh": the page's default view is the whole HKH, nothing to select
    settle(page)


def scrape_region(page, group, label, years, classes, err_dir):
    data = {}
    filled = []
    title_label = HKH_LABEL if group == "hkh" else (None if label == "Other" else label)
    for attempt in range(1, RETRIES + 1):
        try:
            prepare(page, group, label)
            for y in years:
                if y in data:
                    continue
                page.locator(SEL["year"]).select_option(label=y)
                wait_for_chart(page, title_label, y)
                data[y], miss = read_chart(page, classes)
                filled += [(y, c) for c in miss]
            return data, filled
        except ControlDisabled:
            raise
        except Exception as e:
            print(f"    attempt {attempt}/{RETRIES} failed: {str(e).splitlines()[0]}")
            try:
                page.screenshot(path=str(err_dir / f"{slug(label)}_try{attempt}.png"))
            except Exception:
                pass
    raise RuntimeError("all attempts failed")


def outputs_exist(folder, label, classes):
    return all((folder / f"{slug(label)}__{slug(c)}.csv").exists() for c in classes)


def write_outputs(folder, label, years, classes, data):
    folder.mkdir(parents=True, exist_ok=True)
    for cls in classes:
        final = folder / f"{slug(label)}__{slug(cls)}.csv"
        tmp = final.with_suffix(".part")
        with open(tmp, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, quoting=csv.QUOTE_ALL)
            w.writerow(["Category", cls])
            for y in years:
                w.writerow([y, data[y][cls]])
        tmp.replace(final)
    # bonus: everything for this region in one tidy file
    final = folder / f"{slug(label)}__all_classes_long.csv"
    with open(final, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["year", "class", "area_ha"])
        for y in years:
            for cls in classes:
                w.writerow([y, cls, data[y][cls]])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="only the first N regions (for testing)")
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--groups", nargs="*", choices=list(GROUP_DIR), default=list(GROUP_DIR))
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    err_dir = OUT_DIR / "_errors"
    err_dir.mkdir(exist_ok=True)
    manifest = OUT_DIR / "manifest.csv"
    new_manifest = not manifest.exists()
    failed = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless)
        # ignore_https_errors: the site's certificate chain isn't trusted by Playwright's Chromium
        page = browser.new_context(viewport={"width": 1400, "height": 900},
                                   ignore_https_errors=True).new_page()
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        settle(page, 2000)

        ecos = [o for o in options_of(page, SEL["ecoregion"]) if o]
        spots = [o for o in options_of(page, SEL["hotspot"]) if o]
        years = [o for o in options_of(page, SEL["year"]) if o]
        classes = [o for o in options_of(page, SEL["cls"]) if o]
        print(f"Found: {len(ecos)} ecoregions, {len(spots)} hotspots, {len(years)} years, {len(classes)} classes")
        if (len(ecos), len(spots), len(years), len(classes)) != (13, 4, 22, 9):
            print("WARNING: expected 13 / 4 / 22 / 9 - check the SEL indexes at the top of the script.")

        plan = []
        if "hkh" in args.groups:
            plan.append(("hkh", HKH_LABEL))
        if "ecoregion" in args.groups:
            plan += [("ecoregion", e) for e in ecos]
        if "hotspot" in args.groups:
            plan += [("hotspot", s) for s in spots]
        if args.limit:
            plan = plan[: args.limit]

        print(f"Plan: {len(plan)} regions x {len(years)} years x {len(classes)} classes -> {OUT_DIR}")
        if args.dry_run:
            for g, label in plan:
                print(f"  {g:10s} {label:50s} -> {GROUP_DIR[g]}\\{slug(label)}\\")
            browser.close()
            return

        mf = open(manifest, "a", newline="", encoding="utf-8")
        mw = csv.writer(mf)
        if new_manifest:
            mw.writerow(["time", "group", "region", "status", "note"])

        skipped_groups = set()
        for n, (group, label) in enumerate(plan, 1):
            tag = f"[{n}/{len(plan)}] {group}: {label}"
            folder = OUT_DIR / GROUP_DIR[group] / slug(label)
            if group in skipped_groups:
                continue
            if not args.overwrite and outputs_exist(folder, label, classes):
                print(f"{tag} - already done, skipping")
                mw.writerow([time.strftime("%F %T"), group, label, "skipped", "exists"])
                continue
            print(f"{tag} - reading {len(years)} years ...")
            try:
                data, filled = scrape_region(page, group, label, years, classes, err_dir)
                write_outputs(folder, label, years, classes, data)
                note = ""
                if filled:
                    with open(folder / f"{slug(label)}__missing_filled.csv", "w", newline="", encoding="utf-8") as f:
                        w = csv.writer(f)
                        w.writerow(["year", "class"])
                        w.writerows(filled)
                    absent = sorted({c for _, c in filled})
                    note = f"{len(filled)} absent cells written as {MISSING_VALUE!r} ({', '.join(absent)})"
                    print(f"    note: {note}")
                print(f"    saved {len(classes)} class files to {folder}")
                mw.writerow([time.strftime("%F %T"), group, label, "ok", note])
            except ControlDisabled as e:
                setting = "ACTIVATE_ECOREGION" if group == "ecoregion" else "ACTIVATE_HOTSPOT"
                print(f"    '{e}' is disabled, so {group} regions can't be selected yet.\n"
                      f"    Find what enables it on the page and set {setting} at the top of the script.")
                mw.writerow([time.strftime("%F %T"), group, label, "skipped", "dropdown disabled"])
                skipped_groups.add(group)
            except Exception as e:
                print(f"    FAILED: {e}")
                failed.append({"group": group, "region": label, "error": str(e)})
                mw.writerow([time.strftime("%F %T"), group, label, "FAILED", str(e)[:200]])
            mf.flush()

        mf.close()
        browser.close()

    if failed:
        (OUT_DIR / "failed.json").write_text(json.dumps(failed, indent=2), encoding="utf-8")
        print(f"\n{len(failed)} regions failed - see failed.json and _errors\\ screenshots. Re-run to retry only those.")
    else:
        print("\nFinished.")


if __name__ == "__main__":
    main()