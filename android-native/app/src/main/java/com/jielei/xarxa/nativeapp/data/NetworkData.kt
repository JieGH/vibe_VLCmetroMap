package com.jielei.xarxa.nativeapp.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/** Everything bundled in assets/data, parsed once. Domain logic (agent B) builds on this. */
data class NetworkData(
    val gtfs: FeatureCollection,
    val metroLines: FeatureCollection,
    val returnTracks: ReturnTracks,
    val directionStations: DirectionStations,
    val segmentTimes: SegmentTimes,
    val segmentTimesFgv: SegmentTimesFgv,
    val paradas: List<Parada>,
    val liveStations: LiveStations,
    val lineColors: LineColors,
) {
    companion object {
        val json = Json { ignoreUnknownKeys = true; isLenient = true }

        /** Reads and decodes every data asset on the IO dispatcher. */
        suspend fun load(context: Context): NetworkData = withContext(Dispatchers.IO) {
            val assets = context.applicationContext.assets
            fun <T> read(name: String, strategy: DeserializationStrategy<T>): T =
                assets.open("data/$name").bufferedReader().use { json.decodeFromString(strategy, it.readText()) }
            parse(::read)
        }

        /** Decoding shared with JVM unit tests: supply a reader for "data/<name>" files. */
        fun parse(read: (String, DeserializationStrategy<*>) -> Any?): NetworkData {
            @Suppress("UNCHECKED_CAST")
            fun <T> r(name: String, s: DeserializationStrategy<T>) = read(name, s) as T
            return NetworkData(
                gtfs = r("gtfs_expanded.json", FeatureCollection.serializer()),
                metroLines = r("metro_lines.json", FeatureCollection.serializer()),
                returnTracks = r("return_tracks.json", ReturnTracks.serializer()),
                directionStations = r("direction_stations.json", DirectionStations.serializer()),
                segmentTimes = r("segment_times.json", SegmentTimes.serializer()),
                segmentTimesFgv = r("segment_times_fgv.json", SegmentTimesFgv.serializer()),
                paradas = r("paradas_api.json", kotlinx.serialization.builtins.ListSerializer(Parada.serializer())),
                liveStations = r("live_stations.json", LiveStations.serializer()),
                lineColors = r(
                    "line_colors_from_image.json",
                    kotlinx.serialization.builtins.MapSerializer(
                        String.serializer(),
                        String.serializer(),
                    ),
                ),
            )
        }
    }
}
