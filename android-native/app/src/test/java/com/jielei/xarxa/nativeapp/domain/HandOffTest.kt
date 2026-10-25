package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.data.LonLat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A train leaves station A and is caught by station B's feed under the same vehicle id: the marker must keep its
 * identity and move on without a jump at the hand-off, and must survive until no upcoming arrival remains.
 */
class HandOffTest {
    private val engine = TrainPositionEngine(TestData.network)
    private val now0 = 1_800_000_000_000L

    private fun arrival(station: TrackStation, vehicle: String, targetMs: Long, fetchedMs: Long) = Arrival(
        line = "3", destination = "Aeroport", vehicleId = vehicle, targetEpochMs = targetMs, initialSeconds = 0.0,
        stationKey = station.id, stationName = station.name, fetchedAtMs = fetchedMs,
    )

    private fun metres(a: TrainPosition, b: TrainPosition) = GeoUtils.getDistance(LonLat(a.lon, a.lat), LonLat(b.lon, b.lat))

    private fun feed(vararg a: Arrival): Map<String, List<Arrival>> = a.groupBy { it.stationKey }

    @Test fun markerKeepsItsIdAndNeverJumpsWhenStationAHandsOverToStationB() {
        val chain = engine.getLineStations("3", true)
        val a = chain[8]; val b = chain[9]; val c = chain[10]
        // The same vehicle is predicted at A in 20 s, B in 100 s, C in 190 s (fetched at t0).
        val arrivals = feed(
            arrival(a, "3309", now0 + 20_000, now0),
            arrival(b, "3309", now0 + 100_000, now0),
            arrival(c, "3309", now0 + 190_000, now0),
        )
        // Later only B and C are heard (A's feed no longer lists the train): the hand-off.
        val later = feed(arrival(b, "3309", now0 + 100_000, now0 + 60_000), arrival(c, "3309", now0 + 190_000, now0 + 60_000))
        var prev: TrainPosition? = null
        var worst = 0.0
        for (s in 0..150) {
            val t = now0 + s * 1000L
            val source = if (s < 50) arrivals else later // switches at s = 50, after A's 20 s grace has passed
            val p = engine.livePositions(source, t).singleOrNull { it.vehicleId == "3309" }
            assertTrue("train missing at +${s}s", p != null)
            assertEquals("live-3-3309", p!!.id)
            prev?.let { worst = maxOf(worst, metres(it, p)) }
            prev = p
        }
        println("HANDOFF worst 1 s step: ${"%.1f".format(worst)} m")
        assertTrue("jump of $worst m", worst < 60.0) // a metro does about 20 m/s
    }

    @Test fun trainDropsOnlyWhenNoUpcomingArrivalRemains() {
        val b = engine.getLineStations("3", true)[9]
        val arrivals = feed(arrival(b, "3310", now0 + 30_000, now0))
        assertTrue(engine.livePositions(arrivals, now0 + 30_000 + 10_000).any { it.vehicleId == "3310" })   // inside the 20 s grace
        assertTrue(engine.livePositions(arrivals, now0 + 30_000 + 25_000).none { it.vehicleId == "3310" })  // past it
    }
}
