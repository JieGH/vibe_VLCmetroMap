package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.data.NetworkData
import com.jielei.xarxa.nativeapp.net.FgvPrevisionSource
import com.jielei.xarxa.nativeapp.net.PrevisionResponse
import com.jielei.xarxa.nativeapp.net.PrevisionSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.CoroutineContext

/**
 * Arrival Memory: port of src/services/arrivalStore.js (native branch only: FGV directly, 4 in flight,
 * no relay mode, no session storage). Every timestamp comes from [clock].
 *
 * Thread-safe; fetches run on [fetchContext] so a cancelled caller never aborts a shared in-flight request.
 */
class ArrivalStore(
    networkData: NetworkData,
    private val source: PrevisionSource = FgvPrevisionSource(),
    private val clock: Clock = Clock.System,
    fetchContext: CoroutineContext = Dispatchers.IO,
) {
    private class Entry(
        val stationId: Int,
        val stationName: String,
        val fetchedAt: Long,
        val arrivals: List<Arrival>,
        val fetchError: String? = null,
    )

    private val ids = StationIds(networkData.paradas)
    private val lineInfos = buildLineInfos(networkData).associateBy { it.id }
    private val strategicHubs = networkData.liveStations.strategicHubs
    private val majorStations = networkData.liveStations.majorStations

    private val lock = Any()
    private val memory = LinkedHashMap<String, Entry>()
    private val inFlight = HashMap<String, Deferred<StationArrivals>>()
    private val slots = Semaphore(MAX_CONCURRENT_REQUESTS)
    private var rateLimitedUntil = 0L
    private val syncing = AtomicBoolean(false)
    private val fetchScope = CoroutineScope(SupervisorJob() + fetchContext)
    private var syncJob: Job? = null

    private val _arrivals = MutableStateFlow<Map<String, List<Arrival>>>(emptyMap())

    /** Raw stored predictions per station key (apiId as text), insertion ordered. Project with [cached]. */
    val arrivals: StateFlow<Map<String, List<Arrival>>> = _arrivals

    var lastNetworkSyncAt: Long = 0L
        private set

    // ---- keys ----

    fun stationApiId(station: Station): Int? = station.apiId ?: ids.apiIdForName(station.name)

    fun apiIdForName(name: String): Int? = ids.apiIdForName(name)

    /** Milliseconds since this Station (by FGV id) was last heard from; null when never. */
    fun ageMs(apiId: Int): Long? = synchronized(lock) { memory[apiId.toString()] }?.let { clock.nowMs() - it.fetchedAt }

    /** getStationKey: apiId, else the name-mapped id, else the name. */
    fun stationKey(station: Station): String? = stationApiId(station)?.toString() ?: station.name.ifEmpty { null }

    // ---- projection ----

    private fun project(entry: Entry, now: Long): List<ProjectedArrival> {
        val out = ArrayList<ProjectedArrival>()
        for (arr in entry.arrivals) {
            val elapsed = now - arr.targetEpochMs
            if (elapsed > DWELL_GRACE_PERIOD_MS) continue
            val remaining = maxOf(0L, Math.round((arr.targetEpochMs - now) / 1000.0))
            val minutes = maxOf(0L, Math.round(remaining / 60.0))
            val status = when {
                remaining <= 0 -> ArrivalStatus.AtPlatform
                remaining <= 120 -> ArrivalStatus.Approaching
                else -> ArrivalStatus.OnTime
            }
            out.add(ProjectedArrival(arr, remaining.toInt(), minutes.toInt(), status))
        }
        return out.sortedBy { it.seconds }
    }

    /** Synchronous Arrival Memory read; null when nothing is left to count down and no error. */
    fun cached(station: Station, nowMs: Long = clock.nowMs()): CachedArrivals? {
        val key = stationKey(station) ?: return null
        val entry = synchronized(lock) { memory[key] } ?: return null
        val projected = project(entry, nowMs)
        if (projected.isEmpty() && entry.fetchError == null) return null
        return CachedArrivals(projected, nowMs - entry.fetchedAt < CACHE_TTL_MS, entry.fetchedAt, entry.fetchError)
    }

    private fun fromMemory(entry: Entry, now: Long, error: String?) =
        StationArrivals(project(entry, now), true, entry.fetchedAt, error)

    // ---- fetching ----

    /**
     * 60 s memory pause, 30 s forced-refresh cooldown, in-flight dedupe, bounded concurrency,
     * 4 s attempt timeout with one retry. Never throws except on cancellation.
     */
    suspend fun refreshStation(station: Station, force: Boolean = false): StationArrivals {
        val key = stationKey(station)
        val stationId = stationApiId(station)
        val now = clock.nowMs()

        val entry = synchronized(lock) { if (key != null) memory[key] else null }
        val sinceFetch = if (entry != null) now - entry.fetchedAt else Long.MAX_VALUE

        if (entry != null && !force && sinceFetch < CACHE_TTL_MS) return fromMemory(entry, now, entry.fetchError)

        if (entry != null && force && sinceFetch < MIN_REFRESH_COOLDOWN_MS) {
            return fromMemory(entry, now, "Refreshed recently. Showing countdown from memory.")
        }

        if (stationId == null || key == null) {
            return StationArrivals(emptyList(), false, now, "N/A — this station has no live prediction endpoint.")
        }

        val deferred = synchronized(lock) {
            inFlight[key] ?: run {
                if (rateLimitedUntil > now && !force && entry != null) {
                    return@synchronized null
                }
                val d = fetchScope.async(start = CoroutineStart.LAZY) { doFetch(key, stationId, station.name) }
                inFlight[key] = d
                d
            }
        }
        if (deferred == null) {
            return fromMemory(entry!!, now, "Live rate limit active. Counting down from previous sync.")
        }
        deferred.start()
        return deferred.await()
    }

    private suspend fun doFetch(key: String, stationId: Int, stationName: String): StationArrivals {
        try {
            slots.withPermit {
                val response = try {
                    attemptWithRetry(stationId)
                } catch (e: TimeoutCancellationException) {
                    return fallback(key, stationId, stationName, "Live predictions request timed out.")
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    return fallback(key, stationId, stationName, "Live predictions network error.")
                }
                return try {
                    handle(response, key, stationId, stationName)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    val reason = if (response.status == 404 || response.status == 400) {
                        "Service ended for today or station currently offline."
                    } else {
                        "Live predictions are currently unavailable."
                    }
                    fallback(key, stationId, stationName, reason)
                }
            }
        } finally {
            synchronized(lock) { inFlight.remove(key) }
        }
    }

    /** Up to [FGV_ATTEMPTS] attempts of [FGV_ATTEMPT_TIMEOUT_MS]; an HTTP status is an answer. */
    private suspend fun attemptWithRetry(stationId: Int): PrevisionResponse {
        var attempt = 1
        while (true) {
            try {
                return withTimeout(FGV_ATTEMPT_TIMEOUT_MS) { source.fetch(stationId) }
            } catch (e: TimeoutCancellationException) {
                if (attempt >= FGV_ATTEMPTS) throw e
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (attempt >= FGV_ATTEMPTS) throw e
            }
            attempt++
        }
    }

    private fun fallback(
        key: String,
        stationId: Int? = null,
        stationName: String? = null,
        reason: String = "Live predictions are currently unavailable.",
    ): StationArrivals {
        val existing = synchronized(lock) { memory[key] }
        val now = clock.nowMs()
        if (existing != null) {
            val projected = project(existing, now)
            if (projected.isNotEmpty()) {
                val errEntry = Entry(existing.stationId, existing.stationName, existing.fetchedAt, existing.arrivals, "Live update failed. Showing countdown from earlier sync.")
                synchronized(lock) {
                    memory[key] = errEntry
                    publishLocked()
                }
                return StationArrivals(projected, true, existing.fetchedAt, errEntry.fetchError)
            }
        }
        val errEntry = Entry(stationId ?: existing?.stationId ?: 0, stationName ?: existing?.stationName ?: "", now, emptyList(), reason)
        synchronized(lock) {
            memory[key] = errEntry
            publishLocked()
        }
        return StationArrivals(emptyList(), false, now, reason)
    }

    private fun handle(response: PrevisionResponse, key: String, stationId: Int, stationName: String): StationArrivals {
        if (!response.ok) {
            if (response.status == 429) synchronized(lock) { rateLimitedUntil = clock.nowMs() + 20_000 }
            throw IllegalStateException("HTTP ${response.status}")
        }
        val root = try {
            NetworkData.json.parseToJsonElement(response.body ?: "")
        } catch (e: Exception) {
            null
        }
        val previsiones = (root as? JsonObject)?.get("previsiones") as? JsonArray
            ?: throw IllegalStateException("Malformed API payload")

        val fetchTime = clock.nowMs()
        val parsed = ArrayList<Arrival>()
        for (train in flattenTrains(previsiones)) {
            val destination = train.destination
            val seconds = train.seconds
            if (destination.isNullOrEmpty() || seconds == null || !seconds.isFinite()) continue
            val lineId = train.line
            val info = lineInfos[lineId]
            val rawTimestamp = fetchTime + (seconds * 1000)
            val target = rawTimestamp - propagationLagMs(lineId)
            parsed.add(
                Arrival(
                    line = lineId,
                    destination = destination,
                    vehicleId = train.vehicle,
                    targetEpochMs = target.toLong(),
                    initialSeconds = seconds,
                    stationKey = key,
                    stationName = stationName,
                    fetchedAtMs = fetchTime,
                    isLive = true,
                    lineName = info?.name ?: "Line $lineId",
                    lineColorArgb = info?.colorArgb
                        ?: when (lineId) { "1" -> 0xFFFFD100; "3" -> 0xFFE2001A; "5" -> 0xFF00994D; else -> 0xFF8F6DB8 },
                ),
            )
        }

        val updated = Entry(stationId, stationName, fetchTime, parsed)
        synchronized(lock) {
            memory[key] = updated
            publishLocked()
        }
        return StationArrivals(project(updated, clock.nowMs()), false, fetchTime, null)
    }

    private fun publishLocked() {
        if (memory.isNotEmpty()) {
            com.jielei.xarxa.nativeapp.Perf.once("first_arrival")
            if (strategicHubs.all { memory.containsKey(it.id.toString()) }) com.jielei.xarxa.nativeapp.Perf.once("hubs_done")
        }
        _arrivals.value = LinkedHashMap<String, List<Arrival>>().also { m ->
            for ((k, v) in memory) m[k] = v.arrivals
        }
    }

    private class Train(val line: String, val destination: String?, val seconds: Double?, val vehicle: String?)

    /** FGV groups trains under each Line; flat rows (the old relay's shape) are accepted too. */
    private fun flattenTrains(previsiones: JsonArray): List<Train> {
        val out = ArrayList<Train>()
        fun train(obj: JsonObject, line: JsonElement?): Train {
            val lineId = scalarText(line) ?: ""
            val dest = (obj["destino"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.ifEmpty { null }
                ?: (obj["destination"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.ifEmpty { null }
            val secEl = obj["seconds"] as? JsonPrimitive
            val seconds = if (secEl != null && !secEl.isString) secEl.doubleOrNull else null
            return Train(lineId, dest, seconds, scalarText(obj["vehicle"]))
        }
        for (group in previsiones) {
            val g = group as? JsonObject ?: continue
            val trains = g["trains"] as? JsonArray
            val line = nonNull(g["line"]) ?: nonNull(g["line_id"])
            if (trains != null) {
                for (t in trains) (t as? JsonObject)?.let { out.add(train(it, line)) }
            } else {
                out.add(train(g, line))
            }
        }
        return out
    }

    private fun nonNull(e: JsonElement?): JsonElement? = if (e == null || e is JsonNull) null else e

    /** JS String(value): integral numbers lose their ".0". */
    private fun scalarText(e: JsonElement?): String? {
        val p = nonNull(e) as? JsonPrimitive ?: return null
        if (p.isString) return p.content
        val d = p.doubleOrNull
        return if (d != null && d == Math.rint(d) && Math.abs(d) < 1e15) d.toLong().toString() else p.content
    }

    // ---- Network Sync ----

    /**
     * One sweep: Strategic Hubs first, then the other Major Stations, [MAX_CONCURRENT_REQUESTS] workers,
     * stations inside their memory pause skipped. A second call while one runs returns (0, 0).
     */
    suspend fun syncNetwork(): SyncResult {
        if (!syncing.compareAndSet(false, true)) return SyncResult(0, 0)
        val fetched = AtomicInteger()
        val skipped = AtomicInteger()
        val hubIds = strategicHubs.map { it.id }.toSet()
        val ordered = strategicHubs + majorStations.filter { it.id !in hubIds }
        val next = AtomicInteger()
        try {
            kotlinx.coroutines.coroutineScope {
                List(MAX_CONCURRENT_REQUESTS) {
                    async {
                        while (true) {
                            val i = next.getAndIncrement()
                            if (i >= ordered.size) break
                            val st = ordered[i]
                            val entry = synchronized(lock) { memory[st.id.toString()] }
                            if (entry != null && clock.nowMs() - entry.fetchedAt < CACHE_TTL_MS) {
                                skipped.incrementAndGet()
                                continue
                            }
                            try {
                                refreshStation(Station("api-${st.id}", st.name, 0.0, 0.0, emptyList(), st.id))
                                fetched.incrementAndGet()
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                // One station failing must not abandon the rest of the sweep.
                            }
                        }
                    }
                }.awaitAll()
            }
        } finally {
            syncing.set(false)
            lastNetworkSyncAt = clock.nowMs()
            com.jielei.xarxa.nativeapp.Perf.once("sync_done")
            synchronized(lock) { publishLocked() }
        }
        return SyncResult(fetched.get(), skipped.get())
    }

    /** Syncs now, then every [NETWORK_SYNC_INTERVAL_MS] while [scope] lives. Idempotent. */
    fun startNetworkSync(scope: CoroutineScope) {
        synchronized(lock) {
            if (syncJob?.isActive == true) return
            syncJob = scope.launch {
                while (isActive) {
                    launch { syncNetwork() }
                    delay(NETWORK_SYNC_INTERVAL_MS)
                }
            }
        }
    }

    fun stopNetworkSync() {
        synchronized(lock) {
            syncJob?.cancel()
            syncJob = null
        }
    }

    companion object {
        const val CACHE_TTL_MS = 60_000L
        const val MIN_REFRESH_COOLDOWN_MS = 30_000L
        const val MAX_CONCURRENT_REQUESTS = 4
        const val DWELL_GRACE_PERIOD_MS = 20_000L
        const val FGV_ATTEMPT_TIMEOUT_MS = 4000L
        const val FGV_ATTEMPTS = 2
        const val METRO_PROPAGATION_LAG_MS = 15_000L
        const val TRAM_PROPAGATION_LAG_MS = 10_000L
        val TRAM_LINE_IDS = setOf("4", "6", "8", "10")

        /** Propagation Lag plus Arrival Countdown Lead, in ms. */
        fun propagationLagMs(lineId: String): Long =
            (if (lineId in TRAM_LINE_IDS) TRAM_PROPAGATION_LAG_MS else METRO_PROPAGATION_LAG_MS) +
                ARRIVAL_COUNTDOWN_LEAD_SECONDS * 1000L
    }
}
