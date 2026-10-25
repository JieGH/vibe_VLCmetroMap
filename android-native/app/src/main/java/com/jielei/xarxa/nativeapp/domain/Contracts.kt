package com.jielei.xarxa.nativeapp.domain

/*
 * Public API of the domain layer (Task B). The UI codes against this file only.
 *
 * Wiring (all pure Kotlin, no Android types; safe to construct in a ViewModel):
 *
 *   val data     = NetworkData.load(context)                       // suspend, IO
 *   val repo     = StationRepository(data)                         // stations, search, nearest
 *   val store    = ArrivalStore(data)                              // live Arrivals (FGV, direct HTTP)
 *   val engine   = TrainPositionEngine(data)                       // Timetable Walk
 *
 *   store.startNetworkSync(viewModelScope)                         // 120 s Network Sync, Hubs first
 *   store.stopNetworkSync()                                        // when the map is hidden
 *   store.arrivals: StateFlow<Map<String, List<Arrival>>>          // keyed by station key (apiId as text)
 *   store.refreshStation(station, force = false)                   // suspend; TTL 60 s, cooldown 30 s
 *   store.cached(station, nowMs): CachedArrivals?                  // sync, countdowns projected to nowMs
 *
 *   // every frame / second tick:
 *   engine.positions(store.arrivals.value, nowMs): List<TrainPosition>
 *   engine.focusStation(station, store.cached(station, nowMs), nowMs): StationFocus
 *
 *   repo.search("guimera"): List<SearchResult>                     // Lines first, then Stations
 *   repo.nearest(lat, lon): NearestStation?                        // straight line; apply NEAREST_STATION_RANGE_M
 *
 *   countdownColor(seconds, darkTheme): Long                       // 0xAARRGGBB
 *   countdownLabel(seconds, dueLabel) / countdownUnit(seconds)
 *   lineServesStation / dimmedVehicleOpacity / vehicleShouldPulse / DIM_FACTOR   (LineDim.kt)
 *   GeoUtils.*                                                     (GeoUtils.kt)
 *
 * Time is always epoch milliseconds. [Clock] is injectable for tests.
 */

fun interface Clock {
    fun nowMs(): Long

    companion object {
        val System: Clock = Clock { java.lang.System.currentTimeMillis() }
    }
}

/** One Station. [id] is the stable feature id ("st-20"); [apiId] is FGV's id (null: no live endpoint). */
data class Station(
    val id: String,
    val name: String,
    val lat: Double,
    val lon: Double,
    val lines: List<String>,
    val apiId: Int?,
    /** GTFS stop_id, a different id space from [apiId]. Null for the few metro_lines-only points. */
    val stopId: String? = null,
)

/** A Line as the search and legend know it. [colorArgb] is 0xFFRRGGBB with the image colour overrides applied. */
data class LineInfo(val id: String, val name: String, val colorArgb: Long)

sealed interface SearchResult {
    data class LineHit(val line: LineInfo) : SearchResult
    data class StationHit(val station: Station) : SearchResult
}

data class NearestStation(val station: Station, val distanceMeters: Double)

enum class ArrivalStatus { OnTime, Approaching, AtPlatform }

/**
 * One stored prediction. [targetEpochMs] is the Target Arrival Timestamp: response time + seconds,
 * minus Propagation Lag and the Arrival Countdown Lead. Counting down needs no network.
 */
data class Arrival(
    val line: String,
    val destination: String,
    val vehicleId: String?,
    val targetEpochMs: Long,
    val initialSeconds: Double,
    /** Key of the Station in [ArrivalStore.arrivals] (its apiId as text). */
    val stationKey: String,
    val stationName: String,
    /** When this Station was last heard from (adjusted for the server cache age). */
    val fetchedAtMs: Long,
    val isLive: Boolean = true,
    val lineName: String = "",
    val lineColorArgb: Long = 0,
)

/** An [Arrival] projected to a moment: whole seconds left (0 once due), minutes, status. */
data class ProjectedArrival(
    val arrival: Arrival,
    val seconds: Int,
    val minutes: Int,
    val status: ArrivalStatus,
) {
    val line get() = arrival.line
    val destination get() = arrival.destination
}

data class CachedArrivals(
    val arrivals: List<ProjectedArrival>,
    val isFresh: Boolean,
    val fetchedAtMs: Long,
    val fetchError: String?,
)

/** Result of a fetch. [arrivals] soonest first. */
data class StationArrivals(
    val arrivals: List<ProjectedArrival>,
    val isFromCache: Boolean,
    val fetchedAtMs: Long,
    val fetchError: String?,
)

data class SyncResult(val fetched: Int, val skipped: Int)

/** A Vehicle on the map. */
data class TrainPosition(
    val id: String,
    val line: String,
    val vehicleId: String?,
    val lat: Double,
    val lon: Double,
    /** Degrees clockwise from north, 0 until 360. */
    val bearing: Double,
    /** Position Confidence: 1 down to 0.45 walked, 0.35 dead reckoned. Simulated trains: 1.0 (draw hollow/dashed). */
    val confidence: Double,
    /** Simulated Train from a headway guess: never a reported train. */
    val simulated: Boolean,
    val isLive: Boolean,
    val isForward: Boolean,
    val isDeadReckoned: Boolean,
    val distanceAlongTrack: Double,
    val destination: String,
    val status: String?,
    val targetStation: String,
    val secondsToTarget: Int,
    val uncertaintyMeters: Int,
    val secondsUnheard: Int,
    val sightingCount: Int,
)

data class DirectionGroup(
    /** "forward" or "backward". */
    val key: String,
    val destinations: List<String>,
    val destination: String,
    val label: String,
    /** Mean compass bearing the track leaves the Station on, or null. */
    val bearing: Double?,
    val arrivals: List<ProjectedArrival>,
)

data class StationFocus(
    val name: String,
    val lines: List<String>,
    val arrivals: List<ProjectedArrival>,
    val laterArrivals: List<ProjectedArrival>,
    val directions: List<DirectionGroup>,
    val isFresh: Boolean,
    val fetchedAtMs: Long?,
    val secondsUnheard: Int?,
    val fetchError: String?,
)

/** Beyond this straight-line distance there is no Nearest Station worth naming. */
const val NEAREST_STATION_RANGE_M = 2000.0

/** A fix rougher than this cannot choose between neighbouring Stations. */
const val MAX_USABLE_ACCURACY_M = 500.0

const val NETWORK_SYNC_INTERVAL_MS = 120_000L
const val ARRIVAL_COUNTDOWN_LEAD_SECONDS = 10
