package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.data.LonLat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FuzzySearchTest {
    private val f = FuzzySearch

    @Test fun normalizeAccentsEquatesValencianVowels() {
        val pairs = listOf("a" to "a", "à" to "a", "á" to "a", "è" to "e", "é" to "e", "í" to "i", "ï" to "i",
            "ò" to "o", "ó" to "o", "ú" to "u", "ü" to "u", "ç" to "c", "ñ" to "n")
        for ((from, to) in pairs) assertEquals(to, f.normalizeAccents(from))
        assertEquals("", f.normalizeAccents(""))
        assertEquals("", f.normalizeAccents(null))
        assertEquals("angel guimera", f.normalizeAccents("ÀNGEL GUIMERÀ"))
    }

    @Test fun cleanSearchTextTurnsPunctuationIntoSpaces() {
        assertEquals("col legi", f.cleanSearchText("Col·legi"))
        assertEquals("l eliana", f.cleanSearchText("L'Eliana"))
        assertEquals("burjassot godella", f.cleanSearchText("Burjassot-Godella"))
    }

    private fun matches(target: String, query: String) = (f.fuzzyScore(target, query) ?: 0) > 0

    @Test fun matchesWithAndWithoutAccents() {
        for (q in listOf("xativa", "XÀTIVA", "xat", "Xàt")) assertTrue(q, matches("Xàtiva", q))
        for (q in listOf("angel", "guimera", "angel guimera")) assertTrue(q, matches("Àngel Guimerà", q))
        assertTrue(matches("Colón", "colon")); assertTrue(matches("Colón", "col"))
        assertTrue(matches("Bétera", "betera")); assertTrue(matches("València Sud", "valencia"))
    }

    @Test fun matchesAcrossWordsAndCompactForms() {
        assertTrue(matches("L'Eliana", "leliana")); assertTrue(matches("L'Eliana", "eliana"))
        assertTrue(matches("La Pobla de Farnals", "pobla farnals")); assertTrue(matches("La Pobla de Farnals", "farnals"))
    }

    @Test fun recognisesTransitAbbreviations() {
        assertTrue(matches("Pl. Espanya", "placa")); assertTrue(matches("Pl. Espanya", "placa espanya"))
        assertTrue(matches("Pl. Espanya", "espanya"))
    }

    @Test fun noMatchIsNull() {
        assertNull(f.fuzzyScore("Xàtiva", "betera")); assertNull(f.fuzzyScore("Colón", "aeroport"))
        assertNull(f.fuzzyScore("Alameda", ""))
    }

    private val sample = listOf("Xàtiva", "Àngel Guimerà", "Colón", "Bétera", "València Sud", "La Pobla de Farnals",
        "L'Eliana", "Pl. Espanya", "Almàssera", "Benimaclet")

    @Test fun searchRanksAndIgnoresAccents() {
        assertEquals(listOf("Xàtiva"), f.searchFuzzy(sample, "xativa") { it })
        assertEquals("Àngel Guimerà", f.searchFuzzy(sample, "Àngel") { it }[0])
        assertEquals("Àngel Guimerà", f.searchFuzzy(sample, "angel") { it }[0])
        assertEquals("Almàssera", f.searchFuzzy(sample, "almassera") { it }[0])
        assertTrue(f.searchFuzzy(sample, "") { it }.isEmpty())
        assertTrue(f.searchFuzzy(sample, "   ") { it }.isEmpty())
    }
}

class CountdownHeatTest {
    private fun lum(c: Long): Double {
        fun ch(shift: Int): Double {
            val x = ((c shr shift) and 0xFF) / 255.0
            return if (x <= 0.03928) x / 12.92 else Math.pow((x + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * ch(16) + 0.7152 * ch(8) + 0.0722 * ch(0)
    }

    private fun contrast(a: Long, b: Long): Double {
        val (l1, l2) = lum(a) to lum(b)
        return (maxOf(l1, l2) + 0.05) / (minOf(l1, l2) + 0.05)
    }

    @Test fun everyBandIsReadableOnItsBackdrop() {
        for (dark in listOf(true, false)) {
            val backdrop = if (dark) HEAT_BACKDROP_DARK else HEAT_BACKDROP_LIGHT
            for (band in HEAT_BANDS) {
                val c = countdownColor(if (band.maxSeconds.isInfinite()) 9999.0 else band.maxSeconds, dark)
                assertTrue("${band.key} dark=$dark ${contrast(c, backdrop)}", contrast(c, backdrop) >= 4.5)
            }
        }
    }

    @Test fun hotWhenDueCoolWhenFar() {
        assertEquals(countdownColor(0), countdownColor(-30))
        assertNotEquals(countdownColor(0), countdownColor(9999))
        assertEquals(countdownColor(60), countdownColor(120))
        assertNotEquals(countdownColor(120), countdownColor(121))
        assertNotEquals(countdownColor(600), countdownColor(601))
        for (dark in listOf(true, false)) {
            assertEquals(HEAT_BANDS.size, HEAT_BANDS.map { countdownColor(if (it.maxSeconds.isInfinite()) 9999.0 else it.maxSeconds, dark) }.toSet().size)
        }
    }

    @Test fun labelAndUnit() {
        assertEquals("Arriving", countdownLabel(DUE_THRESHOLD_SECONDS)); assertEquals("Arriving", countdownLabel(0)); assertEquals("Arriving", countdownLabel(-30))
        assertNull(countdownUnit(DUE_THRESHOLD_SECONDS))
        assertEquals("31", countdownLabel(DUE_THRESHOLD_SECONDS + 1)); assertEquals("45", countdownLabel(45)); assertEquals("sec", countdownUnit(45))
        assertEquals("1", countdownLabel(60)); assertEquals("3", countdownLabel(150)); assertEquals("min", countdownUnit(60))
        assertEquals("Llega", countdownLabel(5, "Llega"))
    }
}

class LineDimTest {
    private fun st(vararg lines: String) = Station("x", "Àngel Guimerà", 0.0, 0.0, lines.toList(), null)
    private val station = st("3", "5")

    @Test fun lineServesStation() {
        assertTrue(lineServesStation("3", station)); assertFalse(lineServesStation("1", station))
        assertTrue(lineServesStation("1", null)); assertFalse(lineServesStation("1", st()))
    }

    @Test fun dimmedOpacity() {
        assertEquals(0.8, dimmedVehicleOpacity(0.8, "3", station), 0.0)
        assertEquals(0.8 * DIM_FACTOR, dimmedVehicleOpacity(0.8, "1", station), 1e-12)
        assertEquals(0.8, dimmedVehicleOpacity(0.8, "1", null), 0.0)
    }

    @Test fun pulse() {
        assertFalse(vehicleShouldPulse(true, "3", null))
        assertTrue(vehicleShouldPulse(true, "3", station))
        assertFalse(vehicleShouldPulse(true, "1", station))
        assertFalse(vehicleShouldPulse(false, "3", station)); assertFalse(vehicleShouldPulse(false, "3", null))
    }
}

class GeoUtilsTest {
    private val path = listOf(LonLat(-0.3800, 39.4600), LonLat(-0.3800, 39.4800))

    @Test fun pathsOffReferenceReturnsOnlyTheDetour() {
        val trunk = path
        val detour = listOf(LonLat(-0.3800, 39.4600), LonLat(-0.3800, 39.4650), LonLat(-0.3780, 39.4670),
            LonLat(-0.3780, 39.4730), LonLat(-0.3800, 39.4750), LonLat(-0.3800, 39.4800))
        val runs = GeoUtils.pathsOffReference(detour, trunk, 12.0)
        assertEquals(1, runs.size)
        assertEquals(detour.subList(1, 5), runs[0])
        assertTrue(GeoUtils.pathsOffReference(trunk, trunk, 12.0).isEmpty())
    }

    @Test fun coastalReturnLegPastDrLluchAndCabanyal() {
        val data = TestData.network
        val stations = StationRepository(data).stations.associateBy { it.name }
        for (lineId in listOf("4", "6")) {
            val outbound = data.metroLines.features.first {
                it.geometry.type == "LineString" && (it.properties["line"] as kotlinx.serialization.json.JsonPrimitive).content == lineId
            }.geometry.line()
            val runs = GeoUtils.pathsOffReference(data.returnTracks.lines[lineId]!!.path(), outbound, 12.0)
            fun nearestRun(name: String): Double {
                val s = stations[name]!!
                return runs.minOf { GeoUtils.nearestPointOnPath(it, LonLat(s.lon, s.lat))!!.distance }
            }
            assertTrue(nearestRun("Cabanyal") < 30)
            assertTrue(nearestRun("Dr. Lluch") < 30)
            assertTrue(nearestRun("Platja les Arenes") > 100)
        }
    }

    @Test fun nearestPointOnPath() {
        val point = LonLat(-0.3790, 39.4700)
        val n = GeoUtils.nearestPointOnPath(path, point)!!
        assertEquals(-0.38, n.coordinates.lon, 1e-5); assertEquals(39.47, n.coordinates.lat, 1e-5)
        assertTrue(n.distance > 80 && n.distance < 90)
        assertEquals(n.distance, GeoUtils.getDistance(point, n.coordinates), 0.5)
        assertEquals(39.48, GeoUtils.nearestPointOnPath(path, LonLat(-0.38, 39.49))!!.coordinates.lat, 1e-5)
        assertNull(GeoUtils.nearestPointOnPath(emptyList(), LonLat(-0.38, 39.47)))
    }

    @Test fun nearestFeaturePicksTheCloserNotTheFirst() {
        val items = listOf("west" to LonLat(-0.3810, 39.4700), "east" to LonLat(-0.3790, 39.4700))
        fun near(x: Double) = GeoUtils.nearestFeature(items, LonLat(x, 39.47)) { it.second }!!
        assertEquals("east", near(-0.3792).item.first)
        assertEquals("west", near(-0.3808).item.first)
        assertTrue(near(-0.3810).distance < 1)
        assertNull(GeoUtils.nearestFeature(emptyList<LonLat>(), LonLat(0.0, 0.0)) { it })
    }
}

class StationRepositoryTest {
    private val repo by lazy { StationRepository(TestData.network) }

    @Test fun exposesTheNetwork() {
        assertTrue(repo.stations.size >= 140)
        assertNotNull(repo.byId["st-20"])
        assertEquals(10, repo.lines.size)
        assertEquals(17, repo.stations.first { it.name == "Àngel Guimerà" }.apiId)
        assertEquals(51, repo.stations.first { it.name == "Plaça Espanya" }.apiId)
    }

    @Test fun searchFindsAccentInsensitiveStationsAndLines() {
        val r = repo.search("guimera")
        assertEquals("Àngel Guimerà", (r.first() as SearchResult.StationHit).station.name)
        val l = repo.search("linia 3").first()
        assertEquals("3", (l as SearchResult.LineHit).line.id)
        assertTrue(repo.search("  ").isEmpty())
    }

    @Test fun nearestIsStraightLine() {
        val ag = repo.stations.first { it.name == "Àngel Guimerà" }
        val n = repo.nearest(ag.lat + 0.0001, ag.lon)!!
        assertEquals(ag.name, n.station.name)
        assertTrue(n.distanceMeters < 20)
        val far = repo.nearest(40.5, 0.5)!!
        assertTrue(far.distanceMeters > NEAREST_STATION_RANGE_M)
    }
}
