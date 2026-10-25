package com.jielei.xarxa.nativeapp.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LineRevealTest {
    private fun st(id: String, lon: Double, vararg lines: String) = Station(id, id, 39.47, lon, lines.toList(), null)

    // A line of 9 stations 1 km apart, interchange at index 4.
    private val line = (0..8).map { st("s$it", -0.40 + it * 0.0116, if (it == 4) "1" else "1", *(if (it == 4) arrayOf("3") else emptyArray())) }

    @Test fun endsAndInterchangesAreMajor() {
        val r = LineReveal.ranks(line, setOf("1"))
        assertEquals(LineReveal.MAJOR, r["s0"]); assertEquals(LineReveal.MAJOR, r["s8"]); assertEquals(LineReveal.MAJOR, r["s4"])
    }

    @Test fun everyStationOnTheLineGetsARankAndOthersNone() {
        val other = st("x", -0.2, "9")
        val r = LineReveal.ranks(line + other, setOf("1"))
        assertEquals(9, r.size); assertTrue("x" !in r)
    }

    @Test fun midLevelFillsTheLargestGapsFirst() {
        val r = LineReveal.ranks(line, setOf("1"))
        // 0, 4, 8 are shown; the farthest remaining stations are 2 and 6.
        assertEquals(LineReveal.MID, r["s2"]); assertEquals(LineReveal.MID, r["s6"])
        assertEquals(3, r.values.count { it == LineReveal.MID })      // half of the six remaining
        assertEquals(3, r.values.count { it == LineReveal.MINOR })
    }
}
