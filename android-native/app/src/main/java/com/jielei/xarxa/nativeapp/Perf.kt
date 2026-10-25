package com.jielei.xarxa.nativeapp

import android.os.Process
import android.os.SystemClock
import android.util.Log
import java.util.concurrent.ConcurrentHashMap

/**
 * Lightweight latency marks, milliseconds since process start, read from logcat tag XarxaPerf by tools/bench.sh.
 * Compiled to a no-op on release (BuildConfig.PERF false).
 */
object Perf {
    private val seen = ConcurrentHashMap.newKeySet<String>()

    fun mark(name: String) {
        if (!BuildConfig.PERF) return
        Log.i("XarxaPerf", "$name ${SystemClock.elapsedRealtime() - Process.getStartElapsedRealtime()}")
    }

    /** Marks only the first time [name] is seen in this process. */
    fun once(name: String) {
        if (!BuildConfig.PERF) return
        if (seen.add(name)) mark(name)
    }

    /** Forget a once-mark so a repeatable event (tap, locate) can be marked again. */
    fun reset(name: String) {
        if (BuildConfig.PERF) seen.remove(name)
    }

    fun info(msg: String) {
        if (BuildConfig.PERF) Log.i("XarxaPerf", msg)
    }

    // ---- render-thread frame intervals (MapLibre frames are not in gfxinfo) ----
    private var lastFrameNs = 0L
    private var windowStartNs = 0L
    private val intervals = ArrayList<Long>()

    /** Called per rendered map frame; logs "frames n=.. p50=.. p90=.. max=.. over16=.." every 2 s of activity. */
    fun frame() {
        if (!BuildConfig.PERF) return
        val now = System.nanoTime()
        if (lastFrameNs != 0L && now - lastFrameNs < 500_000_000L) intervals.add(now - lastFrameNs)
        lastFrameNs = now
        if (windowStartNs == 0L) windowStartNs = now
        if (now - windowStartNs >= 2_000_000_000L) {
            if (intervals.size >= 5) {
                val sorted = intervals.sorted()
                fun q(f: Double) = sorted[((sorted.size - 1) * f).toInt()] / 1e6
                val slow = sorted.count { it > 20_000_000L }
                Log.i("XarxaPerf", "frames n=${sorted.size} p50=%.1f p90=%.1f max=%.1f slow=$slow".format(java.util.Locale.ROOT, q(0.5), q(0.9), sorted.last() / 1e6))
            }
            intervals.clear(); windowStartNs = now
        }
    }
}
