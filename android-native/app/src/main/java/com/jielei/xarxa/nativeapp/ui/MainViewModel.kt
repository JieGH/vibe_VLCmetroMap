package com.jielei.xarxa.nativeapp.ui

import android.app.Application
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jielei.xarxa.nativeapp.Perf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.jielei.xarxa.nativeapp.data.NetworkData
import com.jielei.xarxa.nativeapp.domain.ArrivalStore
import com.jielei.xarxa.nativeapp.domain.LineInfo
import com.jielei.xarxa.nativeapp.domain.Station
import com.jielei.xarxa.nativeapp.domain.StationRepository
import com.jielei.xarxa.nativeapp.domain.TrainPositionEngine
import com.jielei.xarxa.nativeapp.domain.TrainTracker
import com.jielei.xarxa.nativeapp.map.CameraRequest
import kotlinx.coroutines.launch
import org.maplibre.android.geometry.LatLng

/**
 * Station names shown as quick-access chips, first to last: the most visited stops (La Marina, Marítim, Colón,
 * Xàtiva), then the rest of the Strategic Hubs (live_stations.json). Reorder or extend here; names must match the GTFS station names exactly.
 */
val COMMON_STOPS = listOf("Grau - La Marina", "Marítim", "Colón", "Xàtiva", "Àngel Guimerà", "La Carrasca", "Russafa")

enum class ThemeMode { System, Light, Dark }

/** Everything the screen needs once the bundled data is parsed. */
class Graph(
    val data: NetworkData,
    val repo: StationRepository,
    val store: ArrivalStore,
    val engine: TrainPositionEngine,
    val stations: List<Station>,
    val lines: List<LineInfo>,
    val linesGeoJson: String,
) {
    /** The quick-access chips under the search pill, in [COMMON_STOPS] order. */
    val hubs: List<Station> = COMMON_STOPS.mapNotNull { name -> stations.firstOrNull { it.name == name } }
    val lineColors: Map<String, Long> = lines.associate { it.id to it.colorArgb }
}

sealed interface Notice {
    val message: Int
    data class Plain(override val message: Int) : Notice
    data class Settings(override val message: Int) : Notice
}

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("xarxa_ui", Context.MODE_PRIVATE)

    var graph by mutableStateOf<Graph?>(null)
        private set
    var themeMode by mutableStateOf(
        runCatching { ThemeMode.valueOf(prefs.getString("theme", null) ?: "System") }.getOrDefault(ThemeMode.System),
    )
        private set
    var selected by mutableStateOf<Station?>(null)
        private set
    var filter by mutableStateOf<Set<String>>(emptySet())
        private set
    var cameraRequest by mutableStateOf<CameraRequest?>(null)
        private set
    var userLocation by mutableStateOf<LatLng?>(null)
        private set
    var notice by mutableStateOf<Notice?>(null)
    var autoLocated = false
    /** Debug/bench only: draw FakeTrains instead of the engine's. */
    var fakeTrains = false
    var fakeMany = false

    private var nonce = 0L
    private fun nextNonce() = ++nonce

    init {
        viewModelScope.launch {
            val g = withContext(Dispatchers.IO) { buildGraph(app) }
            graph = g
            Perf.once("graph_ready")
            g.store.startNetworkSync(viewModelScope)
            TrainTracker(g.engine, g.store).start(viewModelScope)
        }
    }

    override fun onCleared() {
        graph?.store?.stopNetworkSync()
    }

    fun chooseTheme(mode: ThemeMode) {
        themeMode = mode
        prefs.edit().putString("theme", mode.name).apply()
    }

    /** The station the floating walking box is about (null: hidden). [walkNonce] restarts its auto-hide timer. */
    var walkTarget by mutableStateOf<Station?>(null)
        private set
    var walkNonce by mutableLongStateOf(0L)
        private set

    fun dismissWalk() {
        walkTarget = null
    }

    fun selectStation(station: Station) {
        selected = station
        if (userLocation != null) { walkTarget = station; walkNonce++ }
        cameraRequest = CameraRequest.FocusStation(station, nextNonce())
    }

    fun clearSelection() {
        val closing = selected ?: return
        selected = null
        walkTarget = null
        cameraRequest = CameraRequest.ZoomOutFrom(closing, nextNonce())
    }

    fun toggleLine(id: String) {
        filter = if (id in filter) filter - id else filter + id
    }

    fun filterOnly(id: String) {
        filter = setOf(id)
        val on = graph?.stations?.filter { id in it.lines }.orEmpty()
        if (on.size > 1) cameraRequest = CameraRequest.FitStations(on.map { LatLng(it.lat, it.lon) }, nextNonce())
    }

    fun clearFilter() {
        filter = emptySet()
    }

    fun showUser(lat: Double, lon: Double) {
        userLocation = LatLng(lat, lon)
        cameraRequest = CameraRequest.ShowUser(lat, lon, nextNonce())
    }

    /** Moves the dot without touching the camera (a refined fix). */
    fun updateUser(lat: Double, lon: Double) {
        userLocation = LatLng(lat, lon)
    }

    fun hideUser() {
        userLocation = null
    }
}
