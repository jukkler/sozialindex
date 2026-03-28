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
        { typ: 'gering',        label: 'gering',        range: 'z < \u22121,0' },
        { typ: 'eher gering',   label: 'eher gering',   range: '\u22121,0 bis < \u22120,5' },
        { typ: 'mittel',        label: 'mittel',         range: '\u22120,5 bis < +0,5' },
        { typ: 'erhöht',        label: 'erhöht',         range: '+0,5 bis < +1,0' },
        { typ: 'hoch',          label: 'hoch',           range: '\u2265 +1,0' },
    ];

    // All available layers, grouped by category
    // Each entry: [propertyKey, displayLabel]
    // z-score property is always 'z_' + propertyKey
    var CATEGORIES = [
        ['Indizes', [
            ['sozial', 'Sozialer Handlungsbedarf'],
            ['fluktuation', 'Fluktuation'],
        ]],
        ['Bev\u00f6lkerung', [
            ['bevoelkerung', 'Bev\u00f6lkerung'],
            ['weiblich_pct', 'Weiblich (%)'],
            ['u6', '< 6 Jahre'],
            ['u6_pct', '< 6 Jahre (%)'],
            ['a6_17', '6\u201317'],
            ['a6_17_pct', '6\u201317 (%)'],
            ['a18_29', '18\u201329'],
            ['a18_29_pct', '18\u201329 (%)'],
            ['a30_49', '30\u201349'],
            ['a30_49_pct', '30\u201349 (%)'],
            ['a50_64', '50\u201364'],
            ['a50_64_pct', '50\u201364 (%)'],
            ['a65_79', '65\u201379'],
            ['a65_79_pct', '65\u201379 (%)'],
            ['a80plus', '80+'],
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
            ['haushalte', 'Haushalte'],
            ['einpersonen_hh_pct', 'Einpersonen-HH (%)'],
            ['hh_kinder_pct', 'HH mit Kindern (%)'],
            ['alleinerziehende_pct', 'Alleinerziehende (%)'],
            ['senioren_single_pct', 'Senioren-Single (%)'],
        ]],
        ['Arbeit & Soziales', [
            ['arbeitslose', 'Arbeitslose'],
            ['arbeitslosenquote_pct', 'Arbeitslosenquote (%)'],
            ['sgb2_personen', 'SGB-II-Personen'],
            ['sgb2_quote_pct', 'SGB-II-Quote (%)'],
            ['kinderarmut_pct', 'Kinderarmut (%)'],
            ['altersarmut_pct', 'Altersarmut (%)'],
            ['mindestsicherung_pct', 'Mindestsicherung (%)'],
            ['wohngeld_hh_pct', 'Wohngeld-HH (%)'],
        ]],
        ['Bildung', [
            ['schueler_primar', 'Sch\u00fcler Primar'],
            ['schueler_sekundar', 'Sch\u00fcler Sekundar'],
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

    // Build lookup: key → label
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

    function typCssClass(typ) {
        if (!typ) return 'typ-mittel';
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
                + '<div class="tooltip-name">' + esc(props.name || 'Unbewohnt') + '</div>'
                + '<div class="tooltip-id">' + esc(props.SOZIALRAUM_ID) + ' \u2014 keine Daten (unbewohnt)</div>'
                + '</div>';
        }
        var z = getZValue(props);
        var typ = classifyZ(z) || '\u2013';
        var rawVal = props[currentLayer];
        var rawStr = rawVal != null ? formatValue(rawVal, '') + ' \u2013 ' : '';
        return '<div class="sr-tooltip">'
            + '<div class="tooltip-name">' + esc(props.name) + '</div>'
            + '<div class="tooltip-id">' + esc(props.SOZIALRAUM_ID)
            + ' \u00b7 ' + esc(LAYER_LABELS[currentLayer]) + ': ' + rawStr + typ + '</div>'
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

        // Index overview
        html += '<div class="popup-indices">';
        var indices = [
            { label: 'Sozialer Handlungsbedarf', typ: props.typ_sozial, z: props.z_sozial },
            { label: 'Fluktuation', typ: props.typ_fluktuation, z: props.z_fluktuation },
        ];
        for (var i = 0; i < indices.length; i++) {
            var idx = indices[i];
            var zStr = idx.z != null ? idx.z.toFixed(2) : '\u2013';
            html += '<div class="popup-index-row">';
            html += '<span class="popup-index-label">' + idx.label + '</span>';
            html += '<span class="popup-index-value">'
                + '<span class="typ-badge ' + typCssClass(idx.typ) + '">' + (idx.typ || '\u2013') + '</span>'
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
            geojsonLayer = L.geoJSON(data, {
                style: getStyle,
                onEachFeature: onEachFeature,
            }).addTo(map);

            createLegend();
            setupLayerControl();
        })
        .catch(function (err) {
            console.error('GeoJSON laden fehlgeschlagen:', err);
            document.getElementById('legend').innerHTML =
                '<p style="color:#c00;padding:8px;font-size:13px">Kartendaten konnten nicht geladen werden.</p>';
        });

    // -----------------------------------------------------------------------
    // Layer control
    // -----------------------------------------------------------------------
    function setupLayerControl() {
        var select = document.getElementById('layer-select');

        // Build <optgroup> + <option> from CATEGORIES
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

    function updateLegend() {
        var container = document.getElementById('legend');
        var html = '<h4>' + esc(LAYER_LABELS[currentLayer]) + '</h4>';

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
