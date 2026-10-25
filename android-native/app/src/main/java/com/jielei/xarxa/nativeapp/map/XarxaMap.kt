package com.jielei.xarxa.nativeapp.map

import android.graphics.PointF
import android.graphics.RectF
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.repeatOnLifecycle
import com.jielei.xarxa.nativeapp.BuildConfig
import com.jielei.xarxa.nativeapp.Perf
import com.jielei.xarxa.nativeapp.domain.Station
import com.jielei.xarxa.nativeapp.domain.TrainPosition
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.expressions.Expression.get
import org.maplibre.android.style.expressions.Expression.literal
import org.maplibre.android.style.expressions.Expression.zoom
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory.*
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource

const val DEFAULT_ZOOM = 12.3
const val STATION_FOCUS_ZOOM = 14.6
val DEFAULT_CENTER = LatLng(39.4699, -0.3763)
const val DIM_OPACITY = 0.2f

/** A one-shot camera instruction; [nonce] makes repeated identical requests distinct. */
sealed interface CameraRequest {
    val nonce: Long
    data class FocusStation(val station: Station, override val nonce: Long) : CameraRequest
    data class ShowUser(val lat: Double, val lon: Double, override val nonce: Long) : CameraRequest
    /** The sheet closed: pull back from [station], centred on it. */
    data class ZoomOutFrom(val station: Station, override val nonce: Long) : CameraRequest
}

/**
 * The single zoom curve for markers. Up to zoom 12.3 it is the web's scale, clamp((zoom - 7.5) / 4, 0, 1.2)
 * (MapView.jsx applyMarkerScale); past it the markers keep growing, +0.12 per zoom level, instead of freezing.
 * Everything is piecewise linear in zoom with a stop at each knee, so sizes grow continuously and monotonically.
 */
private fun zoomCurve(z: Double): Float = (if (z <= 12.3) (z - 7.5) / 4.0 else 1.2 + 0.12 * (z - 12.3)).toFloat().coerceAtLeast(0f)

/** Train markers are 1.1 of the web scale where station dots are 1.2 (28 px disc against the dot's 10 px basis). */
private fun trainCurve(z: Double): Float = zoomCurve(z) * (1.1f / 1.2f)

/** Marker update period: ~30 updates a second. */
private const val TRAIN_FRAME_MS = 33L
private const val TRAIN_FRAME_MOVING_MS = 100L
private const val STATION_SCALE = 0.85f
private const val TRAIN_SCALE = 0.85f
private val CURVE_KNEES = doubleArrayOf(9.0, 9.7, 12.3, 18.0, 22.0)

private fun zoomStops(value: (Double) -> Float): Expression = Expression.interpolate(
    Expression.linear(), zoom(),
    *CURVE_KNEES.map { Expression.stop(it, value(it)) }.toTypedArray(),
)

private const val ST_SRC = "stations"
private const val TR_SRC = "trains"
private const val USER_SRC = "user"
private const val TRAIN_PULSE = "trains-pulse"

@Composable
fun XarxaMap(
    modifier: Modifier,
    dark: Boolean,
    linesGeoJson: String,
    stations: List<Station>,
    lineColors: Map<String, Long>,
    filter: Set<String>,
    selected: Station?,
    userLocation: LatLng?,
    cameraRequest: CameraRequest?,
    topInsetPx: Int,
    bottomInsetPx: Int,
    trains: () -> List<TrainPosition>,
    onStationTap: (Station?) -> Unit,
    contentDescription: String,
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val density = LocalDensity.current
    val mapView = remember { MapView(context) }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleVersion by remember { mutableIntStateOf(0) }
    val stationsById = remember(stations) { stations.associateBy { it.id } }
    val tapCallback by rememberUpdatedState(onStationTap)
    val requestNonce by rememberUpdatedState(cameraRequest?.nonce ?: 0L)
    var stationPxLogged by remember { mutableStateOf(false) }
    val gestureInterrupted = remember { mutableLongStateOf(-1L) }
    val zoomOutApplied = remember { mutableLongStateOf(-1L) }
    val cameraMoving = remember { java.util.concurrent.atomic.AtomicBoolean(false) }
    val stationsNow by rememberUpdatedState(stationsById)

    DisposableEffect(lifecycle, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> {}
            }
        }
        lifecycle.addObserver(observer)
        mapView.onCreate(null)
        // The lifecycle may already be started; replay the missed events.
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) mapView.onStart()
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onResume()
        mapView.addOnDidFinishRenderingMapListener { fully ->
            if (fully) {
                Perf.once("map_fully_rendered")
                if (BuildConfig.PERF && !stationPxLogged) {
                    stationPxLogged = true
                    map?.let { mm ->
                        for (st in stationsNow.values) if (st.apiId == 17 || st.apiId == 15) {
                            val p = mm.projection.toScreenLocation(LatLng(st.lat, st.lon))
                            Perf.info("stpx api=${st.apiId} id=${st.id} x=${p.x.toInt()} y=${p.y.toInt()}")
                        }
                    }
                }
            }
        }
        mapView.addOnDidFinishRenderingFrameListener { _, _, _ -> Perf.once("first_frame"); Perf.frame() }
        mapView.getMapAsync { m ->
            Perf.once("map_async")
            m.uiSettings.isCompassEnabled = false
            m.uiSettings.isLogoEnabled = false
            m.uiSettings.isRotateGesturesEnabled = false
            m.uiSettings.isTiltGesturesEnabled = false
            m.setMinZoomPreference(9.0)
            m.setMaxZoomPreference(19.0)
            m.cameraPosition = CameraPosition.Builder().target(DEFAULT_CENTER).zoom(DEFAULT_ZOOM).build()
            m.addOnMapClickListener { latLng ->
                val px = m.projection.toScreenLocation(latLng)
                val r = with(density) { 22.dp.toPx() }
                val hits = m.queryRenderedFeatures(RectF(px.x - r, px.y - r, px.x + r, px.y + r), "stations-circle")
                val best = hits.mapNotNull { f ->
                    val id = f.getStringProperty("id") ?: return@mapNotNull null
                    val st = stationsNow[id] ?: return@mapNotNull null
                    val p = m.projection.toScreenLocation(LatLng(st.lat, st.lon))
                    st to PointF(p.x - px.x, p.y - px.y).length()
                }.minByOrNull { it.second }?.first
                if (best != null) { Perf.reset("sheet_arrivals:${best.id}"); Perf.mark("tap:${best.id}") }
                tapCallback(best)
                best != null
            }
            m.addOnCameraMoveStartedListener { reason ->
                cameraMoving.set(true)
                if (reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE) gestureInterrupted.longValue = requestNonce
                Perf.info("camera start reason=$reason zoom=%.2f".format(java.util.Locale.ROOT, m.cameraPosition.zoom)) }
            m.addOnCameraIdleListener { cameraMoving.set(false); Perf.mark("cam_idle"); m.cameraPosition.let { Perf.info("camera idle zoom=%.2f lat=%.5f lon=%.5f".format(java.util.Locale.ROOT, it.zoom, it.target?.latitude ?: 0.0, it.target?.longitude ?: 0.0)) } }
            map = m
        }
        onDispose {
            lifecycle.removeObserver(observer)
            mapView.onPause(); mapView.onStop(); mapView.onDestroy()
        }
    }

    // Basemap style per theme; layers are rebuilt on every style load.
    LaunchedEffect(map, dark) {
        val m = map ?: return@LaunchedEffect
        val uri = "asset://basemap/style-${if (dark) "dark" else "light"}.json"
        m.setStyle(Style.Builder().fromUri(uri)) { style ->
            (style.getSource("metro-lines") as? GeoJsonSource)?.setGeoJson(linesGeoJson)
            installLayers(style, dark, lineColors, context.resources.displayMetrics.densityDpi)
            Perf.once("style_loaded")
            styleVersion++
        }
    }

    val style: Style? = map?.style?.takeIf { it.isFullyLoaded && styleVersion > 0 }

    // Stations: colour ring of their first line; dimmed when a filter excludes all their lines.
    LaunchedEffect(style, styleVersion, stations, filter, lineColors) {
        val s = style ?: return@LaunchedEffect
        (s.getSource(ST_SRC) as? GeoJsonSource)?.setGeoJson(stationsJson(stations, lineColors, filter))
    }

    // Line dimming: filtered-out Lines drop to DIM_OPACITY, like lineOpacityExpression on the web.
    LaunchedEffect(style, styleVersion, filter) {
        val s = style ?: return@LaunchedEffect
        val lineOpacity: Expression = if (filter.isEmpty()) literal(1f) else Expression.switchCase(
            Expression.`in`(get("line"), literal(filter.toTypedArray())), literal(1f), literal(DIM_OPACITY),
        )
        (s.getLayer("metro-fill") as? LineLayer)?.setProperties(lineOpacity(lineOpacity))
        val casing: Expression = if (filter.isEmpty()) literal(0.35f) else Expression.switchCase(
            Expression.`in`(get("line"), literal(filter.toTypedArray())), literal(0.35f), literal(0.35f * DIM_OPACITY),
        )
        (s.getLayer("metro-casing") as? LineLayer)?.setProperties(lineOpacity(casing))
    }

    LaunchedEffect(style, styleVersion, selected?.id) {
        val s = style ?: return@LaunchedEffect
        (s.getLayer("stations-selected") as? CircleLayer)?.setFilter(
            Expression.eq(get("id"), literal(selected?.id ?: "")),
        )
    }

    LaunchedEffect(style, styleVersion, userLocation) {
        val s = style ?: return@LaunchedEffect
        val json = if (userLocation == null) """{"type":"FeatureCollection","features":[]}""" else
            """{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[${userLocation.longitude},${userLocation.latitude}]}}]}"""
        (s.getSource(USER_SRC) as? GeoJsonSource)?.setGeoJson(json)
    }

    // Train markers at ~4 Hz from the engine.
    val trainsNow by rememberUpdatedState(trains)
    val filterNow by rememberUpdatedState(filter)
    val colorsNow by rememberUpdatedState(lineColors)
    val selectedNow by rememberUpdatedState(selected)
    LaunchedEffect(style, styleVersion) {
        val s = style ?: return@LaunchedEffect
        val src = s.getSource(TR_SRC) as? GeoJsonSource ?: return@LaunchedEffect
        // Only while the screen is visible. The Timetable Walk is a function of time, so evaluating it at ~30 Hz
        // moves every train smoothly along its track; there is no per-tick stepping to interpolate.
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                val json = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) {
                    trainsJson(trainsNow(), colorsNow, filterNow, selectedNow)
                }
                // A theme change swaps the style under this loop; `s` is stale until styleVersion bumps and the effect
                // restarts. Checked after the off-thread work, which is where the swap can land.
                val live = map?.style
                if (live !== s || !live.isFullyLoaded) { delay(100L); continue }
                src.setGeoJson(json)
                if (json.length > 70) Perf.once("first_trains")
                // vehiclePulse: a 2 s ring that grows and fades, only while a Station is selected.
                (s.getLayer(TRAIN_PULSE) as? CircleLayer)?.let { pl ->
                    if (selectedNow == null) {
                        pl.setProperties(circleOpacity(0f))
                    } else {
                        val t = (System.currentTimeMillis() % 2000L) / 2000f
                        val phase = if (t < 0.5f) t * 2f else (1f - t) * 2f
                        pl.setProperties(
                            circleRadius(Expression.sum(zoomStops { 14f * TRAIN_SCALE * trainCurve(it) }, literal(6f * TRAIN_SCALE * phase))),
                            circleOpacity(0.55f * (1f - phase)),
                        )
                    }
                }
                // While the camera is moving the map is already re-tiling every frame: update the markers less often.
                delay(if (json.length <= 70) 1000L else if (cameraMoving.get()) TRAIN_FRAME_MOVING_MS else TRAIN_FRAME_MS)
            }
        }
    }

    // Camera.
    // A request is re-applied when the insets settle (the sheet is measured after the request), but never once
    // the viewer has touched the map since: that snapped the camera back to the station mid-gesture.
    LaunchedEffect(map, cameraRequest, bottomInsetPx, topInsetPx) {
        val m = map ?: return@LaunchedEffect
        val req = cameraRequest ?: return@LaunchedEffect
        if (gestureInterrupted.longValue == req.nonce) return@LaunchedEffect
        // The zoom-out target is relative to the camera now, so it must run once; the others are absolute and
        // are re-applied when the sheet's measured height settles.
        if (req is CameraRequest.ZoomOutFrom) {
            if (zoomOutApplied.longValue == req.nonce) return@LaunchedEffect
            zoomOutApplied.longValue = req.nonce
        }
        val clearance = with(density) { 56.dp.toPx() }.toDouble()
        when (req) {
            is CameraRequest.FocusStation -> {
                val pos = CameraPosition.Builder()
                    .target(LatLng(req.station.lat, req.station.lon))
                    .zoom(maxOf(m.cameraPosition.zoom, STATION_FOCUS_ZOOM))
                    .padding(0.0, topInsetPx.toDouble(), 0.0, bottomInsetPx.toDouble() + clearance / 2)
                    .build()
                m.easeCamera(CameraUpdateFactory.newCameraPosition(pos), CameraPlan.EASE_MS)
            }
            is CameraRequest.ShowUser -> {
                val pos = CameraPosition.Builder()
                    .target(LatLng(req.lat, req.lon))
                    .zoom(maxOf(m.cameraPosition.zoom, 14.0))
                    .padding(0.0, topInsetPx.toDouble(), 0.0, bottomInsetPx.toDouble())
                    .build()
                m.easeCamera(CameraUpdateFactory.newCameraPosition(pos), CameraPlan.EASE_MS)
            }
            is CameraRequest.ZoomOutFrom -> {
                val pos = CameraPosition.Builder()
                    .target(LatLng(req.station.lat, req.station.lon))
                    .zoom(CameraPlan.zoomOutTarget(m.cameraPosition.zoom))
                    .padding(0.0, 0.0, 0.0, 0.0)
                    .build()
                m.easeCamera(CameraUpdateFactory.newCameraPosition(pos), CameraPlan.EASE_MS)
            }
        }
    }

    AndroidView(
        factory = { mapView.also { it.contentDescription = contentDescription } },
        modifier = modifier,
    )
}

private fun installLayers(style: Style, dark: Boolean, lineColors: Map<String, Long>, densityDpi: Int) {
    val stationFill = if (dark) "#1D1D29" else "#FFFFFF"
    val halo = if (dark) "#1D1D29" else "#FFFFFF"
    val text = if (dark) "#F2F2F8" else "#1D1D29"

    style.addSource(GeoJsonSource(ST_SRC))
    style.addSource(GeoJsonSource(TR_SRC))
    style.addSource(GeoJsonSource(USER_SRC))

    val dimOpacity = Expression.switchCase(Expression.eq(get("dim"), literal(true)), literal(DIM_OPACITY), literal(1f))
    // Web station dot (MapView.jsx): 10 px disc, 2 px border in the first Line colour, drawn at
    // scale = clamp((zoom - 7.5) / 4, 0, 1.2) and hidden below scale 0.55 (zoom 9.7); soft drop shadow.
    // One zoom curve (see [zoomCurve]) drives every size: dot, ring, shadow and the selected highlight.
    val radius = zoomStops { 5f * STATION_SCALE * zoomCurve(it) }
    val strokeW = zoomStops { 2f * STATION_SCALE * zoomCurve(it) }
    style.addLayerAbove(
        CircleLayer("stations-shadow", ST_SRC).withProperties(
            circleRadius(radius), circleColor("#000000"), circleOpacity(0.28f), circleBlur(0.9f), circleTranslate(arrayOf(0f, 2f)),
        ).also { it.minZoom = 9.7f },
        "metro-fill",
    )
    style.addLayerAbove(
        CircleLayer("stations-circle", ST_SRC).withProperties(
            circleRadius(radius),
            circleColor(stationFill),
            circleStrokeColor(get("color")),
            circleStrokeWidth(strokeW),
            circleOpacity(dimOpacity),
            circleStrokeOpacity(dimOpacity),
        ).also { it.minZoom = 9.7f },
        "stations-shadow",
    )
    style.addLayerAbove(
        CircleLayer("stations-selected", ST_SRC).withProperties(
            circleRadius(zoomStops { (5f * zoomCurve(it) + 5f) * STATION_SCALE }),
            circleColor("rgba(0,180,216,0.18)"),
            circleStrokeColor("#00B4D8"),
            circleStrokeWidth(2.5f * STATION_SCALE),
        ).also { it.setFilter(Expression.eq(get("id"), literal(""))) },
        "stations-circle",
    )
    style.addLayerAbove(
        SymbolLayer("stations-label", ST_SRC).withProperties(
            textField(get("name")),
            textFont(arrayOf("Noto Sans Medium")),
            textSize(11.5f),
            textOffset(arrayOf(0f, 1.1f)),
            textAnchor("top"),
            textOptional(true),
            textColor(text),
            textHaloColor(halo),
            textHaloWidth(1.6f),
            textOpacity(dimOpacity),
        ).also { it.minZoom = 13.4f },
        "stations-selected",
    )
    style.addLayer(
        CircleLayer("user-halo", USER_SRC).withProperties(
            circleRadius(16f), circleColor("rgba(66,133,244,0.22)"),
        ),
    )
    style.addLayer(
        CircleLayer("user-dot", USER_SRC).withProperties(
            circleRadius(7f), circleColor("#4285F4"), circleStrokeColor("#FFFFFF"), circleStrokeWidth(2.5f),
        ),
    )
    // Web vehicle marker: 28 px disc scaled by clamp((zoom - 7.5) / 4, 0, 1.1), hidden below scale 0.3.
    TrainIcons.addAll(style, lineColors, densityDpi)
    val trainRadius = zoomStops { 14f * TRAIN_SCALE * trainCurve(it) }
    style.addLayer(
        CircleLayer(TRAIN_PULSE, TR_SRC).withProperties(
            circleRadius(trainRadius), circleColor("#FFFFFF"), circleOpacity(0f), circleBlur(0.6f),
        ).also {
            it.circleRadiusTransition = org.maplibre.android.style.layers.TransitionOptions(250, 0)
            it.circleOpacityTransition = org.maplibre.android.style.layers.TransitionOptions(250, 0)
            it.setFilter(Expression.eq(get("pulse"), literal(true))) },
    )
    style.addLayer(
        SymbolLayer("trains-icon", TR_SRC).withProperties(
            iconImage("{icon}"),
            iconSize(zoomStops { TRAIN_SCALE * trainCurve(it) }),
            iconAllowOverlap(true),
            iconIgnorePlacement(true),
            iconOpacity(get("opacity")),
        ),
    )
}

private fun hex(argb: Long) = String.format("#%06X", argb and 0xFFFFFF)

private fun stationsJson(stations: List<Station>, colors: Map<String, Long>, filter: Set<String>): String {
    val features = buildJsonArray {
        for (st in stations) {
            if (filter.isNotEmpty() && st.lines.none { it in filter }) continue // web hides stations outside the Line filter
            val first = st.lines.firstOrNull()?.let { colors[it] }
            add(
                buildJsonObject {
                    put("type", "Feature")
                    put(
                        "properties",
                        buildJsonObject {
                            put("id", st.id)
                            put("name", st.name)
                            put("color", hex(first ?: 0xFFAAAAAA))
                            put("dim", filter.isNotEmpty() && st.lines.none { it in filter })
                        },
                    )
                    put("geometry", point(st.lon, st.lat))
                },
            )
        }
    }
    return collection(features)
}

private fun trainsJson(
    trains: List<TrainPosition>,
    colors: Map<String, Long>,
    filter: Set<String>,
    selected: Station?,
): String {
    // Built by hand: this runs about 30 times a second, and a JsonObject tree per train was the dominant cost.
    val sb = StringBuilder(64 + trains.size * 150)
    sb.append("{\"type\":\"FeatureCollection\",\"features\":[")
    var first = true
    for (t in trains) {
        if (t.simulated) continue // headway guesses are never drawn: only trains placed from real arrivals
        // Web: a Line filter removes the other Lines' trains; a selected Station dims those it does not serve.
        if (filter.isNotEmpty() && t.line !in filter) continue
        val serves = selected == null || t.line in selected.lines
        val opacity = t.confidence.coerceIn(0.35, 1.0) * (if (serves) 1.0 else DIM_OPACITY.toDouble())
        val icon = TrainIcons.name(if (colors.containsKey(t.line)) t.line else "?")
        if (!first) sb.append(',')
        first = false
        sb.append("{\"type\":\"Feature\",\"properties\":{\"icon\":\"").append(icon)
            .append("\",\"opacity\":").append(String.format(java.util.Locale.ROOT, "%.2f", opacity))
            .append(",\"pulse\":").append(selected != null && serves)
            .append("},\"geometry\":{\"type\":\"Point\",\"coordinates\":[").append(t.lon).append(',').append(t.lat).append("]}}")
    }
    return sb.append("]}").toString()
}

private fun point(lon: Double, lat: Double) = buildJsonObject {
    put("type", "Point")
    put("coordinates", buildJsonArray { add(JsonPrimitive(lon)); add(JsonPrimitive(lat)) })
}

private fun collection(features: JsonArray): String =
    JsonObject(mapOf("type" to JsonPrimitive("FeatureCollection"), "features" to features)).toString()
