(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Configuration
    // -----------------------------------------------------------------------
    var CENTER = [51.2277, 6.7735];
    var ZOOM = 12;
    var currentLayer = 'sozial';

    var COLORS = {
        gering:        '#1a9850',
        'eher gering': '#91cf60',
        mittel:        '#fee08b',
        'erhöht':      '#fc8d59',
        hoch:          '#d73027',
        unbewohnt:     '#d3d3d3',
    };

    var CATEGORIES = [
        ['Indizes', [
            ['sozial', 'Sozialer Handlungsbedarf'],
            ['fluktuation', 'Fluktuation'],
            ['qol', 'Quality of Life'],
        ]],
        ['Bev\u00f6lkerung', [
            ['bevoelkerung', 'Bev\u00f6lkerung'],
            ['weiblich_pct', 'Weiblich (%)'],
            ['u6_pct', '< 6 Jahre (%)'],
            ['a6_17_pct', '6\u201317 (%)'],
            ['a18_29_pct', '18\u201329 (%)'],
            ['a30_49_pct', '30\u201349 (%)'],
            ['a50_64_pct', '50\u201364 (%)'],
            ['a65_79_pct', '65\u201379 (%)'],
            ['a80plus_pct', '80+ (%)'],
            ['jugendquotient', 'Jugendquotient'],
            ['altenquotient', 'Altenquotient'],
            ['auslaender_pct', 'Ausl\u00e4nder (%)'],
            ['migration_pct', 'Migrationshintergrund (%)'],
        ]],
        ['Wanderung', [
            ['wanderungssaldo', 'Wanderungssaldo'],
            ['fluktuationsrate', 'Fluktuationsrate'],
        ]],
        ['Haushalte', [
            ['einpersonen_hh_pct', 'Einpersonen-HH (%)'],
            ['hh_kinder_pct', 'HH mit Kindern (%)'],
            ['alleinerziehende_pct', 'Alleinerziehende (%)'],
            ['senioren_single_pct', 'Senioren-Single (%)'],
        ]],
        ['Arbeit & Soziales', [
            ['arbeitslosenquote_pct', 'Arbeitslosenquote (%)'],
            ['sgb2_quote_pct', 'SGB-II-Quote (%)'],
            ['kinderarmut_pct', 'Kinderarmut (%)'],
            ['altersarmut_pct', 'Altersarmut (%)'],
            ['mindestsicherung_pct', 'Mindestsicherung (%)'],
            ['wohngeld_hh_pct', 'Wohngeld-HH (%)'],
        ]],
        ['Bildung', [
            ['hauptschule_pct', 'Hauptschule (%)'],
            ['realschule_pct', 'Realschule (%)'],
            ['gymnasium_pct', 'Gymnasium (%)'],
            ['gesamtschule_pct', 'Gesamtschule (%)'],
            ['uebergang_gym_pct', '\u00dcbergang Gymnasium (%)'],
        ]],
        ['Wohnen & Fl\u00e4che', [
            ['wohnflaeche_m2_ew', 'Wohnfl\u00e4che (m\u00b2/EW)'],
            ['oeff_gef_whg_pct', '\u00d6ff. gef. Wohnungen (%)'],
            ['wohneigentum_pct', 'Wohneigentum (%)'],
            ['flaeche_ha', 'Fl\u00e4che (ha)'],
            ['bev_dichte_km2', 'Bev.-Dichte (/km\u00b2)'],
            ['wohnflaechenanteil_pct', 'Wohnfl\u00e4chenanteil (%)'],
            ['gruenflaeche_pct', 'Gr\u00fcnfl\u00e4che (%)'],
        ]],
    ];

    var LAYER_LABELS = {};
    CATEGORIES.forEach(function (cat) {
        cat[1].forEach(function (item) {
            LAYER_LABELS[item[0]] = item[1];
        });
    });

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    function esc(str) {
        if (str == null) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function classifyZ(z) {
        if (z == null) return null;
        if (z < -1.0) return 'gering';
        if (z < -0.5) return 'eher gering';
        if (z < 0.5)  return 'mittel';
        if (z < 1.0)  return 'erh\u00f6ht';
        return 'hoch';
    }

    var QOL_CSS_MAP = {
        'hoch': 'typ-gering',
        'leicht \u00fcberdurchschn.': 'typ-eher-gering',
        'durchschnittlich': 'typ-mittel',
        'leicht unterdurchschn.': 'typ-erhoeht',
        'niedrig': 'typ-hoch',
    };

    function typCssClass(typ) {
        if (!typ) return 'typ-mittel';
        if (QOL_CSS_MAP[typ]) return QOL_CSS_MAP[typ];
        return 'typ-' + typ.replace(/\s+/g, '-').replace(/\u00f6/g, 'oe');
    }

    function formatValue(val, unit) {
        if (val == null) return '\u2013';
        if (typeof val === 'number') {
            var formatted = val.toLocaleString('de-DE', { maximumFractionDigits: 1 });
            return unit ? formatted + ' ' + unit : formatted;
        }
        return String(val);
    }

    // -----------------------------------------------------------------------
    // Map setup
    // -----------------------------------------------------------------------
    var map = L.map('map', {
        zoomControl: true,
    }).setView(CENTER, ZOOM);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '',
        subdomains: 'abcd',
        maxZoom: 19,
    }).addTo(map);

    // -----------------------------------------------------------------------
    // Style functions
    // -----------------------------------------------------------------------
    function getZValue(props) {
        return props['z_' + currentLayer];
    }

    var GRADIENT_STOPS = [
        { z: -1.5, r: 26,  g: 152, b: 80  },  // #1a9850
        { z: -1.0, r: 26,  g: 152, b: 80  },
        { z: -0.5, r: 145, g: 207, b: 96  },  // #91cf60
        { z:  0.0, r: 254, g: 224, b: 139 },  // #fee08b
        { z:  0.5, r: 252, g: 141, b: 89  },  // #fc8d59
        { z:  1.0, r: 215, g: 48,  b: 39  },  // #d73027
        { z:  1.5, r: 215, g: 48,  b: 39  },
    ];

    function getColor(z) {
        if (z == null) return COLORS.unbewohnt;
        z = Math.max(-1.5, Math.min(1.5, z));
        for (var i = 0; i < GRADIENT_STOPS.length - 1; i++) {
            var a = GRADIENT_STOPS[i], b = GRADIENT_STOPS[i + 1];
            if (z <= b.z) {
                var t = (b.z === a.z) ? 0 : (z - a.z) / (b.z - a.z);
                return 'rgb(' + Math.round(a.r + t * (b.r - a.r)) + ','
                    + Math.round(a.g + t * (b.g - a.g)) + ','
                    + Math.round(a.b + t * (b.b - a.b)) + ')';
            }
        }
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
                + '<div class="tooltip-name">' + esc(props.name || 'Unbewohnt') + '</div>'
                + '<div class="tooltip-id">' + esc(props.SOZIALRAUM_ID) + ' \u2014 keine Daten (unbewohnt)</div>'
                + '</div>';
        }
        var rawVal = props[currentLayer];
        var avg = averages[currentLayer];
        var z = getZValue(props);
        var typ = classifyZ(z);
        var parts = esc(LAYER_LABELS[currentLayer]) + ': ';
        if (currentLayer === 'qol') {
            var qi = props.qol_index;
            var rang = props.qol_rang;
            if (qi != null) {
                parts += (props.qol_klasse || '\u2013') + ' (Rang ' + rang + ')';
            } else {
                parts += '\u2013';
            }
        } else if (rawVal != null) {
            parts += formatValue(rawVal, '');
            if (avg != null) parts += ' (\u00d8 ' + formatValue(avg, '') + ')';
        } else if (typ) {
            parts += typ;
        } else {
            parts += '\u2013';
        }
        return '<div class="sr-tooltip">'
            + '<div class="tooltip-name">' + esc(props.name) + '</div>'
            + '<div class="tooltip-id">' + esc(props.SOZIALRAUM_ID) + ' \u00b7 ' + parts + '</div>'
            + '</div>';
    }

    // -----------------------------------------------------------------------
    // Popup
    // -----------------------------------------------------------------------
    var POPUP_SECTIONS = [
        {
            title: 'Bev\u00f6lkerung',
            rows: [
                ['bevoelkerung', 'Einwohner', ''],
                ['auslaender_pct', 'Ausl\u00e4nder', '%'],
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
                ['uebergang_gym_pct', '\u00dcbergang Gymnasium', '%'],
            ],
        },
        {
            title: 'Wohnen & Fluktuation',
            rows: [
                ['fluktuationsrate', 'Fluktuationsrate', ''],
                ['wanderungssaldo', 'Wanderungssaldo', '\u2030'],
                ['wohnflaeche_m2_ew', 'Wohnfl\u00e4che', 'm\u00b2/EW'],
                ['wohneigentum_pct', 'Wohneigentum', '%'],
                ['oeff_gef_whg_pct', '\u00d6ff. gef. Wohnungen', '%'],
                ['bev_dichte_km2', 'Bev\u00f6lkerungsdichte', '/km\u00b2'],
            ],
        },
    ];

    function createPopupContent(props) {
        if (props.unbewohnt) {
            return '<div class="sr-popup">'
                + '<h3>' + esc(props.name || 'Unbewohnt')
                + ' <span class="popup-id">(' + esc(props.SOZIALRAUM_ID) + ')</span></h3>'
                + '<p class="unbewohnt-msg">Keine Daten \u2013 unbewohnter Sozialraum</p>'
                + '</div>';
        }

        var html = '<div class="sr-popup">';
        html += '<h3>' + esc(props.name) + ' <span class="popup-id">(' + esc(props.SOZIALRAUM_ID) + ')</span></h3>';
        html += '<div class="popup-bezirk">Stadtbezirk ' + esc(props.stadtbezirk) + '</div>';

        html += '<div class="popup-indices">';
        var indices = [
            { label: 'Sozialer Handlungsbedarf', typ: props.typ_sozial },
            { label: 'Fluktuation', typ: props.typ_fluktuation },
            { label: 'Quality of Life', typ: props.qol_klasse, rang: props.qol_rang },
        ];
        for (var i = 0; i < indices.length; i++) {
            var idx = indices[i];
            html += '<div class="popup-index-row">';
            html += '<span class="popup-index-label">' + idx.label + '</span>';
            var extra = idx.rang != null ? ' (Rang ' + idx.rang + ')' : '';
            html += '<span class="popup-index-value">'
                + '<span class="typ-badge ' + typCssClass(idx.typ) + '">' + (idx.typ || '\u2013') + '</span>'
                + extra
                + '</span>';
            html += '</div>';
        }
        html += '</div>';

        for (var s = 0; s < POPUP_SECTIONS.length; s++) {
            var section = POPUP_SECTIONS[s];
            html += '<h4>' + section.title + '</h4>';
            html += '<table>';
            for (var r = 0; r < section.rows.length; r++) {
                var row = section.rows[r];
                var avg = averages[row[0]];
                var avgStr = avg != null ? formatValue(avg, row[2]) : '';
                html += '<tr><td>' + row[1] + '</td>'
                    + '<td>' + formatValue(props[row[0]], row[2]) + '</td>'
                    + '<td class="popup-avg">' + (avgStr ? '\u00d8 ' + avgStr : '') + '</td></tr>';
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
    var averages = {};
    var stats = {};
    var geojsonData;
    var stadtteileLayer;
    var stadtteileData;
    var stadtteileLabels;

    function onEachFeature(feature, layer) {
        layer.bindTooltip(function () {
            return createTooltipContent(feature.properties);
        }, { sticky: true, className: '' });

        layer.bindPopup(createPopupContent(feature.properties), {
            maxWidth: 340,
            maxHeight: 420,
        });

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
                e.target.openPopup();
            },
        });
    }

    fetch('data/sozialraeume.geojson')
        .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(function (data) {
            geojsonData = data;
            averages = data.averages || {};
            stats = data.stats || {};
            geojsonLayer = L.geoJSON(data, {
                style: getStyle,
                onEachFeature: onEachFeature,
            }).addTo(map);

            createLegend();
            setupLayerControl();
            loadStadtteile();
        })
        .catch(function (err) {
            console.error('GeoJSON laden fehlgeschlagen:', err);
            document.getElementById('legend').innerHTML =
                '<p style="color:#c00;padding:8px;font-size:13px">Kartendaten konnten nicht geladen werden.</p>';
        });

    // -----------------------------------------------------------------------
    // Stadtteile overlay
    // -----------------------------------------------------------------------
    function loadStadtteile() {
        fetch('data/stadtteile.geojson')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data) return;
                stadtteileData = data;
                stadtteileLayer = L.geoJSON(data, {
                    style: {
                        fillColor: 'transparent',
                        fillOpacity: 0,
                        color: '#333',
                        weight: 2.5,
                        dashArray: '6,4',
                    },
                });

                // Separate label layer with permanent tooltips
                stadtteileLabels = L.layerGroup();
                data.features.forEach(function (f) {
                    var bounds = L.geoJSON(f).getBounds();
                    var center = bounds.getCenter();
                    var marker = L.marker(center, {
                        icon: L.divIcon({
                            className: 'stadtteil-label-icon',
                            html: '<span>' + esc(f.properties.Name) + '</span>',
                            iconSize: null,
                        }),
                        interactive: false,
                    });
                    stadtteileLabels.addLayer(marker);
                });

                var labelsToggle = document.getElementById('toggle-labels');
                labelsToggle.disabled = false;

                document.getElementById('toggle-stadtteile').addEventListener('change', function () {
                    if (this.checked) {
                        stadtteileLayer.addTo(map);
                    } else {
                        map.removeLayer(stadtteileLayer);
                        labelsToggle.checked = false;
                        map.removeLayer(stadtteileLabels);
                    }
                });

                labelsToggle.addEventListener('change', function () {
                    if (this.checked) {
                        // Auto-enable Stadtteile borders too
                        if (!map.hasLayer(stadtteileLayer)) {
                            document.getElementById('toggle-stadtteile').checked = true;
                            stadtteileLayer.addTo(map);
                        }
                        stadtteileLabels.addTo(map);
                    } else {
                        map.removeLayer(stadtteileLabels);
                    }
                });
            });
    }

    // -----------------------------------------------------------------------
    // Layer control
    // -----------------------------------------------------------------------
    function setupLayerControl() {
        var select = document.getElementById('layer-select');

        for (var c = 0; c < CATEGORIES.length; c++) {
            var cat = CATEGORIES[c];
            var group = document.createElement('optgroup');
            group.label = cat[0];
            for (var i = 0; i < cat[1].length; i++) {
                var opt = document.createElement('option');
                opt.value = cat[1][i][0];
                opt.textContent = cat[1][i][1];
                if (cat[1][i][0] === currentLayer) opt.selected = true;
                group.appendChild(opt);
            }
            select.appendChild(group);
        }

        select.addEventListener('change', function () {
            currentLayer = this.value;
            geojsonLayer.setStyle(getStyle);
            updateLegend();
        });
    }

    // -----------------------------------------------------------------------
    // Legend
    // -----------------------------------------------------------------------
    function createLegend() {
        updateLegend();
    }

    function fmtNum(v) {
        return v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
    }

    function updateLegend() {
        var container = document.getElementById('legend');
        var html = '<h4>' + esc(LAYER_LABELS[currentLayer]) + '</h4>';

        // Gradient bar
        html += '<div class="legend-gradient"></div>';

        // Tick labels
        var avg = averages[currentLayer];
        var s = stats[currentLayer];
        var hasT = avg != null && s && s.std != null;

        html += '<div class="legend-ticks">';
        html += '<span>deutlich unter \u00d8</span>';
        html += '<span>Durchschnitt</span>';
        html += '<span>deutlich \u00fcber \u00d8</span>';
        html += '</div>';

        if (hasT) {
            html += '<div class="legend-values">';
            html += '<span>' + fmtNum(avg - 1.0 * s.std) + '</span>';
            html += '<span>' + fmtNum(avg - 0.5 * s.std) + '</span>';
            html += '<span>' + fmtNum(avg) + '</span>';
            html += '<span>' + fmtNum(avg + 0.5 * s.std) + '</span>';
            html += '<span>' + fmtNum(avg + 1.0 * s.std) + '</span>';
            html += '</div>';
        }

        html += '<div class="legend-item legend-unbewohnt">';
        html += '<span class="legend-color" style="background:' + COLORS.unbewohnt + '"></span>';
        html += '<span class="legend-label">keine Daten (unbewohnt)</span>';
        html += '</div>';

        container.innerHTML = html;
    }

    // -----------------------------------------------------------------------
    // Programmatic map rendering (device-independent)
    // -----------------------------------------------------------------------
    var TILE_SIZE = 256;
    var FONT = '-apple-system, "Segoe UI", Roboto, sans-serif';

    function lngToPixel(lng, z) {
        return ((lng + 180) / 360) * Math.pow(2, z) * TILE_SIZE;
    }

    function latToPixel(lat, z) {
        var r = lat * Math.PI / 180;
        return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z) * TILE_SIZE;
    }

    function hexToRgb(hex) {
        var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
                 : { r: 0, g: 0, b: 0 };
    }

    function renderMap(ctx, x, y, w, h, callback) {
        var bounds = geojsonLayer.getBounds();
        var pad = 0.003;
        var south = bounds.getSouth() - pad;
        var north = bounds.getNorth() + pad;
        var west = bounds.getWest() - pad;
        var east = bounds.getEast() + pad;

        var zoom = 1;
        for (var z = 16; z >= 1; z--) {
            if (lngToPixel(east, z) - lngToPixel(west, z) <= w &&
                latToPixel(south, z) - latToPixel(north, z) <= h) {
                zoom = z; break;
            }
        }

        var geoW = lngToPixel(east, zoom) - lngToPixel(west, zoom);
        var geoH = latToPixel(south, zoom) - latToPixel(north, zoom);
        var originX = lngToPixel(west, zoom) - (w - geoW) / 2;
        var originY = latToPixel(north, zoom) - (h - geoH) / 2;

        function geo(lat, lng) {
            return [lngToPixel(lng, zoom) - originX + x, latToPixel(lat, zoom) - originY + y];
        }

        var minTX = Math.floor(originX / TILE_SIZE);
        var maxTX = Math.floor((originX + w) / TILE_SIZE);
        var maxTiles = Math.pow(2, zoom);
        var minTY = Math.max(0, Math.floor(originY / TILE_SIZE));
        var maxTY = Math.min(maxTiles - 1, Math.floor((originY + h) / TILE_SIZE));

        var tileList = [];
        for (var tx = minTX; tx <= maxTX; tx++) {
            for (var ty = minTY; ty <= maxTY; ty++) {
                var wtx = ((tx % maxTiles) + maxTiles) % maxTiles;
                tileList.push({ tx: tx, ty: ty, ftx: wtx, fty: ty });
            }
        }

        var loaded = 0;
        var tileImgs = {};
        if (tileList.length === 0) { draw(); return; }

        tileList.forEach(function (t) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            var s = 'abcd'[(Math.abs(t.ftx) + Math.abs(t.fty)) % 4];
            img.src = 'https://' + s + '.basemaps.cartocdn.com/light_all/' + zoom + '/' + t.ftx + '/' + t.fty + '.png';
            img.onload = function () {
                tileImgs[t.tx + ',' + t.ty] = img;
                if (++loaded === tileList.length) draw();
            };
            img.onerror = function () {
                if (++loaded === tileList.length) draw();
            };
        });

        function draw() {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();

            ctx.fillStyle = '#f2efe9';
            ctx.fillRect(x, y, w, h);

            for (var key in tileImgs) {
                var parts = key.split(',');
                var dtx = parseInt(parts[0]), dty = parseInt(parts[1]);
                ctx.drawImage(tileImgs[key],
                    dtx * TILE_SIZE - originX + x,
                    dty * TILE_SIZE - originY + y,
                    TILE_SIZE, TILE_SIZE);
            }

            // Draw GeoJSON polygons from raw data
            var features = geojsonData.features;
            for (var fi = 0; fi < features.length; fi++) {
                var feature = features[fi];
                var props = feature.properties;
                var zVal = props['z_' + currentLayer];

                ctx.fillStyle = props.unbewohnt ? COLORS.unbewohnt : getColor(zVal);
                ctx.globalAlpha = props.unbewohnt ? 0.4 : 0.7;
                ctx.strokeStyle = (zVal != null && zVal >= 1.5) ? '#444' : '#666';
                ctx.lineWidth = (zVal != null && zVal >= 1.5) ? 2 : 0.5;

                var geom = feature.geometry;
                var polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];

                for (var p = 0; p < polys.length; p++) {
                    for (var r = 0; r < polys[p].length; r++) {
                        var ring = polys[p][r];
                        ctx.beginPath();
                        for (var j = 0; j < ring.length; j++) {
                            var pt = geo(ring[j][1], ring[j][0]);
                            if (j === 0) ctx.moveTo(pt[0], pt[1]);
                            else ctx.lineTo(pt[0], pt[1]);
                        }
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    }
                }
            }

            // Draw Stadtteile borders if toggle is on
            var showStadtteile = document.getElementById('toggle-stadtteile').checked;
            if (showStadtteile && stadtteileData) {
                ctx.globalAlpha = 1;
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 2.5;
                ctx.setLineDash([6, 4]);
                ctx.fillStyle = 'transparent';

                var stFeatures = stadtteileData.features;
                for (var si = 0; si < stFeatures.length; si++) {
                    var stGeom = stFeatures[si].geometry;
                    var stPolys = stGeom.type === 'MultiPolygon' ? stGeom.coordinates : [stGeom.coordinates];

                    for (var sp = 0; sp < stPolys.length; sp++) {
                        for (var sr = 0; sr < stPolys[sp].length; sr++) {
                            var sRing = stPolys[sp][sr];
                            ctx.beginPath();
                            for (var sj = 0; sj < sRing.length; sj++) {
                                var sPt = geo(sRing[sj][1], sRing[sj][0]);
                                if (sj === 0) ctx.moveTo(sPt[0], sPt[1]);
                                else ctx.lineTo(sPt[0], sPt[1]);
                            }
                            ctx.closePath();
                            ctx.stroke();
                        }
                    }
                }
                ctx.setLineDash([]);

                // Draw Stadtteil names if label toggle is on
                var showLabels = document.getElementById('toggle-labels').checked;
                if (showLabels) {
                    ctx.font = 'bold 11px ' + FONT;
                    ctx.fillStyle = '#222';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    for (var li = 0; li < stFeatures.length; li++) {
                        var stBounds = L.geoJSON(stFeatures[li]).getBounds();
                        var ctr = stBounds.getCenter();
                        var cp = geo(ctr.lat, ctr.lng);
                        // White halo
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 3;
                        ctx.lineJoin = 'round';
                        ctx.strokeText(stFeatures[li].properties.Name, cp[0], cp[1]);
                        ctx.fillText(stFeatures[li].properties.Name, cp[0], cp[1]);
                    }
                    ctx.textAlign = 'start';
                    ctx.textBaseline = 'alphabetic';
                }
            }

            ctx.globalAlpha = 1;
            ctx.restore();
            callback();
        }
    }

    // -----------------------------------------------------------------------
    // Shared legend drawing on canvas
    // -----------------------------------------------------------------------
    function drawLegendOnCanvas(ctx, x, y, w, fontSize) {
        var barH = fontSize;
        var grad = ctx.createLinearGradient(x, 0, x + w, 0);
        grad.addColorStop(0, '#1a9850');
        grad.addColorStop(0.25, '#91cf60');
        grad.addColorStop(0.5, '#fee08b');
        grad.addColorStop(0.75, '#fc8d59');
        grad.addColorStop(1, '#d73027');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, barH);
        ctx.strokeStyle = '#ccc';
        ctx.strokeRect(x, y, w, barH);

        // Tick labels
        var labelY = y + barH + fontSize + 2;
        ctx.fillStyle = '#555';
        ctx.font = Math.round(fontSize * 0.75) + 'px ' + FONT;
        ctx.textAlign = 'left';
        ctx.fillText('deutlich unter \u00d8', x, labelY);
        ctx.textAlign = 'center';
        ctx.fillText('Durchschnitt', x + w / 2, labelY);
        ctx.textAlign = 'right';
        ctx.fillText('deutlich \u00fcber \u00d8', x + w, labelY);

        // Threshold values
        var cavg = averages[currentLayer];
        var s = stats[currentLayer];
        if (cavg != null && s && s.std != null) {
            var valY = labelY + fontSize * 0.9;
            ctx.fillStyle = '#999';
            ctx.font = Math.round(fontSize * 0.7) + 'px ' + FONT;
            var ticks = [-1.0, -0.5, 0, 0.5, 1.0];
            var positions = [0, 0.25, 0.5, 0.75, 1.0];
            for (var i = 0; i < ticks.length; i++) {
                ctx.textAlign = 'center';
                ctx.fillText(fmtNum(cavg + ticks[i] * s.std), x + positions[i] * w, valY);
            }
        }

        // Unbewohnt
        var ubY = labelY + fontSize * 1.8;
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.unbewohnt;
        ctx.fillRect(x, ubY - fontSize * 0.6, fontSize, fontSize - 2);
        ctx.strokeStyle = '#ccc';
        ctx.strokeRect(x, ubY - fontSize * 0.6, fontSize, fontSize - 2);
        ctx.fillStyle = '#555';
        ctx.font = Math.round(fontSize * 0.85) + 'px ' + FONT;
        ctx.fillText('keine Daten (unbewohnt)', x + fontSize + 6, ubY);
    }

    // -----------------------------------------------------------------------
    // PDF Export
    // -----------------------------------------------------------------------
    function exportPDF() {
        var btn = document.getElementById('export-pdf');
        btn.disabled = true;
        btn.textContent = 'Wird erstellt\u2026';

        var mapPxW = 2400, mapPxH = 1400;
        var mapCanvas = document.createElement('canvas');
        mapCanvas.width = mapPxW;
        mapCanvas.height = mapPxH;
        var mCtx = mapCanvas.getContext('2d');

        renderMap(mCtx, 0, 0, mapPxW, mapPxH, function () {
            var jsPDF = window.jspdf.jsPDF;
            var pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            var pw = 297, ph = 210;
            var margin = 10;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text('Quartiersatlas Duesseldorf - ' + LAYER_LABELS[currentLayer], margin, margin + 5);

            var mapTop = margin + 10;
            var legendH = 28;
            var mapH = ph - mapTop - legendH - margin - 6;
            var imgRatio = mapPxW / mapPxH;
            var fitW = pw - 2 * margin;
            var fitH = fitW / imgRatio;
            if (fitH > mapH) { fitH = mapH; fitW = fitH * imgRatio; }
            var mapX = margin + (pw - 2 * margin - fitW) / 2;
            pdf.addImage(mapCanvas.toDataURL('image/png'), 'PNG', mapX, mapTop, fitW, fitH);

            var ly = mapTop + fitH + 4;

            // Gradient bar as canvas image
            var gradCanvas = document.createElement('canvas');
            gradCanvas.width = 600; gradCanvas.height = 10;
            var gCtx = gradCanvas.getContext('2d');
            var grd = gCtx.createLinearGradient(0, 0, 600, 0);
            grd.addColorStop(0, '#1a9850');
            grd.addColorStop(0.25, '#91cf60');
            grd.addColorStop(0.5, '#fee08b');
            grd.addColorStop(0.75, '#fc8d59');
            grd.addColorStop(1, '#d73027');
            gCtx.fillStyle = grd;
            gCtx.fillRect(0, 0, 600, 10);

            var barW = pw - 2 * margin;
            pdf.addImage(gradCanvas.toDataURL('image/png'), 'PNG', margin, ly, barW, 4);

            // Labels
            ly += 7;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(80, 80, 80);
            pdf.text('deutlich unter Oe', margin, ly);
            pdf.text('Durchschnitt', pw / 2, ly, { align: 'center' });
            pdf.text('deutlich ueber Oe', pw - margin, ly, { align: 'right' });

            // Threshold values
            var pdfAvg = averages[currentLayer];
            var pdfS = stats[currentLayer];
            if (pdfAvg != null && pdfS && pdfS.std != null) {
                ly += 3.5;
                pdf.setFontSize(6.5);
                pdf.setTextColor(130, 130, 130);
                var ticks = [-1.0, -0.5, 0, 0.5, 1.0];
                var positions = [0, 0.25, 0.5, 0.75, 1.0];
                for (var i = 0; i < ticks.length; i++) {
                    pdf.text(fmtNum(pdfAvg + ticks[i] * pdfS.std),
                        margin + positions[i] * barW, ly, { align: 'center' });
                }
            }

            // Unbewohnt
            ly += 5;
            var ubRgb = hexToRgb(COLORS.unbewohnt);
            pdf.setFillColor(ubRgb.r, ubRgb.g, ubRgb.b);
            pdf.rect(margin, ly - 2.5, 5, 3.5, 'F');
            pdf.setDrawColor(180, 180, 180);
            pdf.rect(margin, ly - 2.5, 5, 3.5, 'S');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(80, 80, 80);
            pdf.text('keine Daten (unbewohnt)', margin + 7, ly);

            pdf.setFontSize(6.5);
            pdf.setTextColor(120, 120, 120);
            pdf.text('Datenquellen: Quartiersatlas 2024 - LH Duesseldorf | Open Data Duesseldorf | OpenStreetMap | CARTO', margin, ph - 4);
            pdf.setTextColor(0, 0, 0);

            pdf.save('sozialindex_' + currentLayer + '.pdf');
            btn.disabled = false;
            btn.textContent = 'PDF Export';
        });
    }

    // -----------------------------------------------------------------------
    // Image Export (Instagram 4:5)
    // -----------------------------------------------------------------------
    function exportImage() {
        var btn = document.getElementById('export-img');
        btn.disabled = true;
        btn.textContent = 'Wird erstellt\u2026';

        var W = 1080, H = 1350;
        var out = document.createElement('canvas');
        out.width = W;
        out.height = H;
        var ctx = out.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);

        var mapTop = 100;
        var mapH = H - mapTop - 150;

        renderMap(ctx, 0, mapTop, W, mapH, function () {
            ctx.fillStyle = '#222';
            ctx.font = 'bold 36px ' + FONT;
            ctx.fillText('Quartiersatlas D\u00fcsseldorf', 40, 48);
            ctx.font = '28px ' + FONT;
            ctx.fillStyle = '#666';
            ctx.fillText(LAYER_LABELS[currentLayer], 40, 82);

            drawLegendOnCanvas(ctx, 30, mapTop + mapH + 16, W - 60, 18, true);

            ctx.fillStyle = '#aaa';
            ctx.font = '13px ' + FONT;
            ctx.fillText('Quartiersatlas 2024 \u2013 LH D\u00fcsseldorf | Open Data D\u00fcsseldorf | \u00a9 OpenStreetMap \u00a9 CARTO', 30, H - 16);

            var link = document.createElement('a');
            link.download = 'sozialindex_' + currentLayer + '.png';
            link.href = out.toDataURL('image/png');
            link.click();

            btn.disabled = false;
            btn.textContent = 'Bild Export';
        });
    }

    document.getElementById('export-pdf').addEventListener('click', exportPDF);
    document.getElementById('export-img').addEventListener('click', exportImage);

})();
