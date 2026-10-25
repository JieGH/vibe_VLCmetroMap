package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.data.LonLat
import com.jielei.xarxa.nativeapp.ui.lineTracksFrom
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class StationPresentationTest {
    private val tracks by lazy { lineTracksFrom(File("src/main/assets/data/lines.geojson").readText()) }
    private val raw by lazy { StationRepository(TestData.network).stations }
    private val shown by lazy { StationRepository(TestData.network, tracks).stations }

    private fun st(id: String, name: String, lon: Double, lat: Double, lines: List<String>, api: Int?) =
        Station(id, name, lat, lon, lines, api)

    @Test fun twinsWithTheSameFgvIdWithin150mMergeAndUniteTheirLines() {
        val a = st("a", "Pl. Espanya", -0.3816, 39.4662, listOf("3", "5"), 51)
        val b = st("b", "Plaça Espanya", -0.3820, 39.4666, listOf("1", "7"), 51)   // ~50 m away
        val far = st("c", "Plaça Espanya", -0.3900, 39.4700, listOf("9"), 51)       // ~1 km: not a twin
        val other = st("d", "Colón", -0.3709, 39.4701, listOf("3"), 15)
        val merged = StationPresentation.mergeDuplicates(listOf(a, b, far, other))
        assertEquals(listOf("a", "c", "d"), merged.map { it.id })
        assertEquals(listOf("3", "5", "1", "7"), merged[0].lines)
    }

    @Test fun snappedStationSitsOnItsTrackAndSharedTracksAverage() {
        val one = mapOf("1" to listOf(listOf(LonLat(0.0, 0.0), LonLat(0.002, 0.0))))
        val p = StationPresentation.snapped(st("x", "X", 0.001, 0.0002, listOf("1"), null), one) // 22 m north of the line
        assertEquals(0.0, p.lat, 1e-9); assertEquals(0.001, p.lon, 1e-9)
        val two = one + ("2" to listOf(listOf(LonLat(0.0, 0.0002), LonLat(0.002, 0.0002))))      // 22 m apart
        val mid = StationPresentation.snapped(st("x", "X", 0.001, 0.0001, listOf("1", "2"), null), two)
        assertEquals(0.0001, mid.lat, 1e-9)
        val far = StationPresentation.snapped(st("x", "X", 0.001, 0.01, listOf("1"), null), one)  // 1.1 km: stays
        assertEquals(0.01, far.lat, 1e-9)
    }

    @Test fun realDataHasOnePlacaEspanyaAndXativaIsOnItsTrack() {
        assertEquals(1, shown.count { it.apiId == 51 })
        assertTrue(raw.count { it.apiId == 51 } >= 2)
        val x = shown.first { it.name == "Xàtiva" }
        val byLine = tracks.groupBy({ it.line }, { it.coords })
        val d = x.lines.mapNotNull { l -> byLine[l]?.mapNotNull { GeoUtils.nearestPointOnPath(it, LonLat(x.lon, x.lat)) }?.minOfOrNull { it.distance } }.min()
        assertTrue("Xàtiva is $d m from its track", d < 3.0)
    }

    @Test fun reportStationsMovedMoreThanFiveMetres() {
        val rawById = raw.associateBy { it.id }
        val moved = shown.mapNotNull { s ->
            val r = rawById[s.id] ?: return@mapNotNull null
            val m = GeoUtils.getDistance(LonLat(r.lon, r.lat), LonLat(s.lon, s.lat))
            if (m > 5) s.name to Math.round(m) else null
        }.sortedByDescending { it.second }
        println("MOVED>5m (${moved.size}): " + moved.joinToString { "${it.first}=${it.second}m" })
        println("RAW=${raw.size} SHOWN=${shown.size}; dropped twins: " + (raw.map { it.id } - shown.map { it.id }.toSet()).joinToString())
    }
}
