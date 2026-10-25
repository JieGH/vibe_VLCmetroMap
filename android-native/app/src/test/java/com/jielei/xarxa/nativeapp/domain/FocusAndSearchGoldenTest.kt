package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.data.LonLat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FocusAndSearchGoldenTest {
    private val repo by lazy { StationRepository(TestData.network) }

    @Test
    fun stationFocusMatchesTheJsOutput() {
        val engine = TrainPositionEngine(TestData.network)
        for (c in TestData.vectors("focus.json").arr) {
            val name = c.obj["name"]!!.str!!
            val s = c.obj["station"]!!.obj
            val station = Station(
                id = "x", name = s["name"]!!.str!!, lat = 0.0, lon = 0.0,
                lines = s["lines"]!!.arr.map { it.str!! },
                apiId = s["apiId"]?.dblOrNull?.toInt(),
            )
            val now = c.obj["now"]!!.dbl.toLong()
            val entry = c.obj["entry"]!!.obj
            val fetchedAt = entry["fetchedAt"]!!.dbl.toLong()
            val key = c.obj["key"]!!.str!!
            val projected = entry["arrivals"]!!.arr.map { a ->
                val ao = a.obj
                val target = ao["targetTimestamp"]!!.dbl.toLong()
                val arrival = Arrival(
                    ao["line"]!!.str!!, ao["destination"]!!.str!!, ao["vehicleId"]?.str, target, 0.0,
                    key, station.name, fetchedAt,
                )
                val rem = maxOf(0L, Math.round((target - now) / 1000.0))
                ProjectedArrival(
                    arrival, rem.toInt(), maxOf(0L, Math.round(rem / 60.0)).toInt(),
                    if (rem <= 0) ArrivalStatus.AtPlatform else if (rem <= 120) ArrivalStatus.Approaching else ArrivalStatus.OnTime,
                )
            }.sortedBy { it.seconds }
            val cached = if (projected.isEmpty()) null
            else CachedArrivals(projected, now - fetchedAt < 60_000, fetchedAt, null)

            val f = engine.focusStation(station, cached, now)
            val e = c.obj["focus"]!!.obj

            fun rows(list: List<ProjectedArrival>) = list.map { listOf(it.line, it.destination, it.seconds.toString()) }
            fun expRows(a: kotlinx.serialization.json.JsonElement) =
                a.arr.map { listOf(it.arr[0].str!!, it.arr[1].str!!, it.arr[2].dbl.toInt().toString()) }

            assertEquals("$name arrivals", expRows(e["arrivals"]!!), rows(f.arrivals))
            assertEquals("$name later", expRows(e["laterArrivals"]!!), rows(f.laterArrivals))
            val ed = e["directions"]!!.arr
            assertEquals("$name directions", ed.size, f.directions.size)
            for ((i, d) in ed.withIndex()) {
                val a = f.directions[i]
                assertEquals("$name dir $i key", d.obj["key"]!!.str, a.key)
                assertEquals("$name dir $i destination", d.obj["destination"]!!.str, a.destination)
                assertEquals("$name dir $i destinations", d.obj["destinations"]!!.arr.map { it.str }, a.destinations)
                assertEquals("$name dir $i bearing", 0.0, bearingDiff(d.obj["bearing"]!!.dbl, a.bearing!!), 1e-3)
                assertEquals("$name dir $i arrivals", expRows(d.obj["arrivals"]!!), rows(a.arrivals))
            }
            assertEquals("$name fresh", e["isFresh"]!!.bool, f.isFresh)
            assertEquals("$name unheard", e["secondsUnheard"]!!.dblOrNull?.toInt(), f.secondsUnheard)
        }
    }

    @Test
    fun searchMatchesTheJsRanking() {
        for (c in TestData.vectors("search.json").arr) {
            val q = c.obj["query"]!!.str!!
            val results = repo.search(q)
            val lines = results.filterIsInstance<SearchResult.LineHit>().map { it.line.id }
            val stations = results.filterIsInstance<SearchResult.StationHit>().map { it.station.id }
            assertEquals("lines for '$q'", c.obj["lines"]!!.arr.map { it.str }, lines)
            assertEquals("stations for '$q'", c.obj["stations"]!!.arr.map { it.str }, stations)
            // Lines first, then Stations.
            val firstStation = results.indexOfFirst { it is SearchResult.StationHit }
            if (firstStation >= 0) assertTrue(results.drop(firstStation).none { it is SearchResult.LineHit })
        }
    }

    @Test
    fun fuzzyScoresMatchTheJs() {
        for (c in TestData.vectors("fuzzyscore.json").arr) {
            val expected = c.obj["score"]!!.dblOrNull?.toInt()
            assertEquals("${c.obj["target"]!!.str} / ${c.obj["query"]!!.str}", expected,
                FuzzySearch.fuzzyScore(c.obj["target"]!!.str, c.obj["query"]!!.str))
        }
    }

    @Test
    fun countdownHeatMatchesTheJs() {
        for (c in TestData.vectors("heat.json").arr) {
            val s = c.obj["seconds"]!!.dblOrNull ?: Double.POSITIVE_INFINITY
            fun hex(v: Long) = "#%06x".format(v and 0xFFFFFF)
            assertEquals("dark $s", c.obj["dark"]!!.str, hex(countdownColor(s, true)))
            assertEquals("light $s", c.obj["light"]!!.str, hex(countdownColor(s, false)))
            assertEquals("label $s", c.obj["label"]!!.str, countdownLabel(s))
            assertEquals("unit $s", c.obj["unit"]?.str, countdownUnit(s))
        }
    }

    @Test
    fun geoUtilsMatchTheJs() {
        val g = TestData.vectors("geo.json").obj
        fun pt(e: kotlinx.serialization.json.JsonElement) = LonLat(e.arr[0].dbl, e.arr[1].dbl)
        for (d in g["distances"]!!.arr) {
            assertEquals(d.obj["d"]!!.dbl, GeoUtils.getDistance(pt(d.obj["a"]!!), pt(d.obj["b"]!!)), 1e-6)
        }
        for (d in g["haversineEngine"]!!.arr) {
            assertEquals(d.obj["d"]!!.dbl, TrainPositionEngine.haversineDistance(pt(d.obj["a"]!!), pt(d.obj["b"]!!)), 1e-6)
        }
        val metro = TestData.network.metroLines.features
        fun line(id: String) = metro.first {
            it.geometry.type == "LineString" && it.properties["line"]?.let { v -> (v as kotlinx.serialization.json.JsonPrimitive).content } == id
        }.geometry.line()
        for (n in g["nearestOnPath"]!!.arr) {
            val r = GeoUtils.nearestPointOnPath(line(n.obj["line"]!!.str!!), pt(n.obj["point"]!!))!!
            assertEquals(n.obj["coordinates"]!!.arr[0].dbl, r.coordinates.lon, 1e-6)
            assertEquals(n.obj["coordinates"]!!.arr[1].dbl, r.coordinates.lat, 1e-6)
            assertEquals(n.obj["distance"]!!.dbl, r.distance, 1e-3)
        }
        for (n in g["interpolate"]!!.arr) {
            val p = GeoUtils.interpolatePath(line(n.obj["line"]!!.str!!), n.obj["t"]!!.dbl)
            assertEquals(n.obj["p"]!!.arr[0].dbl, p.lon, 1e-6)
            assertEquals(n.obj["p"]!!.arr[1].dbl, p.lat, 1e-6)
        }
        for (n in g["pathsOff"]!!.arr) {
            val id = n.obj["line"]!!.str!!
            val ret = TestData.network.returnTracks.lines[id]!!.path()
            val runs = GeoUtils.pathsOffReference(ret, line(id), 12.0)
            val exp = n.obj["runs"]!!.arr
            assertEquals("runs L$id", exp.size, runs.size)
            for ((i, run) in exp.withIndex()) {
                assertEquals(run.arr.size, runs[i].size)
                for ((j, p) in run.arr.withIndex()) {
                    assertEquals(p.arr[0].dbl, runs[i][j].lon, 1e-9)
                    assertEquals(p.arr[1].dbl, runs[i][j].lat, 1e-9)
                }
            }
        }
        val nearest = g["nearest"]!!.arr
        assertTrue(nearest.isNotEmpty())
        for (n in nearest) {
            val p = pt(n.obj["point"]!!)
            val r = repo.nearest(p.lat, p.lon)!!
            assertEquals(n.obj["id"]!!.str, r.station.id)
            assertEquals(n.obj["distance"]!!.dbl, r.distanceMeters, 1e-3)
        }
    }

    @Test
    fun apiIdsResolveAndNothingHasNoStationsOutOfRange() {
        // The eastern L5/L7 stations once thought to have no live endpoint (issue #3).
        val ids = StationIds(TestData.network.paradas)
        assertEquals(22, ids.apiIdForName("Ayora"))
        assertEquals(23, ids.apiIdForName("Amistat"))
        assertEquals(24, ids.apiIdForName("Aragó"))
        assertEquals(51, ids.apiIdForName("Pl. Espanya"))
        assertNull(ids.apiIdForName("Nowhere"))
        // Hubs and Major Stations point at themselves in paradas_api.json.
        val byId = TestData.network.paradas.associate { it.id to it.nombre }
        val live = TestData.network.liveStations
        for (s in live.strategicHubs + live.majorStations) assertEquals(s.name, byId[s.id])
    }
}
