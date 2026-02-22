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

function tsToInputDate(ts) {
    var d = new Date(ts);
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}

function inputDateToTS(inputDate) {
    var d = new Date(inputDate + 'T00:00:00');
    return dateToTS(d);
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
        var markerCache = new Map();
        var visibleMarkerIds = new Set();
        var participantColors = {
            pedestrian: '#fb8072',
            cyclist: '#fdb462',
            motorist: '#bebada'
        };
        var getMarkerColor = function (crash) {
            return crash.p === 1
                ? participantColors.pedestrian
                : crash.c === 1
                    ? participantColors.cyclist
                    : participantColors.motorist;
        };
        var getPopupHtml = function (crash) {
            return '<strong>Crash ID ' + crash.id + '</strong><br />'
                + tsToDate(crash.d * tsCoef) + ' at ' + crash.t
                + '<br />Injury Severity: ' + (crash.s === 'K' ? 'Fatality' : crash.s === 'A' ? 'Any Injury' : 'Property damage only');
        };
        var getOrCreateMarker = function (crash) {
            var cacheKey = String(crash.id);
            var marker = markerCache.get(cacheKey);
            if (marker) {
                return marker;
            }

            var markerColor = getMarkerColor(crash);
            marker = L.circleMarker([crash.x, crash.y], {
                radius: 5,
                color: markerColor,
                fillColor: markerColor,
                fillOpacity: 0.8,
                opacity: 0.8,
                weight: 0,
            });

            // Bind popup lazily so unclicked points avoid popup object allocation.
            marker.on('click', function () {
                if (!marker.getPopup()) {
                    marker.bindPopup(getPopupHtml(crash), { minWidth: 300 });
                }
                marker.openPopup();
            });

            markerCache.set(cacheKey, marker);
            return marker;
        };

        var tsCoef = 100000.0 // original timestamp needs to be multiplied by this to work in JS

        var updateStatsDashboard = function (crashesTotal, crashesPed, crashesCyc, crashesFatal, crashesWithInjury) {
            $('#statTotal').text(crashesTotal.toLocaleString());
            $('#statPed').text(crashesPed.toLocaleString());
            $('#statCyc').text(crashesCyc.toLocaleString());
            $('#statFatal').text(crashesFatal.toLocaleString());
            $('#statInjury').text(crashesWithInjury.toLocaleString());
        };

        // Given `from` and `to` timestamps, updates the heatmap layer.
        var updateHeatLayer = function (from, to) {

            from = dateToTS(new Date(from * 1).setHours(0, 0, 0, 0)) / tsCoef;
            to = dateToTS(new Date(to * 1).setHours(23, 59, 59, 0)) / tsCoef;

            // All crashes between set dates
            var crashes = data.filter(function (point) {
                return point.d >= from && point.d <= to;
            })

            var crashesFiltered = crashes.filter(function (point) {
                var selectedRoadway = $('#roadAll').prop('checked')
                    ? 'all'
                    : $('#roadLocalState').prop('checked')
                        ? 'localState'
                        : 'interstate';
                var hasRoadClass = point.r !== null && point.r !== undefined;
                var passesRoadway = !hasRoadClass || selectedRoadway === 'all'
                    || (selectedRoadway === 'localState' && point.r !== 1)
                    || (selectedRoadway === 'interstate' && point.r === 1);

                return passesRoadway

                    && (($('#vehiclesOnly').prop('checked') ? (point.c === 0 && point.p === 0) : false)
                        || ($('#cyclists').prop('checked') ? point.c === 1 : false)
                        || ($('#pedestrians').prop('checked') ? point.p === 1 : false))

                    && (($('#fatalInjury').prop('checked') ? point.s === 'K' : false)
                        || ($('#anyInjury').prop('checked') ? point.s === 'A' : false)
                        || ($('#propertyDamageOnly').prop('checked') ? point.s === 'O' : false))
            });

            updateStatsDashboard(
                crashes.length, // Total crashes in date range
                crashes.filter(function (p) { return p.p === 1 }).length,  // Ped crashes in date range
                crashes.filter(function (p) { return p.c === 1 }).length,  // Cyc crashes in date range
                crashes.filter(function (p) { return p.s === 'K' }).length,  // Fatal crashes in date range
                crashes.filter(function (p) { return p.s === 'A' }).length  // Any-injury crashes in date range
            );

            // Update the heatlayer
            var intensity = $('#intensity').val();

            var forcePoints = $('#viewPoints').prop('checked');
            var autoPointsAtZoom = $('#viewHeatmap').prop('checked') && map.getZoom() >= 18;
            var showPoints = forcePoints || autoPointsAtZoom;
            $('#intensity').prop('disabled', showPoints);
            $('.intensity-wrapper').toggleClass('is-disabled', showPoints);

            if (showPoints) {

                heat.setLatLngs([]);

                var nextVisibleMarkerIds = new Set();
                crashesFiltered.forEach(function (crash) {
                    var cacheKey = String(crash.id);
                    nextVisibleMarkerIds.add(cacheKey);
                    if (!visibleMarkerIds.has(cacheKey)) {
                        individualPoints.addLayer(getOrCreateMarker(crash));
                    }
                });

                visibleMarkerIds.forEach(function (cacheKey) {
                    if (!nextVisibleMarkerIds.has(cacheKey)) {
                        var marker = markerCache.get(cacheKey);
                        if (marker) {
                            individualPoints.removeLayer(marker);
                        }
                    }
                });

                visibleMarkerIds = nextVisibleMarkerIds;

            }

            // Zoomed out enough for a heatmap
            else {
                if (visibleMarkerIds.size > 0) {
                    visibleMarkerIds.forEach(function (cacheKey) {
                        var marker = markerCache.get(cacheKey);
                        if (marker) {
                            individualPoints.removeLayer(marker);
                        }
                    });
                    visibleMarkerIds.clear();
                }

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

        var dateFromInput = $('#dateFrom');
        var dateToInput = $('#dateTo');
        var minDateString = tsToInputDate(minCrashDate);
        var maxDateString = tsToInputDate(maxCrashDate);
        var fromDateString = tsToInputDate(initFrom);
        var toDateString = tsToInputDate(initTo);

        dateFromInput.attr('min', minDateString);
        dateFromInput.attr('max', maxDateString);
        dateToInput.attr('min', minDateString);
        dateToInput.attr('max', maxDateString);
        dateFromInput.val(fromDateString);
        dateToInput.val(toDateString);

        var updateFromInputs = function () {
            var fromTS = inputDateToTS(dateFromInput.val());
            var toTS = inputDateToTS(dateToInput.val());
            if (Number.isNaN(fromTS) || Number.isNaN(toTS)) {
                return;
            }
            updateHeatLayer(fromTS, toTS);
        };

        dateFromInput.on('change', function () {
            if (dateFromInput.val() > dateToInput.val()) {
                dateToInput.val(dateFromInput.val());
            }
            updateFromInputs();
        });

        dateToInput.on('change', function () {
            if (dateToInput.val() < dateFromInput.val()) {
                dateFromInput.val(dateToInput.val());
            }
            updateFromInputs();
        });


        // Re-draw heat layer when any filter (apart from street labels)
        // is changed
        $('#filters input').not('#labels').change(function (e) {
            updateFromInputs();
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
            updateFromInputs();
        })

        // Set default properties
        $('#filters input[type="checkbox"]').prop('checked', 'checked');
        $('#propertyDamageOnly').prop('checked', false);
        $('#viewHeatmap').prop('checked', true);
        $('#intensity').val(5);
        updateHeatLayer(initFrom, initTo);

    }
})

L.control.attribution({
    prefix: 'View <a href="https://github.com/bikewesthartford/wh-crashes">code on GitHub</a> \
      and <a href="https://github.com/Picturedigits/hartford-crashes">original version by PictureDigits</a>'
}).addTo(map)
