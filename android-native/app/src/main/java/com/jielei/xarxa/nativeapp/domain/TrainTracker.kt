package com.jielei.xarxa.nativeapp.domain

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Keeps every moving train covered by a fresh arrival feed. A train that has just left a Station is caught by the
 * next Station's feed under the same vehicle id, so the engine can chain its sightings from stop to stop; but only
 * the Major Stations are swept (every 2 minutes), so on a long gap the next feed may be stale or never fetched.
 * This looks at the trains about to reach, or already past, their target Station and refreshes the Station after
 * it, a couple per tick, inside the Rate Budget (the store's own 4-in-flight limit, 60 s memory pause and 30 s
 * forced-refresh cooldown still apply).
 */
class TrainTracker(
    private val engine: TrainPositionEngine,
    private val store: ArrivalStore,
    private val clock: Clock = Clock.System,
) {
    /**
     * Station names worth refreshing now, most urgent first: for a train due at its target within [LEAD_SECONDS],
     * the Station after that target; for a dead-reckoned train (nothing heard recently), the target itself.
     */
    fun candidates(trains: List<TrainPosition>, after: (line: String, station: String, forward: Boolean) -> String?): List<String> =
        trains.asSequence()
            .filter { !it.simulated && it.isLive }
            .sortedBy { it.secondsToTarget }
            .mapNotNull { t ->
                when {
                    t.isDeadReckoned -> t.targetStation
                    t.secondsToTarget <= LEAD_SECONDS -> after(t.line, t.targetStation, t.isForward)
                    else -> null
                }
            }
            .distinct()
            .toList()

    suspend fun tick() {
        val trains = engine.livePositions(store.arrivals.value, clock.nowMs())
        val wanted = candidates(trains, engine::stationAfter).mapNotNull { name ->
            val id = store.apiIdForName(name) ?: return@mapNotNull null
            val age = store.ageMs(id)
            if (age == null || age > MIN_AGE_MS) Station("api-$id", name, 0.0, 0.0, emptyList(), id) else null
        }.take(MAX_PER_TICK)
        if (wanted.isEmpty()) return
        coroutineScope {
            for (st in wanted) launch { runCatching { store.refreshStation(st, force = true) } }
        }
    }

    fun start(scope: CoroutineScope): Job = scope.launch {
        delay(START_DELAY_MS) // let the first Network Sync fill the memory before looking for gaps
        while (isActive) {
            runCatching { tick() }
            delay(TICK_MS)
        }
    }

    companion object {
        const val LEAD_SECONDS = 25
        const val MIN_AGE_MS = 20_000L
        const val MAX_PER_TICK = 2
        const val TICK_MS = 5_000L
        const val START_DELAY_MS = 8_000L
    }
}
