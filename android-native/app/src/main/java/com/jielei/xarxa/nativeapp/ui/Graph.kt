package com.jielei.xarxa.nativeapp.ui

import android.content.Context
import com.jielei.xarxa.nativeapp.data.NetworkData
import com.jielei.xarxa.nativeapp.data.LonLat
import com.jielei.xarxa.nativeapp.domain.ArrivalStore
import com.jielei.xarxa.nativeapp.domain.DrawnTrack
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.jielei.xarxa.nativeapp.domain.StationRepository
import com.jielei.xarxa.nativeapp.domain.TrainPositionEngine

/** Parses the bundled data and wires the domain layer. Runs on IO. */
suspend fun buildGraph(context: Context): Graph {
    val data = NetworkData.load(context)
    val geo = context.assets.open("data/lines.geojson").bufferedReader().use { it.readText() }
    val repo = StationRepository(data, lineTracksFrom(geo))
    val store = ArrivalStore(data)
    val engine = TrainPositionEngine(data)
    return Graph(data, repo, store, engine, repo.stations, repo.lines, geo)
}

/** The drawn tracks (main alignments and return legs) in lines.geojson, for snapping Stations onto them. */
fun lineTracksFrom(linesGeoJson: String): List<DrawnTrack> {
    val root = NetworkData.json.parseToJsonElement(linesGeoJson).jsonObject
    return root.getValue("features").jsonArray.mapNotNull { f ->
        val obj = f.jsonObject
        val geom = obj["geometry"]?.jsonObject ?: return@mapNotNull null
        if (geom["type"]?.jsonPrimitive?.content != "LineString") return@mapNotNull null
        val line = obj["properties"]?.jsonObject?.get("line")?.jsonPrimitive?.content ?: return@mapNotNull null
        DrawnTrack(line, geom.getValue("coordinates").jsonArray.map { c ->
            val a = c.jsonArray
            LonLat(a[0].jsonPrimitive.double, a[1].jsonPrimitive.double)
        })
    }
}
