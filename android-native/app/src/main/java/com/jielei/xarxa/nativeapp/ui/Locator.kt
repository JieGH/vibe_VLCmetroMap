package com.jielei.xarxa.nativeapp.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.os.SystemClock
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.cancelChildren
import com.jielei.xarxa.nativeapp.domain.Station
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import com.jielei.xarxa.nativeapp.Perf
import com.jielei.xarxa.nativeapp.R
import com.jielei.xarxa.nativeapp.domain.MAX_USABLE_ACCURACY_M
import com.jielei.xarxa.nativeapp.domain.NEAREST_STATION_RANGE_M
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

class LocateState(
    private val context: Context,
    private val vm: MainViewModel,
    private val scope: CoroutineScope,
    private val requestPermission: () -> Unit,
) {
    var locating by mutableStateOf(false)
        private set
    var showRationale by mutableStateOf(false)

    private fun granted() =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** FAB tap: rationale first if not yet allowed, otherwise locate. */
    fun onClick() {
        if (locating) return
        if (granted()) locate() else showRationale = true
    }

    /** Launch-time locate for anyone who already allowed location. Silent otherwise. */
    fun autoLocate() {
        if (granted() && !locating) locate()
    }

    fun onRationaleContinue() {
        showRationale = false
        requestPermission()
    }

    fun onRationaleDecline() {
        showRationale = false
        vm.notice = Notice.Plain(R.string.locate_declined)
    }

    fun onPermissionResult(ok: Boolean) {
        if (ok) locate() else vm.notice = Notice.Settings(R.string.locate_denied)
    }

    private var job: Job? = null

    /**
     * First usable fix paints at once (dot, nearest Station, camera); a clearly tighter fix inside the next few
     * seconds only nudges the dot and, if it changes the nearest Station, swaps the selection the locate made.
     */
    private fun locate() {
        val g = vm.graph ?: return
        locating = true
        Perf.mark("locate_start")
        job?.cancel()
        job = scope.launch {
            val started = SystemClock.elapsedRealtime()
            var applied = false
            var imprecise = false
            var autoSelected: Station? = null
            try {
                coroutineScope {
                    val firstFix = CompletableDeferred<Unit>()
                    val collector = launch {
                        FastLocation.fixes(context).collect { fix ->
                            if (fix.hasAccuracy() && fix.accuracy > MAX_USABLE_ACCURACY_M) { imprecise = true; return@collect }
                            val nearest = g.repo.nearest(fix.latitude, fix.longitude)
                            if (!applied) {
                                applied = true
                                locating = false
                                vm.showUser(fix.latitude, fix.longitude)
                                Perf.mark("user_dot")
                                if (nearest == null || nearest.distanceMeters > NEAREST_STATION_RANGE_M) {
                                    vm.notice = Notice.Plain(R.string.locate_out_of_range)
                                } else {
                                    Perf.reset("sheet_arrivals:${nearest.station.id}")
                                    vm.selectStation(nearest.station)
                                    autoSelected = nearest.station
                                    Perf.mark("locate_nearest:${nearest.station.id}")
                                }
                                firstFix.complete(Unit)
                            } else {
                                vm.updateUser(fix.latitude, fix.longitude)
                                if (nearest != null && nearest.distanceMeters <= NEAREST_STATION_RANGE_M &&
                                    vm.selected == autoSelected && nearest.station.id != autoSelected?.id
                                ) {
                                    vm.selectStation(nearest.station)
                                    autoSelected = nearest.station
                                }
                            }
                        }
                    }
                    launch { firstFix.await(); delay(REFINE_MS); collector.cancel() }
                    launch { delay(FastLocation.FIX_TIMEOUT_MS - (SystemClock.elapsedRealtime() - started)); collector.cancel() }
                    collector.join()
                    coroutineContext.cancelChildren()
                }
            } finally {
                locating = false
                if (!applied) vm.notice = Notice.Plain(if (imprecise) R.string.locate_imprecise else R.string.locate_timeout)
            }
        }
    }
}

private const val REFINE_MS = 6_000L

@Composable
fun rememberLocateState(vm: MainViewModel): LocateState {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var holder by remember { mutableStateOf<LocateState?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        holder?.onPermissionResult(res.values.any { it })
    }
    val state = remember {
        LocateState(context, vm, scope) {
            launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }.also { holder = it }
    }
    return state
}

@Composable
fun LocationRationaleDialog(state: LocateState) {
    if (!state.showRationale) return
    AlertDialog(
        onDismissRequest = state::onRationaleDecline,
        title = { Text(stringResource(R.string.rationale_title)) },
        text = { Text(stringResource(R.string.rationale_body)) },
        confirmButton = { TextButton(onClick = state::onRationaleContinue) { Text(stringResource(R.string.rationale_allow)) } },
        dismissButton = { TextButton(onClick = state::onRationaleDecline) { Text(stringResource(R.string.rationale_decline)) } },
    )
}

fun openAppSettings(context: Context) {
    context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
}
