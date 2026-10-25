package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.data.LonLat
import com.jielei.xarxa.nativeapp.data.NetworkData
import com.jielei.xarxa.nativeapp.data.StationProperties
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Station name -> FGV api id, as `STATION_ID_MAP` in arrivalStore.js: every paradas_api name,
 * exactly and lower-cased/trimmed, plus the known spelling aliases. GTFS stop_id is a different id space.
 */
class StationIds(paradas: List<com.jielei.xarxa.nativeapp.data.Parada>) {
    private val map = HashMap<String, Int>()

    init {
        for (p in paradas) {
            map[p.nombre] = p.id
            map[p.nombre.lowercase().trim()] = p.id
        }
        map["Fira València"] = 68
        map["fira valència"] = 68
        map["Pl. Espanya"] = 51
        map["pl. espanya"] = 51
        map["Plaça Espanya"] = 51
        map["plaça espanya"] = 51
    }

    fun apiIdForName(name: String?): Int? {
        if (name == null) return null
        return map[name] ?: map[name.lowercase().trim()]
    }
}

/** Line display data: name from metro_lines, colour with the image overrides applied. */
internal fun buildLineInfos(data: NetworkData): List<LineInfo> =
    data.metroLines.features.filter { it.geometry.type == "LineString" }.map { f ->
        val id = f.properties["line"]?.jsonPrimitive?.content ?: ""
        val name = f.properties["name"]?.jsonPrimitive?.content ?: "Line $id"
        val base = f.properties["color"]?.jsonPrimitive?.content
        val hex = data.lineColors[id] ?: base ?: when (id) {
            "1" -> "#FFD100"; "3" -> "#E2001A"; "5" -> "#00994D"; else -> "#8F6DB8"
        }
        LineInfo(id, name, parseHexColor(hex))
    }

internal fun parseHexColor(hex: String): Long {
    val h = hex.trim().removePrefix("#")
    val rgb = h.toLongOrNull(16) ?: 0x888888L
    return 0xFF000000L or (rgb and 0xFFFFFFL)
}

/** One drawn track of a Line (a Line can have several: the main alignment and return legs). */
class DrawnTrack(val line: String, val coords: List<LonLat>)

/**
 * Presentation-level Station fixes, ported from MapView.jsx: [mergeDuplicates] folds a Station spelled twice
 * ("Pl. Espanya" / "Plaça Espanya": same FGV id, 99 m apart) into one carrying both Lines, and [snap] moves the
 * dot onto the track the map draws (GTFS and OSM disagree by tens of metres). The engine keeps the feed's own
 * coordinates; only this list, drawn and tapped, is adjusted.
 */
object StationPresentation {
    const val SNAP_LIMIT_M = 200.0
    const val DUPLICATE_LIMIT_M = 150.0
    /** Tracks of different Lines this close at a Station are one platform: the dot sits between them. */
    const val SHARED_TRACK_M = 30.0

    fun mergeDuplicates(stations: List<Station>): List<Station> {
        val kept = ArrayList<Station>()
        val byApiId = HashMap<Int, Int>() // apiId -> index in kept
        for (st in stations) {
            val idx = st.apiId?.let { byApiId[it] }
            val twin = idx?.let { kept[it] }
            if (twin != null && GeoUtils.getDistance(LonLat(twin.lon, twin.lat), LonLat(st.lon, st.lat)) < DUPLICATE_LIMIT_M) {
                kept[idx] = twin.copy(lines = (twin.lines + st.lines).distinct())
                continue
            }
            kept.add(st)
            if (st.apiId != null && !byApiId.containsKey(st.apiId)) byApiId[st.apiId] = kept.size - 1
        }
        return kept
    }

    /** Where [station] is drawn: on its Lines' tracks, or where the data puts it when no track is near. */
    fun snapped(station: Station, tracks: Map<String, List<List<LonLat>>>): LonLat {
        val at = LonLat(station.lon, station.lat)
        val perLine = station.lines.mapNotNull { line ->
            tracks[line]?.mapNotNull { GeoUtils.nearestPointOnPath(it, at) }?.minByOrNull { it.distance }
        }
        val best = perLine.minByOrNull { it.distance } ?: return at
        if (best.distance > SNAP_LIMIT_M) return at
        val shared = perLine.filter { GeoUtils.getDistance(it.coordinates, best.coordinates) <= SHARED_TRACK_M }
        return LonLat(shared.map { it.coordinates.lon }.average(), shared.map { it.coordinates.lat }.average())
    }

    fun snap(stations: List<Station>, lineTracks: List<DrawnTrack>): List<Station> {
        val tracks = lineTracks.groupBy({ it.line }, { it.coords })
        return stations.map { st ->
            val p = snapped(st, tracks)
            if (p.lon == st.lon && p.lat == st.lat) st else st.copy(lat = p.lat, lon = p.lon)
        }
    }
}

/** [lineTracks] switches the presentation fixes on (merge, then snap); null keeps the raw feed list (tests). */
class StationRepository(private val data: NetworkData, lineTracks: List<DrawnTrack>? = null) {
    private val ids = StationIds(data.paradas)

    private fun toStation(props: JsonObject, lonLat: LonLat): Station {
        val p = NetworkData.json.decodeFromJsonElement(StationProperties.serializer(), props)
        return Station(
            id = p.id ?: "st-${p.name}",
            name = p.name,
            lat = lonLat.lat,
            lon = lonLat.lon,
            lines = p.lines,
            apiId = ids.apiIdForName(p.name),
            stopId = p.stopId,
        )
    }

    private val gtfsStations: List<Station> = data.gtfs.features
        .filter { it.geometry.type == "Point" }
        .map { toStation(it.properties, it.geometry.point()!!) }

    private val rawStations: List<Station> = run {
        val gtfsNames = gtfsStations.map { it.name }.toSet()
        gtfsStations + data.metroLines.features
            .filter { it.geometry.type == "Point" }
            .map { toStation(it.properties, it.geometry.point()!!) }
            .filter { it.name !in gtfsNames }
    }

    /** Every Station on the network: GTFS first, then points only metro_lines.json knows (as MapView). */
    val stations: List<Station> =
        if (lineTracks == null) rawStations else StationPresentation.snap(StationPresentation.mergeDuplicates(rawStations), lineTracks)

    private val searchable: List<Station> =
        if (lineTracks == null) gtfsStations else gtfsStations.map { g -> stations.firstOrNull { it.id == g.id } ?: g }.distinctBy { it.id }

    val lines: List<LineInfo> = buildLineInfos(data)

    val byId: Map<String, Station> = stations.associateBy { it.id }

    fun byApiId(apiId: Int): Station? = stations.firstOrNull { it.apiId == apiId }

    /**
     * Lines first (matched on "name Line n Linia n"), then Stations (GTFS set), each best score first,
     * like the web SearchBar.
     */
    fun search(query: String): List<SearchResult> {
        if (query.isBlank()) return emptyList()
        val lineHits = FuzzySearch.searchFuzzy(lines, query) { "${it.name} Line ${it.id} Linia ${it.id}" }
        val stationHits = FuzzySearch.searchFuzzy(searchable, query) { it.name }
        return lineHits.map { SearchResult.LineHit(it) } + stationHits.map { SearchResult.StationHit(it) }
    }

    /** Straight-line nearest Station however far; apply [NEAREST_STATION_RANGE_M] yourself. */
    fun nearest(lat: Double, lon: Double): NearestStation? {
        val at = LonLat(lon, lat)
        val best = GeoUtils.nearestFeature(stations, at) { LonLat(it.lon, it.lat) } ?: return null
        return NearestStation(best.item, best.distance)
    }
}
