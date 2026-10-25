package com.jielei.xarxa.nativeapp.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Kotlin engine against vectors produced by the real JS engine (tools/dump-vectors.mjs):
 * Lines 1-10 live, Line 4/6 return track and beach, contradicting Sightings, dead reckoning,
 * stale predictions, marker smoothing and the all-simulated network.
 */
class EngineGoldenTest {
    private val coordTol = 1e-6
    private val softTol = 1e-3

    private fun arrivalsOf(memory: List<kotlinx.serialization.json.JsonElement>): Map<String, List<Arrival>> {
        val map = LinkedHashMap<String, List<Arrival>>()
        for (e in memory) {
            val o = e.obj
            val key = o["key"]!!.str!!
            val name = o["stationName"]!!.str!!
            val fetchedAt = o["fetchedAt"]!!.dbl.toLong()
            map[key] = o["arrivals"]!!.arr.map { a ->
                val ao = a.obj
                Arrival(
                    line = ao["line"]!!.str!!,
                    destination = ao["destination"]!!.str!!,
                    vehicleId = ao["vehicleId"]?.str,
                    targetEpochMs = ao["targetTimestamp"]!!.dbl.toLong(),
                    initialSeconds = 0.0,
                    stationKey = key,
                    stationName = name,
                    fetchedAtMs = fetchedAt,
                )
            }
        }
        return map
    }

    @Test
    fun matchesTheJsEngineOnEveryScenario() {
        val scenarios = TestData.vectors("engine.json").arr
        assertTrue(scenarios.size >= 15)
        var compared = 0
        var live = 0
        for (sc in scenarios) {
            val name = sc.obj["name"]!!.str!!
            val engine = TrainPositionEngine(TestData.network)
            for ((stepIdx, step) in sc.obj["steps"]!!.arr.withIndex()) {
                val now = step.obj["now"]!!.dbl.toLong()
                val expected = step.obj["vehicles"]!!.arr
                val actual = engine.positions(arrivalsOf(step.obj["memory"]!!.arr), now)
                val ctx = "$name step $stepIdx"
                assertEquals("$ctx vehicle count", expected.size, actual.size)
                for ((i, ev) in expected.withIndex()) {
                    val e = ev.obj
                    val a = actual[i]
                    val c = "$ctx #$i ${e["id"]!!.str}"
                    assertEquals("$c id", e["id"]!!.str, a.id)
                    assertEquals("$c line", e["line"]!!.str, a.line)
                    assertEquals("$c vehicleId", e["vehicleId"]?.str, a.vehicleId)
                    assertEquals("$c lon", e["lon"]!!.dbl, a.lon, coordTol)
                    assertEquals("$c lat", e["lat"]!!.dbl, a.lat, coordTol)
                    assertEquals("$c bearing", 0.0, bearingDiff(e["bearing"]!!.dbl, a.bearing), softTol)
                    assertEquals("$c isForward", e["isForward"]!!.bool, a.isForward)
                    assertEquals("$c simulated", e["isSimulated"]!!.bool, a.simulated)
                    assertEquals("$c live", e["isLive"]!!.bool, a.isLive)
                    assertEquals("$c destination", e["direction"]!!.str, a.destination)
                    assertEquals("$c targetStation", e["targetStation"]!!.str, a.targetStation)
                    assertEquals("$c secondsToTarget", e["secondsToTarget"]!!.dbl.toInt(), a.secondsToTarget)
                    assertEquals("$c distance", e["distanceAlongTrack"]!!.dbl, a.distanceAlongTrack, 1e-3)
                    if (a.isLive) {
                        live++
                        assertEquals("$c confidence", e["positionConfidence"]!!.dbl, a.confidence, softTol)
                        assertEquals("$c deadReckoned", e["isDeadReckoned"]!!.bool, a.isDeadReckoned)
                        assertEquals("$c status", e["status"]!!.str, a.status)
                        assertEquals("$c sightings", e["sightingCount"]!!.dbl.toInt(), a.sightingCount)
                        assertEquals("$c uncertainty", e["positionUncertaintyMetres"]!!.dbl.toInt(), a.uncertaintyMeters)
                        assertEquals("$c unheard", e["secondsUnheard"]!!.dbl.toInt(), a.secondsUnheard)
                    }
                    compared++
                }
            }
        }
        assertTrue("compared $compared vehicles ($live live)", compared > 1500 && live > 100)
    }

    @Test
    fun chainsAndSegmentTimingsMatch() {
        val chains = TestData.vectors("chains.json").obj
        val engine = TrainPositionEngine(TestData.network)
        for ((key, v) in chains) {
            val (line, dir) = key.split(':')
            val fwd = dir == "fwd"
            val st = engine.getLineStations(line, fwd)
            val expected = v.obj["stations"]!!.arr
            assertEquals("$key size", expected.size, st.size)
            for ((i, e) in expected.withIndex()) {
                assertEquals("$key[$i] id", e.obj["id"]!!.str, st[i].id)
                assertEquals("$key[$i] trackDist", e.obj["trackDist"]!!.dbl, st[i].trackDist, 1e-3)
            }
            val seg = v.obj["segmentSeconds"]!!.arr
            for ((i, s) in seg.withIndex()) {
                assertEquals("$key seg[$i]", s.dbl, engine.getSegmentSeconds(line, st[i], st[i + 1]), 1e-9)
            }
        }
    }

    @Test
    fun uncertaintyAndConfidenceMatch() {
        for (v in TestData.vectors("uncertainty.json").arr) {
            val o = v.obj
            val u = TrainPositionEngine.estimatePositionUncertainty(
                o["segmentsWalked"]!!.dbl, o["secondsUnheard"]!!.dbl, o["mps"]!!.dbl,
            )
            assertEquals(o["uncertainty"]!!.dbl, u, 1e-9)
            assertEquals(o["confidence"]!!.dbl, TrainPositionEngine.confidenceFromUncertainty(u), 1e-9)
        }
    }

    @Test
    fun confidenceHasTwoFloors() {
        assertEquals(1.0, TrainPositionEngine.confidenceFromUncertainty(0.0), 0.0)
        assertEquals(1.0, TrainPositionEngine.confidenceFromUncertainty(200.0), 1e-12)
        assertEquals(TrainPositionEngine.MIN_WALKED_CONFIDENCE, TrainPositionEngine.confidenceFromUncertainty(5000.0), 0.0)
        assertTrue(TrainPositionEngine.MIN_POSITION_CONFIDENCE < TrainPositionEngine.MIN_WALKED_CONFIDENCE)
    }

    @Test
    fun deadReckonedTrainsSitAtTheFloor() {
        val sc = TestData.vectors("engine.json").arr.first { it.obj["name"]!!.str == "dead-reckoning-and-stale" }
        val step = sc.obj["steps"]!!.arr[0]
        val engine = TrainPositionEngine(TestData.network)
        val now = step.obj["now"]!!.dbl.toLong()
        val dr = engine.positions(arrivalsOf(step.obj["memory"]!!.arr), now).filter { it.isDeadReckoned }
        assertTrue(dr.isNotEmpty())
        assertTrue(dr.all { it.confidence == TrainPositionEngine.MIN_POSITION_CONFIDENCE })
    }

    @Test
    fun noArrivalsMeansOnlySimulatedTrains() {
        val engine = TrainPositionEngine(TestData.network)
        val all = engine.positions(emptyMap(), 1_700_000_000_000)
        assertTrue(all.isNotEmpty() && all.all { it.simulated && !it.isLive })
        assertEquals((1..10).map { it.toString() }.toSet(), all.map { it.line }.toSet())
    }

    @Test
    fun linesFiveAndSevenRunThroughAyoraAndMachadoIsHeldOffTrack() {
        val engine = TrainPositionEngine(TestData.network)
        for (line in listOf("5", "7")) {
            assertTrue(engine.getLineStations(line).any { it.name == "Ayora" })
        }
        assertTrue(engine.offTrackStations.any { it.second == "Machado" })
        assertTrue(engine.hasReturnTrack("4") && engine.hasReturnTrack("6") && !engine.hasReturnTrack("1"))
    }
}
