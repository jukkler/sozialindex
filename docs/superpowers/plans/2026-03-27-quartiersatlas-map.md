# Quartiersatlas Düsseldorf 2024 — Interaktive Karte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive choropleth map of Düsseldorf's 170 Sozialräume showing social need ("Sozialer Handlungsbedarf") and population fluctuation ("Fluktuation") indices, based on the Quartiersatlas 2024 data.

**Architecture:** A Python ETL script reads the Excel indicator data, calculates z-scores and composite indices, merges everything into the source GeoJSON, and outputs an enriched GeoJSON file. A single-page vanilla HTML/CSS/JS frontend renders the map using Leaflet.js with a layer toggle (Sozial / Fluktuation), hover tooltips, click detail popups, and a color legend.

**Tech Stack:** Python 3 + openpyxl (ETL), Leaflet.js 1.9.4 (CDN), CartoDB Positron tiles, vanilla HTML/CSS/JS

---

## File Structure

```
sozialraum_map/
├── scripts/
│   └── prepare_data.py              # ETL: Excel + GeoJSON → enriched GeoJSON
├── index.html                        # Main page with Leaflet map
├── css/
│   └── style.css                    # Layout, legend, popup, control styles
├── js/
│   └── app.js                       # Map logic, interaction, layer control, legend
├── data/
│   └── sozialraeume.geojson         # GENERATED: enriched GeoJSON (deployed)
├── Quartiersatlas_2024_Daten.xlsx   # Source Excel (not deployed)
├── Sozialräume_WGS84_4326_0.geojson # Source GeoJSON (not deployed)
└── Spec_Sheet_...md                  # Specification (not deployed)
```

**Deployment scope:** Only `index.html`, `css/`, `js/`, and `data/` are deployed to the server.

---

## Data Model Notes

**GeoJSON source:** 171 features, property `SOZIALRAUM_ID` (6-digit string like `"063007"`), property `STADTBEZIRK` (integer).

**Excel source:** 171 rows × 52 columns. Column headers use Unicode (ö, ü, –, ², ‰). Key columns by index:
- 0: Sozialraum-ID, 1: Stadtbezirk, 2: Name
- 21: Ausländer %, 22: Migrationshintergrund %, 23: Wanderungssaldo ‰, 24: Fluktuationsrate
- 31: Arbeitslosenquote %, 33: SGB-II-Quote %, 34: Kinderarmut %, 35: Altersarmut %, 36: Mindestsicherung %
- 44: Übergang Gym. %

**Special cases:**
- `071009` (Glasmacherviertel): unbewohnt, all indicator values are `None` → display greyed out
- `033001` / `032001`: gemeinsam typisiert → both receive `032001`'s composite index values

**Composite index calculation:**

*Sozialer Handlungsbedarf* = mean of z-scores for: Arbeitslosenquote, SGB-II-Quote, Kinderarmut, Altersarmut, Mindestsicherung, Übergang Gymnasium (inverted).

*Fluktuation* = z-score of: Fluktuationsrate.

> **Important:** These indicator selections are based on standard Quartiersatlas methodology. Verify against the PDF (pp. 4–7) and adjust `SOZIAL_INDICATORS` / `FLUKTUATION_INDICATORS` in `prepare_data.py` if needed.

**Typisierung** (z-Wert → category):
| z-Wert | Typ |
|---|---|
| < −1.0 | gering |
| −1.0 bis < −0.5 | eher gering |
| −0.5 bis < +0.5 | mittel |
| +0.5 bis < +1.0 | erhöht |
| ≥ +1.0 | hoch |

---

### Task 1: ETL Script — Read Excel Data

**Files:**
- Create: `scripts/prepare_data.py`

- [ ] **Step 1: Create the ETL script with Excel reading and constants**

```python
#!/usr/bin/env python3
"""Quartiersatlas ETL: Excel + GeoJSON → enriched GeoJSON for the interactive map."""

import json
import math
from pathlib import Path

import openpyxl

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
EXCEL_PATH = ROOT / "Quartiersatlas_2024_Daten.xlsx"
GEOJSON_INPUT = ROOT / "Sozialräume_WGS84_4326_0.geojson"
GEOJSON_OUTPUT = ROOT / "data" / "sozialraeume.geojson"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
UNBEWOHNT_ID = "071009"
GEMEINSAM_IDS = ("032001", "033001")  # 033001 receives 032001's index values

# Indicators for composite indices: (excel_col_index, clean_key, invert)
# "invert" means higher raw value = LESS social need (so z-score is negated)
SOZIAL_INDICATORS = [
    (31, "arbeitslosenquote", False),
    (33, "sgb2_quote", False),
    (34, "kinderarmut", False),
    (35, "altersarmut", False),
    (36, "mindestsicherung", False),
    (44, "uebergang_gym", True),      # higher gymnasium rate = less need → invert
]

FLUKTUATION_INDICATORS = [
    (24, "fluktuationsrate", False),
]

# Raw indicators to include in output GeoJSON: (excel_col_index, property_key)
RAW_PROPERTIES = [
    (3,  "bevoelkerung"),
    (4,  "weiblich_pct"),
    (19, "jugendquotient"),
    (20, "altenquotient"),
    (21, "auslaender_pct"),
    (22, "migration_pct"),
    (23, "wanderungssaldo"),
    (24, "fluktuationsrate"),
    (25, "haushalte"),
    (26, "einpersonen_hh_pct"),
    (27, "hh_kinder_pct"),
    (28, "alleinerziehende_pct"),
    (29, "senioren_single_pct"),
    (30, "arbeitslose"),
    (31, "arbeitslosenquote_pct"),
    (32, "sgb2_personen"),
    (33, "sgb2_quote_pct"),
    (34, "kinderarmut_pct"),
    (35, "altersarmut_pct"),
    (36, "mindestsicherung_pct"),
    (37, "wohngeld_hh_pct"),
    (44, "uebergang_gym_pct"),
    (45, "wohnflaeche_m2_ew"),
    (46, "oeff_gef_whg_pct"),
    (47, "wohneigentum_pct"),
    (48, "flaeche_ha"),
    (49, "bev_dichte_km2"),
    (51, "gruenflaeche_pct"),
]


# ---------------------------------------------------------------------------
# Excel reading
# ---------------------------------------------------------------------------
def read_excel():
    """Read Excel → list of dicts with column-index keys plus 'id', 'name', 'stadtbezirk'."""
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    ws = wb["Profildaten"]

    records = []
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, values_only=True):
        if row[0] is None:
            continue
        rec = {i: row[i] for i in range(len(row))}
        rec["id"] = str(row[0])
        rec["name"] = row[2]
        rec["stadtbezirk"] = row[1]
        records.append(rec)
    return records


# ---------------------------------------------------------------------------
# Main (temporary — will be extended in later tasks)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    records = read_excel()
    print(f"Read {len(records)} records")
    print(f"Sample: {records[0]['id']} — {records[0]['name']}")
```

- [ ] **Step 2: Run the script to verify Excel reading**

Run: `python scripts/prepare_data.py`

Expected output:
```
Read 171 records
Sample: 011001 — Altstadt
```

- [ ] **Step 3: Commit**

```bash
git init
git add scripts/prepare_data.py
git commit -m "feat: add ETL script with Excel reading"
```

---

### Task 2: ETL — z-Wert Calculation and Typisierung

**Files:**
- Modify: `scripts/prepare_data.py`

- [ ] **Step 1: Add z-score and classification functions after `read_excel()`**

```python
# ---------------------------------------------------------------------------
# z-Wert calculation
# ---------------------------------------------------------------------------
def calc_z_scores(records, col_idx, exclude_ids=None):
    """Calculate z-scores for one column. Returns dict {sozialraum_id: z_value}."""
    exclude = exclude_ids or set()
    vals = {}
    for r in records:
        if r["id"] in exclude or r[col_idx] is None:
            continue
        vals[r["id"]] = float(r[col_idx])

    if len(vals) < 2:
        return {}

    n = len(vals)
    mean = sum(vals.values()) / n
    variance = sum((v - mean) ** 2 for v in vals.values()) / n
    std = math.sqrt(variance) if variance > 0 else 1.0
    return {sid: (v - mean) / std for sid, v in vals.items()}


def classify_z(z):
    """Map a z-value to one of the five Typisierung labels."""
    if z is None:
        return None
    if z < -1.0:
        return "gering"
    if z < -0.5:
        return "eher gering"
    if z < 0.5:
        return "mittel"
    if z < 1.0:
        return "erhöht"
    return "hoch"


def calc_composite(z_dicts):
    """Average multiple z-score dicts into a single composite index dict."""
    all_ids = set()
    for zd in z_dicts:
        all_ids.update(zd.keys())

    result = {}
    for sid in all_ids:
        values = [zd[sid] for zd in z_dicts if sid in zd]
        if values:
            result[sid] = sum(values) / len(values)
    return result
```

- [ ] **Step 2: Add `process_indices()` function**

```python
def process_indices(records):
    """Calculate composite z-Werte for Sozial and Fluktuation indices."""
    exclude = {UNBEWOHNT_ID}

    # Individual z-scores for Sozial indicators
    sozial_z_list = []
    sozial_z_by_key = {}
    for col_idx, key, invert in SOZIAL_INDICATORS:
        z = calc_z_scores(records, col_idx, exclude)
        if invert:
            z = {sid: -v for sid, v in z.items()}
        sozial_z_list.append(z)
        sozial_z_by_key[key] = z

    # Individual z-scores for Fluktuation indicators
    flukt_z_list = []
    flukt_z_by_key = {}
    for col_idx, key, invert in FLUKTUATION_INDICATORS:
        z = calc_z_scores(records, col_idx, exclude)
        if invert:
            z = {sid: -v for sid, v in z.items()}
        flukt_z_list.append(z)
        flukt_z_by_key[key] = z

    # Composite indices
    idx_sozial = calc_composite(sozial_z_list)
    idx_flukt = calc_composite(flukt_z_list)

    # Gemeinsam typisiert: 033001 receives 032001's composite values
    src, tgt = GEMEINSAM_IDS
    for idx in [idx_sozial, idx_flukt]:
        if src in idx:
            idx[tgt] = idx[src]

    return idx_sozial, idx_flukt, sozial_z_by_key, flukt_z_by_key
```

- [ ] **Step 3: Update `__main__` to test the calculation**

Replace the `if __name__` block:

```python
if __name__ == "__main__":
    records = read_excel()
    idx_sozial, idx_flukt, _, _ = process_indices(records)

    print(f"Sozial index: {len(idx_sozial)} Sozialräume")
    print(f"Fluktuation index: {len(idx_flukt)} Sozialräume")

    for sid in ["011001", "071009", "032001", "033001"]:
        zs = idx_sozial.get(sid)
        zf = idx_flukt.get(sid)
        zs_str = f"{zs:.3f}" if zs is not None else "None"
        zf_str = f"{zf:.3f}" if zf is not None else "None"
        print(f"  {sid}: z_sozial={zs_str} ({classify_z(zs)}), z_flukt={zf_str} ({classify_z(zf)})")
```

- [ ] **Step 4: Run and verify**

Run: `python scripts/prepare_data.py`

Expected:
- 170 Sozialräume for each index (071009 excluded)
- 071009 shows `None` for both indices
- 032001 and 033001 show identical values

- [ ] **Step 5: Commit**

```bash
git add scripts/prepare_data.py
git commit -m "feat: add z-Wert calculation and Typisierung classification"
```

---

### Task 3: ETL — GeoJSON Merge and Output

**Files:**
- Modify: `scripts/prepare_data.py`

- [ ] **Step 1: Add `build_enriched_properties()` and `merge_geojson()` functions**

```python
# ---------------------------------------------------------------------------
# GeoJSON enrichment
# ---------------------------------------------------------------------------
def build_enriched_properties(records, idx_sozial, idx_flukt, sozial_z_by_key, flukt_z_by_key):
    """Build a dict {sozialraum_id: {property_key: value, ...}} for GeoJSON merge."""
    enriched = {}
    for rec in records:
        sid = rec["id"]
        props = {
            "name": rec["name"],
            "stadtbezirk": rec["stadtbezirk"],
            "unbewohnt": sid == UNBEWOHNT_ID,
        }

        # Raw indicator values
        for col_idx, key in RAW_PROPERTIES:
            props[key] = rec.get(col_idx)

        # Composite z-Werte and Typisierung
        zs = idx_sozial.get(sid)
        zf = idx_flukt.get(sid)
        props["z_sozial"] = round(zs, 4) if zs is not None else None
        props["z_fluktuation"] = round(zf, 4) if zf is not None else None
        props["typ_sozial"] = classify_z(zs)
        props["typ_fluktuation"] = classify_z(zf)

        # Individual z-scores for the index components
        for key, z_dict in sozial_z_by_key.items():
            props[f"z_{key}"] = round(z_dict[sid], 4) if sid in z_dict else None
        for key, z_dict in flukt_z_by_key.items():
            props[f"z_{key}"] = round(z_dict[sid], 4) if sid in z_dict else None

        enriched[sid] = props
    return enriched


def merge_geojson(enriched):
    """Read source GeoJSON, merge enriched properties, write output."""
    with open(GEOJSON_INPUT, "r", encoding="utf-8") as f:
        geojson = json.load(f)

    matched = 0
    for feature in geojson["features"]:
        sid = feature["properties"]["SOZIALRAUM_ID"]
        if sid in enriched:
            feature["properties"].update(enriched[sid])
            matched += 1
        else:
            # Fallback: mark as unbewohnt if no data found
            feature["properties"]["unbewohnt"] = True
            feature["properties"]["name"] = "Unbekannt"

    GEOJSON_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(GEOJSON_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    print(f"Matched {matched}/{len(geojson['features'])} features")
    print(f"Output: {GEOJSON_OUTPUT} ({GEOJSON_OUTPUT.stat().st_size / 1024:.0f} KB)")
```

- [ ] **Step 2: Replace `__main__` with full pipeline**

```python
if __name__ == "__main__":
    print("Reading Excel...")
    records = read_excel()
    print(f"  {len(records)} records")

    print("Calculating z-Werte...")
    idx_sozial, idx_flukt, sozial_z_by_key, flukt_z_by_key = process_indices(records)
    print(f"  Sozial: {len(idx_sozial)} | Fluktuation: {len(idx_flukt)}")

    print("Building properties...")
    enriched = build_enriched_properties(records, idx_sozial, idx_flukt, sozial_z_by_key, flukt_z_by_key)

    print("Merging into GeoJSON...")
    merge_geojson(enriched)

    # Spot-check
    print("\nSpot-check:")
    for sid in ["011001", "071009", "032001", "033001"]:
        e = enriched.get(sid, {})
        print(f"  {sid} ({e.get('name', '?')}): "
              f"typ_s={e.get('typ_sozial')}, typ_f={e.get('typ_fluktuation')}, "
              f"z_s={e.get('z_sozial')}, z_f={e.get('z_fluktuation')}, "
              f"unbewohnt={e.get('unbewohnt')}")
```

- [ ] **Step 3: Run the full ETL pipeline**

Run: `python scripts/prepare_data.py`

Expected:
```
Reading Excel...
  171 records
Calculating z-Werte...
  Sozial: 170 | Fluktuation: 170
Building properties...
Merging into GeoJSON...
Matched 171/171 features
Output: ...\data\sozialraeume.geojson (XXXX KB)

Spot-check:
  011001 (Altstadt): typ_s=..., typ_f=..., z_s=..., z_f=..., unbewohnt=False
  071009 (Glasmacherviertel): typ_s=None, typ_f=None, z_s=None, z_f=None, unbewohnt=True
  032001 (...): typ_s=..., typ_f=..., ...
  033001 (...): typ_s=... (same as 032001), ...
```

- [ ] **Step 4: Validate the output GeoJSON**

Run: `python -c "import json; d=json.load(open('data/sozialraeume.geojson','r',encoding='utf-8')); f=d['features'][0]['properties']; print(sorted(f.keys()))"`

Expected: property keys include `SOZIALRAUM_ID`, `STADTBEZIRK`, `name`, `z_sozial`, `z_fluktuation`, `typ_sozial`, `typ_fluktuation`, `unbewohnt`, plus all raw indicator keys.

- [ ] **Step 5: Commit**

```bash
git add scripts/prepare_data.py data/sozialraeume.geojson
git commit -m "feat: complete ETL pipeline — enriched GeoJSON with z-Werte and Typisierung"
```

---

### Task 4: HTML Structure

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quartiersatlas Düsseldorf 2024</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossorigin="" />
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <div id="map"></div>

    <div id="layer-control">
        <h3>Kartenansicht</h3>
        <label>
            <input type="radio" name="layer" value="sozial" checked>
            Sozialer Handlungsbedarf
        </label>
        <label>
            <input type="radio" name="layer" value="fluktuation">
            Fluktuation
        </label>
    </div>

    <div id="legend"></div>

    <div id="footer">
        Datenquellen: Quartiersatlas 2024 – Landeshauptstadt Düsseldorf, Amt für Statistik und Wahlen |
        Sozialraumgrenzen: Open Data Düsseldorf (Datenlizenz Deutschland – Zero) |
        Kartendaten: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
            integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
            crossorigin=""></script>
    <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add HTML structure with Leaflet CDN"
```

---

### Task 5: CSS Styling

**Files:**
- Create: `css/style.css`

- [ ] **Step 1: Create `css/style.css`**

```css
/* === Reset & Layout === */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html, body {
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    color: #333;
}

#map {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
}

/* === Layer Control === */
#layer-control {
    position: absolute;
    top: 80px;
    right: 10px;
    z-index: 1000;
    background: white;
    padding: 12px 16px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    max-width: 220px;
}

#layer-control h3 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

#layer-control label {
    display: block;
    padding: 4px 0;
    cursor: pointer;
    font-size: 13px;
}

#layer-control input[type="radio"] {
    margin-right: 6px;
}

/* === Legend === */
#legend {
    position: absolute;
    bottom: 40px;
    right: 10px;
    z-index: 1000;
    background: white;
    padding: 12px 16px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    min-width: 180px;
}

#legend h4 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
    color: #555;
}

.legend-item {
    display: flex;
    align-items: center;
    margin-bottom: 4px;
    font-size: 12px;
}

.legend-color {
    width: 20px;
    height: 14px;
    margin-right: 8px;
    border: 1px solid #ccc;
    border-radius: 2px;
    flex-shrink: 0;
}

.legend-label {
    flex: 1;
}

.legend-unbewohnt {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid #eee;
}

/* === Footer === */
#footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: rgba(255, 255, 255, 0.9);
    padding: 4px 12px;
    font-size: 11px;
    color: #666;
    text-align: center;
}

#footer a {
    color: #555;
}

/* === Popup === */
.sr-popup {
    max-width: 320px;
    max-height: 400px;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.5;
}

.sr-popup h3 {
    font-size: 15px;
    margin-bottom: 4px;
    color: #222;
}

.sr-popup .popup-id {
    font-weight: normal;
    color: #888;
    font-size: 12px;
}

.sr-popup .popup-bezirk {
    font-size: 12px;
    color: #888;
    margin-bottom: 10px;
}

.sr-popup .popup-indices {
    margin-bottom: 10px;
    padding: 8px;
    background: #f8f8f8;
    border-radius: 4px;
}

.sr-popup .popup-index-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 0;
}

.sr-popup .popup-index-label {
    font-size: 12px;
    color: #555;
}

.sr-popup .popup-index-value {
    font-weight: 600;
    font-size: 12px;
}

.sr-popup .popup-z {
    font-weight: normal;
    color: #888;
    font-size: 11px;
    margin-left: 4px;
}

.sr-popup h4 {
    font-size: 12px;
    font-weight: 600;
    color: #555;
    margin: 10px 0 4px 0;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid #eee;
    padding-bottom: 2px;
}

.sr-popup table {
    width: 100%;
    border-collapse: collapse;
}

.sr-popup td {
    padding: 2px 0;
    font-size: 12px;
}

.sr-popup td:last-child {
    text-align: right;
    font-weight: 500;
}

.sr-popup .unbewohnt-msg {
    text-align: center;
    color: #999;
    font-style: italic;
    padding: 20px 0;
}

/* === Typ colors for popup badges === */
.typ-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
}

.typ-gering         { background: #2d8e4e; color: white; }
.typ-eher-gering    { background: #8cc68c; color: #1a4d2e; }
.typ-mittel          { background: #e8e8e8; color: #555; }
.typ-erhoeht         { background: #f4b084; color: #7a3a00; }
.typ-hoch            { background: #e05070; color: white; }

/* === Tooltip === */
.sr-tooltip {
    font-size: 13px;
    line-height: 1.4;
    padding: 6px 10px;
}

.sr-tooltip .tooltip-name {
    font-weight: 600;
}

.sr-tooltip .tooltip-id {
    color: #888;
    font-size: 11px;
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p css
git add css/style.css
git commit -m "feat: add CSS styling for map, legend, popups, and controls"
```

---

### Task 6: Map Initialization and Choropleth Rendering

**Files:**
- Create: `js/app.js`

- [ ] **Step 1: Create `js/app.js` with map initialization and choropleth**

```javascript
(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Configuration
    // -----------------------------------------------------------------------
    var CENTER = [51.2277, 6.7735];
    var ZOOM = 12;
    var currentLayer = 'sozial';

    var COLORS = {
        gering:        '#2d8e4e',
        'eher gering': '#8cc68c',
        mittel:        '#f0f0f0',
        'erhöht':      '#f4b084',
        hoch:          '#e05070',
        unbewohnt:     '#d3d3d3',
    };

    var TYP_LABELS = [
        { typ: 'gering',        label: 'gering',        range: 'z < −1,0' },
        { typ: 'eher gering',   label: 'eher gering',   range: '−1,0 bis < −0,5' },
        { typ: 'mittel',        label: 'mittel',         range: '−0,5 bis < +0,5' },
        { typ: 'erhöht',        label: 'erhöht',         range: '+0,5 bis < +1,0' },
        { typ: 'hoch',          label: 'hoch',           range: '≥ +1,0' },
    ];

    var LAYER_TITLES = {
        sozial: 'Sozialer Handlungsbedarf',
        fluktuation: 'Fluktuation',
    };

    // -----------------------------------------------------------------------
    // Map setup
    // -----------------------------------------------------------------------
    var map = L.map('map', {
        zoomControl: true,
    }).setView(CENTER, ZOOM);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '',  // attribution is in the footer
        subdomains: 'abcd',
        maxZoom: 19,
    }).addTo(map);

    // -----------------------------------------------------------------------
    // Style functions
    // -----------------------------------------------------------------------
    function getZValue(props) {
        return currentLayer === 'sozial' ? props.z_sozial : props.z_fluktuation;
    }

    function getTyp(props) {
        return currentLayer === 'sozial' ? props.typ_sozial : props.typ_fluktuation;
    }

    function getColor(z) {
        if (z == null) return COLORS.unbewohnt;
        if (z < -1.0) return COLORS.gering;
        if (z < -0.5) return COLORS['eher gering'];
        if (z < 0.5)  return COLORS.mittel;
        if (z < 1.0)  return COLORS['erhöht'];
        return COLORS.hoch;
    }

    function getStyle(feature) {
        var props = feature.properties;
        if (props.unbewohnt) {
            return {
                fillColor: COLORS.unbewohnt,
                fillOpacity: 0.4,
                weight: 1,
                color: '#aaa',
                dashArray: '3',
            };
        }
        var z = getZValue(props);
        var isVeryHigh = z != null && z >= 1.5;
        return {
            fillColor: getColor(z),
            fillOpacity: 0.7,
            weight: isVeryHigh ? 3 : 1,
            color: isVeryHigh ? '#444' : '#666',
        };
    }

    function highlightStyle() {
        return {
            weight: 3,
            color: '#333',
            fillOpacity: 0.85,
        };
    }

    // -----------------------------------------------------------------------
    // Tooltip
    // -----------------------------------------------------------------------
    function createTooltipContent(props) {
        if (props.unbewohnt) {
            return '<div class="sr-tooltip">'
                + '<div class="tooltip-name">' + (props.name || 'Unbewohnt') + '</div>'
                + '<div class="tooltip-id">' + props.SOZIALRAUM_ID + ' — keine Daten (unbewohnt)</div>'
                + '</div>';
        }
        var typ = getTyp(props) || '–';
        return '<div class="sr-tooltip">'
            + '<div class="tooltip-name">' + props.name + '</div>'
            + '<div class="tooltip-id">' + props.SOZIALRAUM_ID
            + ' · ' + LAYER_TITLES[currentLayer] + ': ' + typ + '</div>'
            + '</div>';
    }

    // -----------------------------------------------------------------------
    // Popup
    // -----------------------------------------------------------------------
    var POPUP_SECTIONS = [
        {
            title: 'Bevölkerung',
            rows: [
                ['bevoelkerung', 'Einwohner', ''],
                ['auslaender_pct', 'Ausländer', '%'],
                ['migration_pct', 'Migrationshintergrund', '%'],
                ['jugendquotient', 'Jugendquotient', ''],
                ['altenquotient', 'Altenquotient', ''],
            ],
        },
        {
            title: 'Soziales',
            rows: [
                ['arbeitslosenquote_pct', 'Arbeitslosenquote', '%'],
                ['sgb2_quote_pct', 'SGB-II-Quote', '%'],
                ['kinderarmut_pct', 'Kinderarmut', '%'],
                ['altersarmut_pct', 'Altersarmut', '%'],
                ['mindestsicherung_pct', 'Mindestsicherung', '%'],
                ['wohngeld_hh_pct', 'Wohngeld-HH', '%'],
            ],
        },
        {
            title: 'Bildung',
            rows: [
                ['uebergang_gym_pct', 'Übergang Gymnasium', '%'],
            ],
        },
        {
            title: 'Wohnen & Fluktuation',
            rows: [
                ['fluktuationsrate', 'Fluktuationsrate', ''],
                ['wanderungssaldo', 'Wanderungssaldo', '‰'],
                ['wohnflaeche_m2_ew', 'Wohnfläche', 'm²/EW'],
                ['wohneigentum_pct', 'Wohneigentum', '%'],
                ['oeff_gef_whg_pct', 'Öff. gef. Wohnungen', '%'],
                ['bev_dichte_km2', 'Bevölkerungsdichte', '/km²'],
            ],
        },
    ];

    function typCssClass(typ) {
        if (!typ) return 'typ-mittel';
        return 'typ-' + typ.replace(/\s+/g, '-').replace(/ö/g, 'oe');
    }

    function formatValue(val, unit) {
        if (val == null) return '–';
        if (typeof val === 'number') {
            var formatted = val.toLocaleString('de-DE', { maximumFractionDigits: 1 });
            return unit ? formatted + ' ' + unit : formatted;
        }
        return String(val);
    }

    function createPopupContent(props) {
        if (props.unbewohnt) {
            return '<div class="sr-popup">'
                + '<h3>' + (props.name || 'Unbewohnt')
                + ' <span class="popup-id">(' + props.SOZIALRAUM_ID + ')</span></h3>'
                + '<p class="unbewohnt-msg">Keine Daten – unbewohnter Sozialraum</p>'
                + '</div>';
        }

        var html = '<div class="sr-popup">';
        html += '<h3>' + props.name + ' <span class="popup-id">(' + props.SOZIALRAUM_ID + ')</span></h3>';
        html += '<div class="popup-bezirk">Stadtbezirk ' + props.stadtbezirk + '</div>';

        // Index overview
        html += '<div class="popup-indices">';
        var indices = [
            { label: 'Sozialer Handlungsbedarf', typ: props.typ_sozial, z: props.z_sozial },
            { label: 'Fluktuation', typ: props.typ_fluktuation, z: props.z_fluktuation },
        ];
        for (var i = 0; i < indices.length; i++) {
            var idx = indices[i];
            var zStr = idx.z != null ? idx.z.toFixed(2) : '–';
            html += '<div class="popup-index-row">';
            html += '<span class="popup-index-label">' + idx.label + '</span>';
            html += '<span class="popup-index-value">'
                + '<span class="typ-badge ' + typCssClass(idx.typ) + '">' + (idx.typ || '–') + '</span>'
                + '<span class="popup-z">(z = ' + zStr + ')</span>'
                + '</span>';
            html += '</div>';
        }
        html += '</div>';

        // Detail sections
        for (var s = 0; s < POPUP_SECTIONS.length; s++) {
            var section = POPUP_SECTIONS[s];
            html += '<h4>' + section.title + '</h4>';
            html += '<table>';
            for (var r = 0; r < section.rows.length; r++) {
                var row = section.rows[r];
                html += '<tr><td>' + row[1] + '</td><td>' + formatValue(props[row[0]], row[2]) + '</td></tr>';
            }
            html += '</table>';
        }

        html += '</div>';
        return html;
    }

    // -----------------------------------------------------------------------
    // GeoJSON layer
    // -----------------------------------------------------------------------
    var geojsonLayer;

    function onEachFeature(feature, layer) {
        layer.bindTooltip(function () {
            return createTooltipContent(feature.properties);
        }, { sticky: true, className: '' });

        layer.on({
            mouseover: function (e) {
                if (!feature.properties.unbewohnt) {
                    e.target.setStyle(highlightStyle());
                    e.target.bringToFront();
                }
            },
            mouseout: function (e) {
                geojsonLayer.resetStyle(e.target);
            },
            click: function (e) {
                map.fitBounds(e.target.getBounds(), { padding: [50, 50] });
                e.target.bindPopup(createPopupContent(feature.properties), {
                    maxWidth: 340,
                    maxHeight: 420,
                }).openPopup();
            },
        });
    }

    fetch('data/sozialraeume.geojson')
        .then(function (response) { return response.json(); })
        .then(function (data) {
            geojsonLayer = L.geoJSON(data, {
                style: getStyle,
                onEachFeature: onEachFeature,
            }).addTo(map);

            createLegend();
            setupLayerControl();
        });

    // -----------------------------------------------------------------------
    // Layer control
    // -----------------------------------------------------------------------
    function setupLayerControl() {
        var radios = document.querySelectorAll('#layer-control input[name="layer"]');
        for (var i = 0; i < radios.length; i++) {
            radios[i].addEventListener('change', function () {
                currentLayer = this.value;
                geojsonLayer.setStyle(getStyle);
                updateLegend();
            });
        }
    }

    // -----------------------------------------------------------------------
    // Legend
    // -----------------------------------------------------------------------
    function createLegend() {
        updateLegend();
    }

    function updateLegend() {
        var container = document.getElementById('legend');
        var html = '<h4>' + LAYER_TITLES[currentLayer] + '</h4>';

        for (var i = 0; i < TYP_LABELS.length; i++) {
            var item = TYP_LABELS[i];
            html += '<div class="legend-item">';
            html += '<span class="legend-color" style="background:' + COLORS[item.typ] + '"></span>';
            html += '<span class="legend-label">' + item.label + ' <small>(' + item.range + ')</small></span>';
            html += '</div>';
        }

        html += '<div class="legend-item legend-unbewohnt">';
        html += '<span class="legend-color" style="background:' + COLORS.unbewohnt + '"></span>';
        html += '<span class="legend-label">keine Daten (unbewohnt)</span>';
        html += '</div>';

        container.innerHTML = html;
    }

})();
```

- [ ] **Step 2: Verify in browser**

Open `index.html` in a browser (use a local server for fetch to work):

Run: `cd sozialraum_map && python -m http.server 8000`

Open `http://localhost:8000` in the browser. Verify:
- Map centered on Düsseldorf with CartoDB Positron tiles
- All 171 Sozialräume rendered as colored polygons
- Default view shows "Sozialer Handlungsbedarf" choropleth
- 071009 is greyed out with dashed border

- [ ] **Step 3: Commit**

```bash
mkdir -p js
git add js/app.js
git commit -m "feat: add map initialization, choropleth rendering, tooltips, popups, layer control, and legend"
```

---

### Task 7: Interaction Verification

**Files:** None (manual testing)

- [ ] **Step 1: Verify hover effects**

With `python -m http.server 8000` running, open `http://localhost:8000`:

- Hover over a Sozialraum → border thickens, opacity increases
- Hover over 071009 → no highlight (unbewohnt)
- Tooltip shows name, ID, and current layer Typisierung
- Tooltip follows mouse (sticky)

- [ ] **Step 2: Verify click popups**

- Click a Sozialraum → popup appears with:
  - Name and ID in header
  - Stadtbezirk number
  - Both Typisierungen with colored badges and z-Werte
  - Indicator tables (Bevölkerung, Soziales, Bildung, Wohnen)
- Click 071009 → popup shows "Keine Daten – unbewohnter Sozialraum"
- Map zooms to fit clicked polygon

- [ ] **Step 3: Verify layer toggle**

- Click "Fluktuation" radio button → map recolors, legend title updates
- Click "Sozialer Handlungsbedarf" → map recolors back
- Tooltips reflect the currently selected layer

- [ ] **Step 4: Verify legend**

- Legend shows 5 color categories + unbewohnt
- z-Wert ranges displayed correctly
- Legend title changes when switching layers

- [ ] **Step 5: Verify special cases**

- Check that 032001 and 033001 show the same Typisierung values in their popups
- Check that 071009 is greyed out and shows "keine Daten (unbewohnt)"
- Check that polygons with z ≥ 1.5 have thicker borders

- [ ] **Step 6: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix: address issues found during interaction testing"
```

(Skip this step if no issues found.)

---

### Task 8: Final Polish

**Files:**
- Possibly modify: `css/style.css`, `js/app.js`, `index.html`

- [ ] **Step 1: Test responsive behavior**

- Resize browser to mobile width → map fills viewport, controls remain visible
- Touch-zoom works on mobile (can test via browser dev tools)

- [ ] **Step 2: Test cross-browser**

- Open in Chrome, Firefox, Edge → verify map renders correctly in all

- [ ] **Step 3: Verify attribution footer**

- Footer visible at bottom with all three data source attributions
- Links work (OpenStreetMap, CARTO)

- [ ] **Step 4: Check GeoJSON file size**

Run: `ls -la data/sozialraeume.geojson`

Verify file is under 5 MB (should be ~1.8 MB).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Quartiersatlas interactive map MVP complete"
```

---

## Deployment

After all tasks are complete, deploy to the Hetzner server:

```bash
# From local machine — deploy only the static assets
rsync -avz --include='index.html' \
           --include='css/***' \
           --include='js/***' \
           --include='data/***' \
           --exclude='*' \
           sozialraum_map/ user@server:/var/www/quartiersatlas/
```

Follow the Nginx setup instructions in the spec sheet (Section 6.2).

---

## Open Questions

1. **z-Wert indicator selection:** The indicators used for composite indices (defined in `SOZIAL_INDICATORS` / `FLUKTUATION_INDICATORS` in `prepare_data.py`) are based on standard Quartiersatlas methodology. Verify against the PDF (pp. 4–7) and adjust if the methodology uses different indicators.

2. **033001 / 032001 handling:** Currently 033001 receives 032001's composite index values. Verify this matches the PDF's approach — it may need combined raw data instead.

3. **Phase 2 scope:** The popup currently shows ~20 key indicators. Phase 2 can add all ~50 indicators from the Profilseiten, a search function, Spinnendiagramm, and Stadtbezirksgrenzen overlay.
