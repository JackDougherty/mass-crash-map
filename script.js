var map = L.map('map', {
    zoomControl: false,
    center: [42.34, -71.08],
    zoom: 13,
    minZoom: 12,
    attributionControl: false,
    preferCanvas: true
})

L.control.zoom({ position: 'topright' }).addTo(map)

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map)

var labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
    pane: 'shadowPane'  // always display on top
}).addTo(map)

function dateToTS(date) {
    return date.valueOf();
}

function tsToDate(ts) {
    var d = new Date(ts);

    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// display initial data, where Jan = 0 and Dec = 11
var initFrom = dateToTS(new Date(2022, 0, 1));
var initTo = dateToTS(new Date(2026, 0, 1));

Papa.parse('./data/crashes.csv', {
    download: true,
    header: true,
    dynamicTyping: true,
    complete: function (result) {
        var normalizeCrash = function (row) {
            if (!row || row.id == null || !row.date || row.lat == null || row.lng == null) {
                return null;
            }

            var dateString = String(row.date).trim();
            var timeString = row.time ? String(row.time).trim() : '00:00';
            var dateValue = new Date(dateString + 'T00:00:00');
            if (Number.isNaN(dateValue.valueOf())) {
                return null;
            }

            var severityCode = row.severity == null || row.severity === '' ? null : Number(row.severity);
            var severity = !severityCode ? 'O' : severityCode === 1 ? 'K' : severityCode === 2 ? 'A' : 'O';
            var lat = Number(row.lat);
            var lng = Number(row.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return null;
            }

            return {
                source: row.source,
                id: row.id,
                muni: row.muni,
                x: lat,
                y: lng,
                k: dateString,
                t: timeString,
                d: dateToTS(dateValue) / 100000.0,
                s: severity,
                p: Number(row.ped) === 1 ? 1 : 0,
                c: Number(row.cyclist) === 1 ? 1 : 0,
                // New CSV format does not include roadway class.
                r: null
            };
        };

        var data = result.data.map(normalizeCrash).filter(function (row) {
            return row !== null;
        });

        var heat = L.heatLayer([], { radius: 20 }).addTo(map);
        var individualPoints = L.layerGroup().addTo(map);
        var participantColors = {
            pedestrian: '#fb8072',
            cyclist: '#fdb462',
            motorist: '#bebada'
        };

        var tsCoef = 100000.0 // original timestamp needs to be multiplied by this to work in JS

        var updateStatsText = function (formattedFrom, formattedTo, crashesTotal, crashesPed, crashesCyc, filtered) {
            var text = formattedFrom === formattedTo
                ? ('On ' + formattedFrom)
                : ('From ' + formattedFrom + ' to ' + formattedTo)

            text += ', there ' + (crashesTotal === 1 ? 'was ' : 'were ') + (crashesTotal === 0 ? 'no' : crashesTotal.toLocaleString())
            text += ' car crash' + (crashesTotal === 1 ? '' : 'es') + '.'

            if (crashesTotal > 1) {
                text += ' Of those, ' + (crashesPed > 0 ? crashesPed.toLocaleString() : ' none');
                text += ' involved a pedestrian, and ';
                text += (crashesCyc > 0 ? crashesCyc.toLocaleString() : ' none');
                text += ' involved a cyclist.';
            }

            // modified statsText about filter results
             text += ' <span class="i ' + (filtered ? '' : 'red') + '">'
                 + 'Your checkboxes below show '
                 + (filtered ? filtered.toLocaleString() : 'no ') + ' crash'
                 + (filtered === 1 ? '' : 'es') + '.</span>'

            $('#statsText').html(text)

        }

        // Given `from` and `to` timestamps, updates the heatmap layer.
        var updateHeatLayer = function (from, to) {

            from = dateToTS(new Date(from * 1).setHours(0, 0, 0, 0)) / tsCoef;
            to = dateToTS(new Date(to * 1).setHours(23, 59, 59, 0)) / tsCoef;

            // All crashes between set dates
            var crashes = data.filter(function (point) {
                return point.d >= from && point.d <= to;
            })

            var crashesFiltered = crashes.filter(function (point) {
                var hasRoadClass = point.r !== null && point.r !== undefined;
                var passesRoadway = !hasRoadClass || (($('#localStateUS').prop('checked') ? point.r !== 1 : false)
                    || ($('#interstate').prop('checked') ? point.r === 1 : false));

                return passesRoadway

                    && (($('#vehiclesOnly').prop('checked') ? (point.c === 0 && point.p === 0) : false)
                        || ($('#cyclists').prop('checked') ? point.c === 1 : false)
                        || ($('#pedestrians').prop('checked') ? point.p === 1 : false))

                    && (($('#fatalInjury').prop('checked') ? point.s === 'K' : false)
                        || ($('#anyInjury').prop('checked') ? point.s === 'A' : false)
                        || ($('#propertyDamageOnly').prop('checked') ? point.s === 'O' : false))
            });


            let a = new Set(crashes.map(x => x.id));
            let b = new Set(crashesFiltered.map(x => x.id));
            let a_minus_b = new Set([...a].filter(x => !b.has(x)));
            console.log(a_minus_b)

            updateStatsText(
                tsToDate(from * 100000),  // Date from
                tsToDate(to * 100000),  // Date to
                crashes.length, // Total crashes
                crashes.filter(function (p) { return p.p === 1 }).length,  // Ped crashes
                crashes.filter(function (p) { return p.c === 1 }).length,  // Cyc crashes
                crashesFiltered.length
            )

            // Despite zoom, clear individual points
            individualPoints.clearLayers();

            // Update the heatlayer
            var intensity = $('#intensity').val();

            let pointsOnly = $('#pointsOnly').prop('checked');

            // If zoomed in all the way, show points instead of a heatmap
            if ( map.getZoom() >= 18 || pointsOnly ) {

                heat.setLatLngs([]);

                crashesFiltered.map(function (crash) {
                    var markerColor = crash.p === 1
                        ? participantColors.pedestrian
                        : crash.c === 1
                            ? participantColors.cyclist
                            : participantColors.motorist;

                    var circle = L.circleMarker([crash.x, crash.y], {
                        radius: 5,
                        color: markerColor,
                        fillColor: markerColor,
                        fillOpacity: 0.8,
                        opacity: 0.8,
                        weight: 0,
                    }).bindPopup(
                        '<strong>Crash ID ' + crash.id + '</strong><br />'
                        + tsToDate(crash.d * tsCoef) + ' at ' + crash.t
                        + '<br />Injury Severity: ' + (crash.s === 'K' ? 'Fatality' : crash.s === 'A' ? 'Any Injury' : 'Property damage only'),
                        { minWidth: 300 }
                    )

                    individualPoints.addLayer(circle);
                })

            }

            // Zoomed out enough for a heatmap
            else {
                heat.setLatLngs(
                    crashesFiltered.map(function (point) {
                        return [point.x, point.y, intensity / 3.0];
                    })
                )
            }

        }

        var crashDates = data.map(function (point) { return point.d * tsCoef; });
        var minCrashDate = crashDates.length ? Math.min.apply(Math, crashDates) : dateToTS(new Date(2015, 0, 1));
        var maxCrashDate = crashDates.length ? Math.max.apply(Math, crashDates) : dateToTS(new Date(2026, 0, 1));

        initFrom = Math.max(initFrom, minCrashDate);
        initTo = Math.min(initTo, maxCrashDate);
        if (initFrom > initTo) {
            initFrom = minCrashDate;
            initTo = maxCrashDate;
        }

        // Initialize Ion range slider
        var slider = $(".js-range-slider").ionRangeSlider({
            type: 'double',

            min: minCrashDate,
            max: maxCrashDate,

            from: initFrom,
            to: initTo,

            prettify: tsToDate,
            grid: true,
            grid_num: 4,

            onChange: function (sliderData) {
                updateHeatLayer(sliderData.from, sliderData.to);
            }
        });


        // Re-draw heat layer when any filter (apart from street labels)
        // is changed
        $('#filters input').not('#labels').change(function (e) {
            updateHeatLayer(
                slider[0].value.split(';')[0],
                slider[0].value.split(';')[1]
            )
        })


        // Toggle street/town labels
        $('#labels').change(function (e) {
            if ($('#labels').prop('checked')) {
                labels.addTo(map);
            } else {
                map.removeLayer(labels);
            }
        })

        map.on('zoomend', function () {
            updateHeatLayer(
                slider[0].value.split(';')[0],
                slider[0].value.split(';')[1]
            )
        })

        // Set default properties
        $('#filters input').not('#pointsOnly').prop('checked', 'checked');
        $('#propertyDamageOnly').prop('checked', false);
        $('#intensity').val(5);
        updateHeatLayer(initFrom, initTo);

    }
})

L.control.attribution({
    prefix: 'View <a href="https://github.com/bikewesthartford/wh-crashes">code on GitHub</a> \
      and <a href="https://github.com/Picturedigits/hartford-crashes">original version by PictureDigits</a>'
}).addTo(map)
