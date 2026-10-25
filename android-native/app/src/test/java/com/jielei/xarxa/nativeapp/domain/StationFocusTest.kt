package com.jielei.xarxa.nativeapp.domain

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private val AG = ANGEL_GUIMERA
private val RAFELBUNYOL = Station("st-raf", "Rafelbunyol", 0.0, 0.0, listOf("3"), 1)

/** Port of stationFocus.test.js: arrivals are placed in Arrival Memory through the fake feed. */
@OptIn(ExperimentalCoroutinesApi::class)
class StationFocusTest {
    private val engine by lazy { TrainPositionEngine(TestData.network) }

    /** Fetches [arrivals] (line, destination, inSeconds) so they are due `inSeconds` from the current virtual now. */
    private suspend fun TestScope.remember(store: ArrivalStore, station: Station, arrivals: List<Triple<String, String, Int>>) {
        val byLine = arrivals.withIndex().groupBy({ it.value.first }, { it })
        val groups = byLine.map { (line, list) ->
            val lag = (if (line in ArrivalStore.TRAM_LINE_IDS) 10 else 15) + ARRIVAL_COUNTDOWN_LEAD_SECONDS
            line.toInt() to list.map { Triple(it.value.second, it.value.third + lag, 9000 + it.index) }
        }
        val source = FakeSource { ok(fgvPayload(*groups.toTypedArray())) }
        // A fresh store per call keeps the memory pause out of the way; we copy into `store` by sharing it.
        val s2 = ArrivalStore(TestData.network, source, clock(), kotlinx.coroutines.test.StandardTestDispatcher(testScheduler))
        s2.refreshStation(station, force = true)
        injected[store] = s2
    }

    private val injected = HashMap<ArrivalStore, ArrivalStore>()

    private suspend fun TestScope.focusOf(station: Station, arrivals: List<Triple<String, String, Int>>): StationFocus {
        val holder = store(FakeSource { ok(fgvPayload()) })
        remember(holder, station, arrivals)
        val s = injected[holder]!!
        val now = NOW + testScheduler.currentTime
        return engine.focusStation(station, s.cached(station, now), now)
    }

    private fun t(line: String, dest: String, secs: Int) = Triple(line, dest, secs)

    @Test fun splitsArrivalsIntoTheTwoDirections() = runTest {
        val f = focusOf(AG, listOf(t("3", "Rafelbunyol", 120), t("3", "Aeroport", 300)))
        assertEquals(2, f.directions.size)
        assertEquals(setOf("Rafelbunyol", "Aeroport"), f.directions.map { it.label }.toSet())
    }

    @Test fun terminusHasOneDirection() = runTest {
        val f = focusOf(RAFELBUNYOL, listOf(t("3", "Aeroport", 90), t("3", "Aeroport", 480)))
        assertEquals(1, f.directions.size)
        assertEquals("Aeroport", f.directions[0].label)
        assertEquals(2, f.directions[0].arrivals.size)
    }

    @Test fun labelIsTheSoonestArrivalsDestination() = runTest {
        val f = focusOf(AG, listOf(t("3", "Rafelbunyol", 200), t("1", "Bétera", 260), t("3", "Aeroport", 90)))
        val towardsAeroport = f.directions.first { "Aeroport" in it.destinations }
        val other = f.directions.first { it !== towardsAeroport }
        assertTrue("Rafelbunyol" in other.destinations && "Bétera" in other.destinations)
        assertEquals("Rafelbunyol", other.destination); assertEquals("Rafelbunyol", other.label)
    }

    @Test fun soonestDirectionComesFirst() = runTest {
        val f1 = focusOf(AG, listOf(t("3", "Rafelbunyol", 300), t("3", "Aeroport", 60)))
        assertEquals(listOf("Aeroport", "Rafelbunyol"), f1.directions.map { it.destination })
        assertEquals(60, f1.directions[0].arrivals[0].seconds)
        val f2 = focusOf(AG, listOf(t("3", "Rafelbunyol", 45), t("3", "Aeroport", 240)))
        assertEquals(listOf("Rafelbunyol", "Aeroport"), f2.directions.map { it.destination })
        assertEquals(240, f2.directions[1].arrivals[0].seconds)
    }

    @Test fun armsPointAlongTheTrackAndRoughlyOpposite() = runTest {
        val (a, b) = focusOf(AG, listOf(t("3", "Rafelbunyol", 120), t("3", "Aeroport", 300))).directions
        assertTrue(a.bearing!! >= 0 && a.bearing!! < 360)
        val apart = Math.abs((((a.bearing!! - b.bearing!!) % 360) + 360) % 360 - 180)
        assertTrue("${a.bearing} vs ${b.bearing}", apart < 30)
    }

    @Test fun bearingIsFinite() = runTest {
        val only = focusOf(RAFELBUNYOL, listOf(t("3", "Aeroport", 90))).directions.single()
        assertTrue(only.bearing!!.isFinite())
    }

    @Test fun eachDirectionOrderedBySoonness() = runTest {
        val f = focusOf(AG, listOf(t("3", "Rafelbunyol", 600), t("1", "Bétera", 120), t("9", "Alboraia", 340)))
        for (d in f.directions) assertEquals(d.arrivals.map { it.seconds }.sorted(), d.arrivals.map { it.seconds })
    }

    @Test fun flatTableIgnoresDirections() = runTest {
        val f = focusOf(AG, listOf(t("3", "Rafelbunyol", 600), t("3", "Aeroport", 120)))
        assertEquals(listOf(120, 600), f.arrivals.map { it.seconds })
    }

    @Test fun freshVersusMemory() = runTest {
        val holder = store(FakeSource { ok(fgvPayload(3 to listOf(Triple("Aeroport", 500, 1)))) })
        holder.refreshStation(AG)
        val fresh = engine.focusStation(AG, holder.cached(AG, NOW), NOW)
        assertTrue(fresh.isFresh)
        advanceTimeBy(180_000)
        val now = NOW + 180_000
        val stale = engine.focusStation(AG, holder.cached(AG, now), now)
        assertFalse(stale.isFresh); assertEquals(180, stale.secondsUnheard)
    }

    @Test fun nothingInMemory() = runTest {
        val f = engine.focusStation(AG, null, NOW)
        assertTrue(f.arrivals.isEmpty() && f.directions.isEmpty()); assertFalse(f.isFresh)
    }

    @Test fun stationWithNoLiveEndpoint() = runTest {
        val f = engine.focusStation(Station("x", "Ayora", 0.0, 0.0, listOf("5", "7"), null), null, NOW)
        assertEquals("Ayora", f.name); assertTrue(f.arrivals.isEmpty()); assertNull(f.fetchedAtMs)
    }

    @Test fun laterArrivalsLeaveOutTheHeadlines() = runTest {
        val f = focusOf(AG, listOf(t("3", "Rafelbunyol", 120), t("3", "Rafelbunyol", 600), t("5", "Marítim", 240)))
        assertEquals(3, f.arrivals.size)
        val headlined = f.directions.map { it.arrivals[0] }
        assertEquals(3 - f.directions.size, f.laterArrivals.size)
        for (h in headlined) assertTrue(f.laterArrivals.none { it === h })
    }

    @Test fun nothingMoreWhenHeadlinesSaidItAll() = runTest {
        val f = focusOf(RAFELBUNYOL, listOf(t("3", "Aeroport", 300)))
        assertEquals(1, f.arrivals.size); assertTrue(f.laterArrivals.isEmpty())
    }

    @Test fun offTrackStationKeepsEveryArrivalInTheTable() = runTest {
        val fira = Station("x", "Fira València", 0.0, 0.0, listOf("4"), 68)
        val f = focusOf(fira, listOf(t("4", "Mas del Rosari", 180)))
        assertTrue(f.directions.isEmpty()); assertEquals(1, f.laterArrivals.size)
    }
}
