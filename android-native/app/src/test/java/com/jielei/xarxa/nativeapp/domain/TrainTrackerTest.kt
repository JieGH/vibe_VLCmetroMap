package com.jielei.xarxa.nativeapp.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class TrainTrackerTest {
    private fun train(id: String, line: String, target: String, secs: Int, forward: Boolean = true, dead: Boolean = false, sim: Boolean = false) =
        TrainPosition(
            id = id, line = line, vehicleId = id, lat = 0.0, lon = 0.0, bearing = 0.0, confidence = 1.0, simulated = sim,
            isLive = !sim, isForward = forward, isDeadReckoned = dead, distanceAlongTrack = 0.0, destination = "",
            status = null, targetStation = target, secondsToTarget = secs, uncertaintyMeters = 0, secondsUnheard = 0, sightingCount = 1,
        )

    // A line A - B - C - D; forward trains go A -> D.
    private val chain = listOf("A", "B", "C", "D")
    private val after = { _: String, s: String, fwd: Boolean -> chain.getOrNull(chain.indexOf(s) + if (fwd) 1 else -1) }

    private fun tracker() = TrainTracker(TrainPositionEngine(TestData.network), ArrivalStore(TestData.network))

    @Test fun onlyTrainsDueSoonPullInTheirNextStation() {
        val c = tracker().candidates(listOf(train("t1", "3", "B", 10), train("t2", "3", "C", 200)), after)
        assertEquals(listOf("C"), c)
    }

    @Test fun urgencyOrderAndDirection() {
        val c = tracker().candidates(listOf(train("t1", "3", "B", 10), train("t3", "3", "C", 5, forward = false)), after)
        assertEquals(listOf("B", "C"), c) // t3 (5 s, backward from C) -> B, then t1 (10 s, forward from B) -> C
    }

    @Test fun simulatedAreIgnoredAndDeadReckonedRefreshTheirOwnTarget() {
        val c = tracker().candidates(listOf(train("s", "3", "B", 1, sim = true), train("d", "3", "C", 300, dead = true)), after)
        assertEquals(listOf("C"), c)
    }

    @Test fun endOfLineAndDuplicatesYieldNothingExtra() {
        val c = tracker().candidates(listOf(train("a", "3", "D", 5), train("b", "3", "B", 6), train("c", "3", "B", 7)), after)
        assertEquals(listOf("C"), c)
    }
}
