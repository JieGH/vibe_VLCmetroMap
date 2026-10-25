package com.jielei.xarxa.nativeapp.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/** A [lon, lat] pair, GeoJSON order. */
data class LonLat(val lon: Double, val lat: Double)

/**
 * GeoJSON geometry. `coordinates` is a Point ([lon, lat]) or a LineString ([[lon, lat], ...])
 * depending on [type]; use [point] / [line] to read it.
 */
@Serializable
data class Geometry(val type: String, val coordinates: JsonElement) {
    fun point(): LonLat? =
        if (type == "Point") coordinates.jsonArray.toLonLat() else null

    fun line(): List<LonLat> =
        if (type == "LineString") coordinates.jsonArray.map { it.jsonArray.toLonLat() } else emptyList()
}

private fun JsonArray.toLonLat() = LonLat(
    this[0].jsonPrimitive.doubleOrNull ?: error("bad lon"),
    this[1].jsonPrimitive.doubleOrNull ?: error("bad lat"),
)

/** Properties of a Station feature in gtfs_expanded.json. `stopId` is the GTFS stop_id (string). */
@Serializable
data class StationProperties(
    val type: String? = null,
    val id: String? = null,
    val name: String,
    @SerialName("stop_id") val stopId: String? = null,
    val lines: List<String> = emptyList(),
    val zone: String? = null,
)

@Serializable
data class StationFeature(val geometry: Geometry, val properties: StationProperties)

/** Properties of a Line feature (metro_lines.json / gtfs_expanded.json LineStrings). */
@Serializable
data class LineProperties(
    val line: String? = null,
    val name: String? = null,
    val color: String? = null,
)

@Serializable
data class LineFeature(val geometry: Geometry, val properties: LineProperties = LineProperties())

/** A Station feature, a Line feature, or (in metro_lines.json) a bare Point with a name and lines. */
@Serializable
data class RawFeature(
    val geometry: Geometry,
    val properties: kotlinx.serialization.json.JsonObject = kotlinx.serialization.json.JsonObject(emptyMap()),
)

@Serializable
data class FeatureCollection(val features: List<RawFeature>)

/** direction_stations.json: per Line, the stop_ids of each direction's Station Chain. */
@Serializable
data class DirectionStations(val lines: Map<String, DirectionChains>)

@Serializable
data class DirectionChains(val forward: List<String>, val reverse: List<String>)

/** return_tracks.json: per Line, the coordinates of the one-way return leg. */
@Serializable
data class ReturnTracks(val lines: Map<String, ReturnTrack>)

@Serializable
data class ReturnTrack(val coordinates: List<List<Double>>) {
    fun path() = coordinates.map { LonLat(it[0], it[1]) }
}

/** segment_times.json: median GTFS seconds keyed "fromStopId>toStopId". */
@Serializable
data class SegmentTimes(
    val dwellSeconds: Double = 0.0,
    val networkFallback: NetworkFallback? = null,
    val lines: Map<String, LineSegments> = emptyMap(),
)

@Serializable
data class NetworkFallback(val metresPerSecond: Double, val minSeconds: Double? = null, val samples: Int = 0)

@Serializable
data class LineSegments(
    val segments: Map<String, Double> = emptyMap(),
    /** Per-Line commercial speed, used where no Segment Interval covers a pair of Stations. */
    val fallback: NetworkFallback? = null,
)

/** segment_times_fgv.json: like [SegmentTimes] but each segment carries its sample count. */
@Serializable
data class SegmentTimesFgv(
    val dwellSeconds: Double = 0.0,
    val lines: Map<String, LineSegmentsFgv> = emptyMap(),
)

@Serializable
data class LineSegmentsFgv(val segments: Map<String, FgvSegment> = emptyMap())

@Serializable
data class FgvSegment(val seconds: Double, val samples: Int = 0)

/** paradas_api.json entry: FGV's own station id space (distinct from GTFS stop_id!). */
@Serializable
data class Parada(
    val id: Int,
    val latitud: Double,
    val longitud: Double,
    val nombre: String,
    val zona: String? = null,
)

/** live_stations.json */
@Serializable
data class LiveStations(
    val strategicHubs: List<LiveStation> = emptyList(),
    val majorStations: List<LiveStation> = emptyList(),
)

@Serializable
data class LiveStation(val id: Int, val name: String)

/** line_colors_from_image.json: line id -> "#RRGGBB" override. */
typealias LineColors = Map<String, String>
