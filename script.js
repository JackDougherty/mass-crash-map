var _initPermalink = (function () {
    var h = window.location.hash.slice(1);
    if (!h) return null;
    var p = {};
    h.split('&').forEach(function (s) {
        var i = s.indexOf('=');
        if (i > 0) p[decodeURIComponent(s.slice(0, i))] = decodeURIComponent(s.slice(i + 1));
    });
    return Object.keys(p).length ? p : null;
}());

var map = L.map('map', {
    zoomControl: false,
    center: (_initPermalink && _initPermalink.lat && _initPermalink.lng) ? [parseFloat(_initPermalink.lat), parseFloat(_initPermalink.lng)] : [42.34, -71.08],
    zoom: (_initPermalink && _initPermalink.z) ? parseInt(_initPermalink.z) : 13,
    minZoom: 10,
    attributionControl: false,
    preferCanvas: true
})

L.control.zoom({ position: 'topright' }).addTo(map)

var search = new GeoSearch.GeoSearchControl({
    provider: new GeoSearch.OpenStreetMapProvider({
        params: {
            'accept-language': 'en',
            'countrycodes': 'us',
            'viewbox': '-73.62,41.15,-69.71,42.89',
            'bounded': 1
        }
    }),
    style: 'button',
    searchLabel: 'Search place in MA',
    position: 'topright',
})
map.addControl(search)

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

// display initial date, where Jan = 0 and Dec = 11, but year and date are normal
var initFrom = dateToTS(new Date(2021, 0, 1));
var initTo = dateToTS(new Date(2026, 6, 1));

var tsCoef = 100000.0;

var data = [];
var pendingPermalink = null;
var heat = L.heatLayer([], { radius: 20 }).addTo(map);
var individualPoints = L.layerGroup().addTo(map);
var markerCache = new Map();
var visibleMarkerIds = new Set();

var severityColors = { K: '#e41a1c', I: '#fdb462', O: '#74add1' };
var pedPath = 'M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9 1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z';
var cycPath = 'M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5S3.1 13.5 5 13.5s3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10 2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6l-2.2-2.5zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z';

// Pre-create 6 divIcons (2 types × 3 severities) for ped/cyclist only.
// Motorist circles are rendered on canvas for performance.
var canvasRenderer = L.canvas();
var markerIcons = {};
['K', 'I', 'O'].forEach(function (sev) {
    var c = severityColors[sev];
    markerIcons[sev] = {
        pedestrian: L.divIcon({ html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" style="cursor:pointer"><circle cx="12" cy="12" r="12" fill="' + c + '" fill-opacity="0.9"/><path d="' + pedPath + '" fill="white"/></svg>', className: '', iconSize: [26, 26], iconAnchor: [13, 13] }),
        cyclist:    L.divIcon({ html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" style="cursor:pointer"><circle cx="12" cy="12" r="12" fill="' + c + '" fill-opacity="0.9"/><path d="' + cycPath + '" fill="white"/></svg>', className: '', iconSize: [26, 26], iconAnchor: [13, 13] }),
        other:      L.divIcon({ html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" style="cursor:pointer"><circle cx="12" cy="12" r="12" fill="' + c + '" fill-opacity="0.9"/><line x1="7" y1="7" x2="17" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="17" y1="7" x2="7" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>', className: '', iconSize: [26, 26], iconAnchor: [13, 13] }),
    };
});

function normalizeCrash(row) {
    if (!row || row.id == null || !row.date || row.lat == null || row.lng == null) return null;
    var dateString = String(row.date).trim();
    var timeString = row.time ? String(row.time).trim() : '12:00 AM';
    // Parse YYYY-MM-DD or MM/DD/YYYY as local date
    var dateValue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        var isoParts = dateString.split('-');
        dateValue = new Date(Number(isoParts[0]), Number(isoParts[1]) - 1, Number(isoParts[2]));
    } else {
        var dateParts = dateString.split('/');
        if (dateParts.length !== 3) return null;
        dateValue = new Date(Number(dateParts[2]), Number(dateParts[0]) - 1, Number(dateParts[1]));
    }
    if (Number.isNaN(dateValue.valueOf())) return null;
    // Normalize HH:MM:SS (24h) to H:MM AM/PM
    if (/^\d{2}:\d{2}:\d{2}$/.test(timeString)) {
        var tp = timeString.split(':');
        var h = Number(tp[0]);
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        timeString = h + ':' + tp[1] + ' ' + ampm;
    }
    var severityCode = row.severity == null || row.severity === '' ? null : Number(row.severity);
    var severity = !severityCode ? 'O' : severityCode === 1 ? 'K' : severityCode === 2 ? 'I' : 'O';
    var lat = Number(row.lat);
    var lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    var hasInterstateColumn = Object.prototype.hasOwnProperty.call(row, 'interstate');
    var roadwayClass = null;
    if (hasInterstateColumn) {
        // CSV contract: interstate=1 means true; blank means false/local roads.
        roadwayClass = Number(row.interstate) === 1 ? 1 : 0;
    } else if (row.r != null && row.r !== '') {
        roadwayClass = Number(row.r) === 1 ? 1 : 0;
    }
    return {
        source: row.source, id: row.id, muni: row.muni, police: row.police,
        x: lat, y: lng,
        k: dateString, t: timeString,
        d: dateToTS(dateValue) / 100000.0,
        s: severity,
        p: Number(row.pedestrian) === 1 ? 1 : 0,
        c: Number(row.cyclist) === 1 ? 1 : 0,
        o: Number(row.other) === 1 ? 1 : 0,
        // Roadway class: 1 = interstate, 0 = local/state, null = unknown (legacy fallback only).
        r: roadwayClass
    };
}

function getPopupHtml(crash) {
    return '<strong>Crash ID ' + crash.id + '</strong><br />'
        + tsToDate(crash.d * tsCoef) + ' at ' + crash.t
        + '<br />Source: ' + (crash.source || 'Unknown')
        + '<br />Municipality: ' + (crash.muni || 'Unknown')
        + '<br />Police agency: ' + (crash.police || 'Unknown')
        + '<br />Injury level: ' + (crash.s === 'K' ? 'Fatality' : crash.s === 'I' ? 'Any Injury' : 'Property damage only')
        + '<br />Pedestrian: ' + (crash.p === 1 ? 'True' : 'False')
        + '<br />Cyclist: ' + (crash.c === 1 ? 'True' : 'False')
        + '<br />Other vulnerable road user: ' + (crash.o === 1 ? 'True' : 'False');
}

function getOrCreateMarker(crash) {
    var cacheKey = String(crash.id);
    var marker = markerCache.get(cacheKey);
    if (marker) return marker;
    var sev = crash.s === 'K' ? 'K' : crash.s === 'I' ? 'I' : 'O';
    if (crash.p === 1 && crash.c !== 1 && crash.o !== 1) {
        marker = L.marker([crash.x, crash.y], { icon: markerIcons[sev].pedestrian });
    } else if (crash.c === 1 && crash.p !== 1 && crash.o !== 1) {
        marker = L.marker([crash.x, crash.y], { icon: markerIcons[sev].cyclist });
    } else if (crash.o === 1) {
        marker = L.marker([crash.x, crash.y], { icon: markerIcons[sev].other });
    } else {
        var color = severityColors[sev];
        marker = L.circleMarker([crash.x, crash.y], {
            renderer: canvasRenderer, radius: 6,
            color: color, fillColor: color, fillOpacity: 0.8, opacity: 0.8, weight: 0,
        });
    }
    marker.on('click', function () {
        L.popup({ minWidth: 300 })
            .setContent(getPopupHtml(crash))
            .setLatLng([crash.x, crash.y])
            .openOn(map);
    });
    markerCache.set(cacheKey, marker);
    return marker;
}

function updateStatsDashboard(crashesTotal, crashesPed, crashesCyc, crashesFatal, crashesWithInjury) {
    $('#statTotal').text(crashesTotal.toLocaleString());
    $('#statPed').text(crashesPed.toLocaleString());
    $('#statCyc').text(crashesCyc.toLocaleString());
    $('#statFatal').text(crashesFatal.toLocaleString());
    $('#statInjury').text(crashesWithInjury.toLocaleString());
}

function updatePermalink() {
    var c = map.getCenter();
    var invMap = { pedestrians: 'ped', cyclists: 'cyc', other: 'other', vehiclesOnly: 'veh' };
    var harmMap = { fatalInjury: 'fatal', anyInjury: 'any', propertyDamageOnly: 'pdo' };
    var roadsMap = { roadLocalState: 'local', roadInterstate: 'interstate' };
    var inv = Object.keys(invMap).filter(function (id) { return $('#' + id).prop('checked'); }).map(function (id) { return invMap[id]; });
    var harm = Object.keys(harmMap).filter(function (id) { return $('#' + id).prop('checked'); }).map(function (id) { return harmMap[id]; });
    var roads = Object.keys(roadsMap).filter(function (id) { return $('#' + id).prop('checked'); }).map(function (id) { return roadsMap[id]; });
    var parts = [
        'lat=' + c.lat.toFixed(5),
        'lng=' + c.lng.toFixed(5),
        'z=' + map.getZoom(),
        'region=' + encodeURIComponent($('#regionFilter').val()),
        'opacity=' + $('#intensity').val(),
        'from=' + $('#dateFrom').val(),
        'to=' + $('#dateTo').val(),
        'view=' + ($('#viewPoints').prop('checked') ? 'points' : 'heatmap'),
        'inv=' + inv.join(','),
        'harm=' + harm.join(','),
        'roads=' + roads.join(','),
        'labels=' + ($('#labels').prop('checked') ? '1' : '0')
    ];
    history.replaceState(null, '', '#' + parts.join('&'));
}

// Given `from` and `to` timestamps, updates the heatmap layer.
function updateHeatLayer(from, to, shouldFitMap) {
    from = dateToTS(new Date(from * 1).setHours(0, 0, 0, 0)) / tsCoef;
    to = dateToTS(new Date(to * 1).setHours(23, 59, 59, 0)) / tsCoef;

    // All crashes between set dates
    var crashes = data.filter(function (point) {
        return point.d >= from && point.d <= to;
    });

    var crashesFiltered = crashes.filter(function (point) {
        var localState = $('#roadLocalState').prop('checked');
        var interstate = $('#roadInterstate').prop('checked');
        var passesRoadway = (localState && point.r !== 1) || (interstate && point.r === 1);

        return passesRoadway

            && (($('#vehiclesOnly').prop('checked') ? (point.c === 0 && point.p === 0 && point.o === 0) : false)
                || ($('#cyclists').prop('checked') ? point.c === 1 : false)
                || ($('#pedestrians').prop('checked') ? point.p === 1 : false)
                || ($('#other').prop('checked') ? point.o === 1 : false))

            && (($('#fatalInjury').prop('checked') ? point.s === 'K' : false)
                || ($('#anyInjury').prop('checked') ? point.s === 'I' : false)
                || ($('#propertyDamageOnly').prop('checked') ? point.s === 'O' : false));
    });

    updateStatsDashboard(
        crashes.length, // Total crashes in date range
        crashes.filter(function (p) { return p.p === 1 }).length,  // Ped crashes in date range
        crashes.filter(function (p) { return p.c === 1 }).length,  // Cyc crashes in date range
        crashes.filter(function (p) { return p.s === 'K' }).length,  // Fatal crashes in date range
        crashes.filter(function (p) { return p.s === 'I' }).length  // Any-injury crashes in date range
    );

    var intensity = $('#intensity').val();
    var forcePoints = $('#viewPoints').prop('checked');
    var autoPointsAtZoom = $('#viewHeatmap').prop('checked') && map.getZoom() >= 15;
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
                if (marker) individualPoints.removeLayer(marker);
            }
        });
        visibleMarkerIds = nextVisibleMarkerIds;
    } else {
        // Zoomed out enough for a heatmap
        if (visibleMarkerIds.size > 0) {
            visibleMarkerIds.forEach(function (cacheKey) {
                var marker = markerCache.get(cacheKey);
                if (marker) individualPoints.removeLayer(marker);
            });
            visibleMarkerIds.clear();
        }
        heat.setLatLngs(
            crashesFiltered.map(function (point) {
                return [point.x, point.y, intensity / 3.0];
            })
        );
    }

    if (shouldFitMap && crashesFiltered.length > 0) {
        map.fitBounds(
            crashesFiltered.map(function (point) { return [point.x, point.y]; }),
            { padding: [24, 24] }
        );
    }

    updatePermalink();
}

var dateFromInput = $('#dateFrom');
var dateToInput = $('#dateTo');

function updateFromInputs(shouldFitMap) {
    var fromTS = inputDateToTS(dateFromInput.val());
    var toTS = inputDateToTS(dateToInput.val());
    if (Number.isNaN(fromTS) || Number.isNaN(toTS)) return;
    updateHeatLayer(fromTS, toTS, Boolean(shouldFitMap));
}

function loadRegion(region) {
    Papa.parse('./data/' + region.toLowerCase() + '.csv', {
        download: true,
        header: true,
        dynamicTyping: true,
        error: function(err) { alert('Failed to laod data: ' + err.message); },
        complete: function (result) {
            // Clear existing map state before loading new region
            individualPoints.clearLayers();
            markerCache.clear();
            visibleMarkerIds.clear();
            heat.setLatLngs([]);

            data = result.data.map(normalizeCrash).filter(Boolean);

            var crashDates = data.map(function (point) { return point.d * tsCoef; });
            var minCrashDate = crashDates.length ? crashDates.reduce(function(a, b) { return a < b ? a : b; }) : dateToTS(new Date(2015, 0, 1));
            var maxCrashDate = crashDates.length ? crashDates.reduce(function(a, b) { return a > b ? a : b; }) : dateToTS(new Date(2026, 0, 1));

            var from = Math.max(initFrom, minCrashDate);
            var to = Math.min(initTo, maxCrashDate);
            if (from > to) { from = minCrashDate; to = maxCrashDate; }

            var minStr = tsToInputDate(minCrashDate);
            var maxStr = tsToInputDate(maxCrashDate);
            dateFromInput.attr('min', minStr).attr('max', maxStr);
            dateToInput.attr('min', minStr).attr('max', maxStr);
            if (pendingPermalink && pendingPermalink.from && pendingPermalink.to) {
                dateFromInput.val(pendingPermalink.from);
                dateToInput.val(pendingPermalink.to);
                pendingPermalink = null;
                updateFromInputs(false);
            } else {
                dateFromInput.val(tsToInputDate(from));
                dateToInput.val(tsToInputDate(to));
                updateFromInputs(true);
            }
        }
    });
}

// Set up event listeners once
dateFromInput.on('change', function () {
    if (dateFromInput.val() > dateToInput.val()) dateToInput.val(dateFromInput.val());
    updateFromInputs();
});

dateToInput.on('change', function () {
    if (dateToInput.val() < dateFromInput.val()) dateFromInput.val(dateToInput.val());
    updateFromInputs();
});

$('#regionFilter').on('change', function () {
    loadRegion($(this).val());
});

// Re-draw heat layer when any filter (apart from street labels) is changed
$('#filters input').not('#labels').change(function () {
    updateFromInputs();
});

// Toggle legend body on mobile
$('#legendToggle').on('click', function () {
    var isOpen = $('#legendBody').hasClass('is-open');
    $('#legendBody').toggleClass('is-open', !isOpen);
    $(this).attr('aria-expanded', !isOpen);
    $(this).html(isOpen ? '&#9660;' : '&#9650;');
});

// Toggle street/town labels
$('#labels').change(function () {
    if ($('#labels').prop('checked')) {
        labels.addTo(map);
    } else {
        map.removeLayer(labels);
    }
});

var MIN_POINTS_ZOOM = 15;
var _prevZoom = map.getZoom();

function updateViewModeAvailability() {
    var zoom = map.getZoom();
    var canShowPoints = zoom >= MIN_POINTS_ZOOM;
    $('#viewPoints').prop('disabled', !canShowPoints);
    $('#viewPoints').closest('label').toggleClass('is-disabled', !canShowPoints);
    $('#viewHeatmap').prop('disabled', canShowPoints);
    $('#viewHeatmap').closest('label').toggleClass('is-disabled', canShowPoints);
    // Auto-shift points → heatmap when zooming out below threshold (avoids map slowdown)
    if (!canShowPoints && $('#viewPoints').prop('checked')) {
        $('#viewHeatmap').prop('checked', true);
    }
}

map.on('zoomend', function () {
    var zoom = map.getZoom();
    // Auto-shift heatmap → points when crossing zoom threshold going in
    if (_prevZoom < MIN_POINTS_ZOOM && zoom >= MIN_POINTS_ZOOM && $('#viewHeatmap').prop('checked')) {
        $('#viewPoints').prop('checked', true);
    }
    _prevZoom = zoom;
    updateViewModeAvailability();
    updateFromInputs();
});

map.on('moveend', updatePermalink);

$('.view-mode-toggle input').change(function () {
    updateFromInputs();
});

$('#intensity').on('change', function () {
    updateFromInputs();
});

// Set default UI state and load initial data
$('#filters input[type="checkbox"]').prop('checked', 'checked');
$('#propertyDamageOnly').prop('checked', false);
$('#viewHeatmap').prop('checked', true);
$('#intensity').val(5);
$('#regionFilter').val('boston-metro');

if (_initPermalink) {
    if (_initPermalink.opacity) $('#intensity').val(_initPermalink.opacity);
    if (_initPermalink.view === 'points') $('#viewPoints').prop('checked', true);
    else $('#viewHeatmap').prop('checked', true);

    var _inv = _initPermalink.inv ? _initPermalink.inv.split(',') : [];
    $('#pedestrians').prop('checked', _inv.indexOf('ped') >= 0);
    $('#cyclists').prop('checked', _inv.indexOf('cyc') >= 0);
    $('#other').prop('checked', _inv.indexOf('other') >= 0);
    $('#vehiclesOnly').prop('checked', _inv.indexOf('veh') >= 0);

    var _harm = _initPermalink.harm ? _initPermalink.harm.split(',') : [];
    $('#fatalInjury').prop('checked', _harm.indexOf('fatal') >= 0);
    $('#anyInjury').prop('checked', _harm.indexOf('any') >= 0);
    $('#propertyDamageOnly').prop('checked', _harm.indexOf('pdo') >= 0);

    var _roads = _initPermalink.roads ? _initPermalink.roads.split(',') : [];
    $('#roadLocalState').prop('checked', _roads.indexOf('local') >= 0);
    $('#roadInterstate').prop('checked', _roads.indexOf('interstate') >= 0);

    if (_initPermalink.labels === '0') { $('#labels').prop('checked', false); map.removeLayer(labels); }

    if (_initPermalink.region) $('#regionFilter').val(_initPermalink.region);

    pendingPermalink = _initPermalink;
}

var regionToLoad = (_initPermalink && _initPermalink.region) ? _initPermalink.region : 'boston-metro';
updateViewModeAvailability();
loadRegion(regionToLoad);

L.control.attribution({
    prefix: '<a href="https://github.com/Picturedigits/mass-crash-map">Code by Picturedigits</a> + <a href="https://labs.bostoncyclistsunion.org">BCU Labs</a> + <a href="https://github.com/BU-Spark">BU Spark!</a>'
}).addTo(map)
