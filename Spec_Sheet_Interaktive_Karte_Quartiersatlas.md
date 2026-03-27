# Spec Sheet: Interaktive Karte — Quartiersatlas Düsseldorf 2024

**Version:** 1.0  
**Datum:** 27. März 2026  
**Quelle:** Quartiersatlas 2024 – Sozialer Handlungsbedarf und Fluktuation (Statistik & Stadtforschung Nr. 61, Amt für Statistik und Wahlen, Landeshauptstadt Düsseldorf)

---

## 1. Projektziel

Überführung des 215-seitigen PDF-Berichts „Quartiersatlas 2024" in eine interaktive, browser-basierte Karte. Nutzer sollen Düsseldorfs 170 Sozialräume visuell explorieren und Kennzahlen zu sozialem Handlungsbedarf und Fluktuation pro Quartier abrufen können.
Daten liegen bereits als Excel Tabelle vor.

**Zielgruppe:** Fachämter, politische Entscheidungsträger, Stadtplaner, interessierte Bürger.

**Deployment-Ziel:** Statische Website auf Hetzner Ubuntu Server (Nginx).

---

## 2. Datenquellen

### 2.1 Geodaten (Polygone der Sozialräume)

| Eigenschaft | Wert |
|---|---|
| Quelle | Open Data Düsseldorf |
| URL | `https://opendata.duesseldorf.de/sites/default/files/Sozialräume_WGS84_4326_0.geojson` |
| Stand | 31.12.2021 |
| Referenzsystem | WGS84 (EPSG:4326) |
| Raumeinheiten | 171 Sozialräume |
| Lizenz | Datenlizenz Deutschland – Zero – Version 2.0 |
| Format | GeoJSON |

**Hinweis:** Der Quartiersatlas 2024 arbeitet mit 170 Sozialräumen (Sozialraum 071009 ist unbewohnt). Die GeoJSON-Datei enthält 171 Polygone.
071009 ist im GeoJSON als Polygon vorhanden, wird im Quartiersatlas aber als unbewohnt geführt und hat keine Typisierung. Diesen Sozialraum solltest du ausgegraut darstellen mit einem Tooltip „keine Daten (unbewohnt)".
033001 und 032001 werden im PDF gemeinsam typisiert, weil die Daten für 033001 nicht separat ausgewiesen werden können. Beide Polygone existieren einzeln im GeoJSON — sie bekommen also den gleichen Typisierungswert zugewiesen.

### 2.2 Sachdaten (Indikatoren pro Sozialraum)

Excel Tabelle Quartiersatlas_2024_Daten



### 2.3 Profilseiten-Daten (optional, Phase 2)

Jeder Sozialraum hat im PDF eine Profilseite (Seiten 8–189) mit ca. 50 Indikatoren in den Kategorien Bevölkerung, Haushalte, Soziales, Bildung, Wohnen und Fläche. Diese könnten in einer zweiten Phase als Detail-Popup integriert werden.

---

## 3. Funktionale Anforderungen

### 3.1 Kartenansicht (Kernfunktion)

| Anforderung | Beschreibung |
|---|---|
| **Basiskarte** | OpenStreetMap-Tiles als Hintergrundkarte |
| **Choropleth-Darstellung** | Sozialräume eingefärbt nach Typisierung (5-stufige Farbskala) |
| **Layer-Umschalter** | Auswählen der verschiedenen Kriterien als Overlay.|
| **Zoom & Pan** | Standardmäßige Kartennavigation, Anfangszoom auf Düsseldorf-Stadtgebiet |
| **Startansicht** | Zentriert auf Düsseldorf (ca. 51.2277° N, 6.7735° E), Zoomstufe ~12 |

### 3.2 Interaktion

| Anforderung | Beschreibung |
|---|---|
| **Hover-Effekt** | Beim Überfahren: Sozialraum hervorheben + Tooltip mit Name, Nummer und Typ |
| **Klick-Popup** | Beim Klicken: Detail-Panel mit allen z-Werten und dem Gesamtindex |
| **Stadtbezirksgrenzen** | Optional als überlagernde Linienschicht (dickere Grenzen) |
| **Legende** | Farbkodierung mit Erklärung der 5 Typisierungsstufen + z-Wert-Bereiche |

### 3.3 Farbschema

Angelehnt an die Originaldarstellung im PDF (Seiten 195/197):

| Typ | Farbe (Sozial) | Farbe (Fluktuation) | z-Wert-Bereich |
|---|---|---|---|
| gering | `#2d8e4e` (Dunkelgrün) | `#2d8e4e` | < -1,0 |
| eher gering | `#8cc68c` (Hellgrün) | `#8cc68c` | -1,0 bis < -0,5 |
| mittel | `#f0f0f0` (Hellgrau) | `#f0f0f0` | -0,5 bis < +0,5 |
| erhöht | `#f4b084` (Hellorange) | `#f4b084` | +0,5 bis < +1,0 |
| hoch | `#e05070` (Rot/Pink) | `#e05070` | ≥ +1,0 |

Zusätzlich: Sozialräume mit „sehr hohen" z-Werten (≥ +1,5) erhalten einen dickeren Rand oder ein Schraffurmuster zur besonderen Hervorhebung (12 Sozialräume bei Sozial, 11 bei Fluktuation).

---

## 4. Technische Architektur

### 4.1 Stack

| Komponente | Technologie | Begründung |
|---|---|---|
| **Karte** | Leaflet.js 1.9+ | Leichtgewichtig, Open Source, GeoJSON-native |
| **Tiles** | OpenStreetMap / CartoDB Positron | Neutral, kostenlos, kein API-Key nötig |
| **Frontend** | Vanilla HTML/CSS/JS (Single Page) | Keine Build-Pipeline nötig, minimale Komplexität |
| **Datenformat** | GeoJSON + eingebettete Properties | Alles in einer Datei, keine DB nötig |
| **Hosting** | Nginx auf Hetzner Ubuntu | Rein statisch, performant, einfach |

### 4.2 Dateistruktur

```
quartiersatlas/
├── index.html              # Hauptseite mit Leaflet-Karte
├── css/
│   └── style.css           # Styling für Legende, Popups, Controls
├── js/
│   └── app.js              # Kartenlogik, Layer-Steuerung, Interaktion
├── data/
│   ├── sozialraeume.geojson  # GeoJSON mit eingebetteten Sachdaten
│   └── quartiersatlas.json   # Alternativ: Sachdaten separat
├── lib/
│   ├── leaflet.js           # Leaflet (lokal oder CDN)
│   └── leaflet.css
└── favicon.ico
```

### 4.3 Daten-Aufbereitung (ETL-Pipeline)

```
PDF (Anhang S. 198–213)
    │
    ▼ pdftotext / pdfplumber
    │
Rohdaten (Text/CSV)
    │
    ▼ Python-Skript: parse + clean
    │
JSON (sozialraum_id → Indikatoren)
    │
    ▼ Python-Skript: merge mit GeoJSON
    │
sozialraeume.geojson (Polygone + Properties)
```

**Merge-Logik:** Das GeoJSON enthält pro Feature ein Property-Feld mit der Sozialraum-ID (Feldname prüfen, vermutlich `SOZIALRAUM_NR` o.ä.). Die extrahierten Sachdaten werden anhand dieser ID als zusätzliche Properties in das GeoJSON eingehängt.

**Sonderfälle:**
- Sozialräume 033001/032001 werden gemeinsam typisiert (im PDF vermerkt)
- Sozialraum 071009 ist unbewohnt → „keine Daten" / ausgegraut

---

## 5. Nicht-funktionale Anforderungen

| Anforderung | Zielwert |
|---|---|
| **Ladezeit** | < 2 Sekunden (GeoJSON < 5 MB) |
| **Browserkompatibilität** | Chrome, Firefox, Safari, Edge (letzte 2 Versionen) |
| **Responsivität** | Desktop-optimiert, mobil nutzbar (Touch-Zoom) |
| **Barrierefreiheit** | Farbskala zusätzlich mit Tooltips beschriftet; kein reiner Farbunterschied |
| **Sprache** | Deutsch |
| **Offline-fähig** | Nein (OpenStreetMap-Tiles benötigen Internet) |
| **Datenschutz** | Keine personenbezogenen Daten, keine Cookies, kein Tracking |

---

## 6. Deployment (Hetzner Ubuntu Server)

### 6.1 Voraussetzungen

- Ubuntu 22.04 oder 24.04 LTS
- Root- oder sudo-Zugang
- Domain oder Subdomain (optional, auch IP-Zugriff möglich)

### 6.2 Installationsschritte

```bash
# 1. Nginx installieren
sudo apt update && sudo apt install -y nginx

# 2. Projektverzeichnis anlegen
sudo mkdir -p /var/www/quartiersatlas
sudo chown $USER:$USER /var/www/quartiersatlas

# 3. Dateien deployen (vom lokalen Rechner)
scp -r quartiersatlas/* user@server:/var/www/quartiersatlas/

# 4. Nginx Site-Konfiguration
sudo tee /etc/nginx/sites-available/quartiersatlas <<'EOF'
server {
    listen 80;
    server_name quartiersatlas.example.de;  # oder IP-Adresse

    root /var/www/quartiersatlas;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # GeoJSON-Caching (ändert sich selten)
    location ~* \.geojson$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip für GeoJSON aktivieren
    gzip on;
    gzip_types application/json application/geo+json;
    gzip_min_length 1000;
}
EOF

# 5. Aktivieren und starten
sudo ln -s /etc/nginx/sites-available/quartiersatlas /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6.3 HTTPS (empfohlen)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d quartiersatlas.example.de
```

### 6.4 Updates deployen

```bash
# Einfacher Datei-Sync
rsync -avz --delete quartiersatlas/ user@server:/var/www/quartiersatlas/
```

---

## 7. Phasenplanung

### Phase 1 — MVP (Geschätzter Aufwand: 2–3 Tage)

- GeoJSON herunterladen und validieren
- Anhang-Tabellen aus PDF extrahieren → JSON
- Daten in GeoJSON mergen
- Leaflet-Karte mit Choropleth und Layer-Toggle
- Hover-Tooltips und Klick-Popups
- Legende
- Deployment auf Hetzner

### Phase 2 — Erweiterung (Optional)

- Profilseiten-Daten (50 Indikatoren pro Sozialraum) als ausklappbares Detail-Panel
- Suchfunktion (Sozialraum-Name oder -Nummer eingeben)
- Stadtbezirksgrenzen als überlagernde Schicht
- Spinnendiagramm (Radar-Chart) pro Sozialraum im Popup (wie im PDF, S. 9 unten links)
- Vergleichsfunktion: zwei Sozialräume nebeneinander
- Druckansicht / PDF-Export der aktuellen Kartenansicht
- Zeitreihenvergleich mit Quartiersatlas 1.0 (falls Daten verfügbar)

### Phase 3 — Dashboard (Optional)

- Filterfunktion: Nur Sozialräume mit bestimmtem Handlungsbedarf anzeigen
- Aggregierte Statistiken pro Stadtbezirk
- Download der zugrunde liegenden Daten als CSV/Excel
- Einbettung in städtisches Webportal (iFrame-kompatibel)

---

## 8. Risiken & offene Punkte

| # | Risiko / Offener Punkt | Maßnahme |
|---|---|---|
| 1 | GeoJSON-Stand (2021) weicht vom Quartiersatlas-Stand (2021 Daten) möglicherweise in Grenzverläufen ab | Visueller Abgleich der IDs; Kontakt zum Amt bei Diskrepanzen |
| 2 | Feldnamen im GeoJSON sind unbekannt bis zum Download | GeoJSON herunterladen und Properties inspizieren |
| 3 | PDF-Extraktion kann fehlerhafte Zahlen liefern | Stichprobenartige Validierung gegen das Original-PDF |
| 4 | Sozialräume 033001/032001 sind zusammengelegt | Im Code als Sonderfall behandeln (gemeinsame Werte) |
| 5 | Sozialraum 071009 ist unbewohnt | Ausgegraut darstellen, Tooltip „keine Daten" |
| 6 | GeoJSON-Dateigröße könnte Performance beeinträchtigen | TopoJSON-Konvertierung als Fallback (ca. 70 % kleiner) |
| 7 | Urheberrecht am PDF-Inhalt | Quellenangabe im Footer; Daten sind amtliche Statistik |

---

## 9. Quellenangaben & Lizenzen

| Ressource | Lizenz |
|---|---|
| Quartiersatlas 2024 (PDF) | Amt für Statistik und Wahlen, Landeshauptstadt Düsseldorf |
| Sozialraumgrenzen GeoJSON | Datenlizenz Deutschland – Zero – Version 2.0 |
| OpenStreetMap Tiles | ODbL (Quellenangabe erforderlich: „© OpenStreetMap contributors") |
| Leaflet.js | BSD 2-Clause |

**Footer-Text für die Karte:**
> Datenquellen: Quartiersatlas 2024 – Landeshauptstadt Düsseldorf, Amt für Statistik und Wahlen | Sozialraumgrenzen: Open Data Düsseldorf (Datenlizenz Deutschland – Zero) | Kartendaten: © OpenStreetMap contributors
