package com.jielei.xarxa.nativeapp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.jielei.xarxa.nativeapp.BuildConfig
import com.jielei.xarxa.nativeapp.Perf
import com.jielei.xarxa.nativeapp.R
import com.jielei.xarxa.nativeapp.domain.SearchResult
import com.jielei.xarxa.nativeapp.map.XarxaMap
import com.jielei.xarxa.nativeapp.theme.XarxaTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun XarxaScreen(vm: MainViewModel) {
    val systemDark = isSystemInDarkTheme()
    val dark = when (vm.themeMode) {
        ThemeMode.System -> systemDark
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    XarxaTheme(dark) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            val g = vm.graph
            if (g == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                Content(vm, g, dark)
            }
        }
    }
}

@Composable
private fun Content(vm: MainViewModel, g: Graph, dark: Boolean) {
    Perf.once("content_compose")
    val context = LocalContext.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val snackbar = remember { SnackbarHostState() }
    val locate = rememberLocateState(vm)

    var query by remember { mutableStateOf("") }
    var searchFocused by remember { mutableStateOf(false) }
    var aboutOpen by remember { mutableStateOf(false) }
    val searchFocus = remember { FocusRequester() }
    var sheetHeightPx by remember { mutableIntStateOf(0) }
    var topPx by remember { mutableIntStateOf(0) }

    val selected = vm.selected
    val filter = vm.filter

    // Auto-locate once for anyone who already allowed location.
    LaunchedEffect(Unit) {
        if (!vm.autoLocated) {
            vm.autoLocated = true
            locate.autoLocate()
        }
    }

    // Back peels the interface one layer at a time: dialog > search > drawer > sheet > filter > exit.
    BackHandler(enabled = searchFocused || drawerState.isOpen || selected != null || filter.isNotEmpty()) {
        when {
            searchFocused -> { focusManager.clearFocus(); query = "" }
            drawerState.isOpen -> scope.launch { drawerState.close() }
            selected != null -> vm.clearSelection()
            filter.isNotEmpty() -> vm.clearFilter()
        }
    }

    val notice = vm.notice
    LaunchedEffect(notice) {
        val n = notice ?: return@LaunchedEffect
        val text = when (n) {
            else -> context.getString(n.message)
        }
        val action = if (n is Notice.Settings) context.getString(R.string.open_settings) else null
        val r = snackbar.showSnackbar(text, actionLabel = action, withDismissAction = action == null, duration = SnackbarDuration.Long)
        if (r == SnackbarResult.ActionPerformed) openAppSettings(context)
        if (vm.notice == n) vm.notice = null
    }

    fun closeSearch() {
        focusManager.clearFocus()
        query = ""
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        // A swipe-to-open drawer steals every horizontal pan from the map; the menu button opens it.
        gesturesEnabled = drawerState.isOpen,
        drawerContent = {
            XarxaDrawer(
                themeMode = vm.themeMode,
                onTheme = vm::chooseTheme,
                onAbout = { scope.launch { drawerState.close() }; aboutOpen = true },
            )
        },
    ) {
        Box(Modifier.fillMaxSize()) {
            val now by produceState(System.currentTimeMillis()) {
                while (true) { value = System.currentTimeMillis(); delay(1000) }
            }
            val arrivals by g.store.arrivals.collectAsState()

            XarxaMap(
                modifier = Modifier.fillMaxSize(),
                dark = dark,
                linesGeoJson = g.linesGeoJson,
                stations = g.stations,
                lineColors = g.lineColors,
                filter = filter,
                selected = selected,
                userLocation = vm.userLocation,
                cameraRequest = vm.cameraRequest,
                topInsetPx = topPx,
                bottomInsetPx = if (selected != null) sheetHeightPx else 0,
                trains = {
                    val now = System.currentTimeMillis()
                    if (BuildConfig.PERF && vm.fakeTrains) FakeTrains.at(g, now, vm.fakeMany) else g.engine.livePositions(g.store.arrivals.value, now)
                },
                onStationTap = { st ->
                    if (searchFocused) closeSearch()
                    if (st != null) vm.selectStation(st) else vm.clearSelection()
                },
                contentDescription = stringResource(R.string.map_desc),
            )

            // Search pill, results, and line filter chips.
            Column(
                Modifier.statusBarsPadding().padding(top = 8.dp).onSizeChanged { topPx = it.height + with(density) { 8.dp.roundToPx() } },
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SearchPill(
                    query = query,
                    onQueryChange = { query = it },
                    onMenu = { focusManager.clearFocus(); scope.launch { drawerState.open() } },
                    onFocusChange = { searchFocused = it },
                    focusRequester = searchFocus,
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
                if (searchFocused) {
                    val results = remember(query, g) {
                        if (query.isBlank()) g.lines.map { SearchResult.LineHit(it) } else g.repo.search(query)
                    }
                    SearchResults(
                        results = results,
                        lineColors = g.lineColors,
                        onLine = { id -> vm.filterOnly(id); closeSearch() },
                        onStation = { st -> vm.selectStation(st); closeSearch() },
                        modifier = Modifier.padding(horizontal = 12.dp).heightIn(max = 380.dp),
                    )
                } else {
                    HubChips(
                        hubs = g.hubs,
                        lineColors = g.lineColors,
                        activeLines = filter,
                        selectedId = selected?.id,
                        onHub = vm::selectStation,
                        onClearLine = vm::toggleLine,
                    )
                }
            }

            // Bottom stack, one column above the sheet so nothing can overlap: locate button, walking box, snackbar.
            val sheetDp = with(density) { sheetHeightPx.toDp() }
            val liftDp by animateDpAsState(if (selected != null) sheetDp else 0.dp, label = "lift")
            Column(
                Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(bottom = liftDp)
                    .let { if (selected == null) it.windowInsetsPadding(WindowInsets.navigationBars) else it },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.fillMaxWidth().padding(end = 12.dp, bottom = 8.dp), contentAlignment = Alignment.CenterEnd) {
                    // 45 dp button (20% under the 56 dp default) inside a 48 dp touch target.
                    Box(Modifier.minimumInteractiveComponentSize(), contentAlignment = Alignment.Center) {
                        FloatingActionButton(
                            onClick = locate::onClick,
                            modifier = Modifier.size(45.dp),
                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        ) {
                            if (locate.locating) {
                                CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Filled.MyLocation, contentDescription = stringResource(R.string.locate_idle), modifier = Modifier.size(19.dp))
                            }
                        }
                    }
                }
                val walk = vm.walkTarget
                val user = vm.userLocation
                if (walk != null && user != null) {
                    LaunchedEffect(walk.id, vm.walkNonce) { delay(WALK_BANNER_MS); vm.dismissWalk() }
                    WalkBanner(
                        station = walk.name,
                        meters = com.jielei.xarxa.nativeapp.domain.GeoUtils.getDistance(
                            com.jielei.xarxa.nativeapp.data.LonLat(user.longitude, user.latitude),
                            com.jielei.xarxa.nativeapp.data.LonLat(walk.lon, walk.lat),
                        ),
                        dark = dark,
                        onDismiss = vm::dismissWalk,
                    )
                }
                SnackbarHost(snackbar)
                Spacer(Modifier.height(8.dp))
            }

            if (selected != null) {
                LaunchedEffect(selected.id) {
                    while (true) {
                        runCatching { g.store.refreshStation(selected) }
                        delay(61_000)
                    }
                }
            }
            AnimatedVisibility(
                visible = selected != null,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut(),
            ) {
                // Keep showing the last station while the exit animation runs.
                val shown = remember { mutableStateOf(selected) }
                if (selected != null) shown.value = selected
                val st = shown.value
                if (st != null) {
                    val focus = remember(st, now, arrivals) { g.engine.focusStation(st, g.store.cached(st, now), now) }
                    if (focus != null && focus.arrivals.isNotEmpty()) Perf.once("sheet_arrivals:${st.id}")
                    StationSheet(
                        station = st,
                        focus = focus,
                        lineColors = g.lineColors,
                        dark = dark,
                        onClose = vm::clearSelection,
                        modifier = Modifier.onSizeChanged { sheetHeightPx = it.height }
                            .semantics { contentDescription = st.name },
                    )
                }
            }
        }
    }

    if (aboutOpen) AboutDialog(onDismiss = { aboutOpen = false })
    LocationRationaleDialog(locate)
}

/** How long the floating walking box stays before it hides itself. */
private const val WALK_BANNER_MS = 6_000L
