package com.jielei.xarxa.nativeapp.ui

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.SystemClock
import androidx.core.location.LocationManagerCompat
import androidx.core.os.CancellationSignal
import com.jielei.xarxa.nativeapp.Perf
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.util.concurrent.Executor

/**
 * Fast first fix, then refinement. Mirrors userLocation.js: a fix up to [FIX_MAX_AGE_MS] old is reused as is
 * (FIX_MAX_AGE_MS), and a fresh one is given [FIX_TIMEOUT_MS] before it is declared lost.
 *
 * Every enabled provider (fused where the platform has it, network, GPS) is asked at once and the passive
 * last-known positions are read first, so the first emission is whatever arrives first, not what the most
 * precise provider eventually produces. Later emissions only come when they are clearly more accurate.
 */
object FastLocation {
    const val FIX_MAX_AGE_MS = 30_000L
    const val FIX_TIMEOUT_MS = 10_000L
    private const val REFINE_WINDOW_MS = 6_000L

    private fun ageMs(l: Location) = (SystemClock.elapsedRealtimeNanos() - l.elapsedRealtimeNanos) / 1_000_000L

    @SuppressLint("MissingPermission")
    fun fixes(context: Context): Flow<Location> = callbackFlow {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val wanted = buildList {
            if (Build.VERSION.SDK_INT >= 31) add(LocationManager.FUSED_PROVIDER)
            add(LocationManager.NETWORK_PROVIDER)
            add(LocationManager.GPS_PROVIDER)
        }.filter { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }

        Perf.info("providers wanted=$wanted")
        val started = SystemClock.elapsedRealtime()
        var best: Location? = null
        fun offer(l: Location) {
            Perf.info("fix provider=${l.provider} acc=${if (l.hasAccuracy()) l.accuracy else -1f} age=${ageMs(l)}ms")
            val b = best
            val now = SystemClock.elapsedRealtime()
            // After the first fix, only a clearly tighter one inside the refine window is worth a second paint.
            if (b != null && (now - started > REFINE_WINDOW_MS || !l.hasAccuracy() || (b.hasAccuracy() && l.accuracy > b.accuracy * 0.8f))) return
            best = l
            trySend(l)
        }

        // 1. Recent last-known fixes, newest first: instant, no radio.
        (wanted + LocationManager.PASSIVE_PROVIDER)
            .mapNotNull { p -> runCatching { lm.getLastKnownLocation(p) }.getOrNull() }
            .filter { ageMs(it) <= FIX_MAX_AGE_MS }
            .minByOrNull { ageMs(it) }
            ?.let { offer(it) }

        // 2. A fresh fix from every provider in parallel.
        val signal = CancellationSignal()
        val direct = Executor { it.run() }
        for (p in wanted) {
            runCatching {
                LocationManagerCompat.getCurrentLocation(lm, p, signal, direct) { l -> if (l != null) offer(l) else Perf.info("fix provider=$p null") }
            }
        }
        awaitClose { signal.cancel() }
    }
}
