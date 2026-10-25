package com.jielei.xarxa.nativeapp

import android.content.Intent
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Real multi-touch on the map: pinch open/close, pan and fling, double-tap zoom. The app logs
 * "camera idle zoom=.. lat=.. lon=.." (XarxaPerf) in debug/bench builds; this reads it back.
 */
class MapGestureTest {
    private val inst = InstrumentationRegistry.getInstrumentation()
    private val device = UiDevice.getInstance(inst)

    private data class Cam(val zoom: Double, val lat: Double, val lon: Double)

    private fun lastCam(): Cam? {
        val out = device.executeShellCommand("logcat -d -s XarxaPerf:I")
        val m = Regex("camera idle zoom=([\\d.,]+) lat=([-\\d.,]+) lon=([-\\d.,]+)").findAll(out).lastOrNull() ?: return null
        fun d(s: String) = s.replace(',', '.').toDouble()
        return Cam(d(m.groupValues[1]), d(m.groupValues[2]), d(m.groupValues[3]))
    }

    @Test
    fun pinchPanAndZoomBehaveLikeANativeMap() {
        device.wakeUp()
        device.executeShellCommand("logcat -c")
        val ctx = inst.targetContext
        ctx.startActivity(ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK))
        val map = device.wait(Until.findObject(By.pkg(ctx.packageName).desc(ctx.getString(R.string.map_desc))), 15000)
        assertTrue("map view not found", map != null)
        Thread.sleep(6000) // let auto-locate and its camera ease settle
        // Dismiss any sheet by tapping nothing; keep the camera where it is now.
        device.executeShellCommand("logcat -c")
        val b = map!!.visibleBounds
        val cx = b.centerX(); val cy = b.centerY()
        map.setGestureMargins(b.width() / 5, b.height() / 4, b.width() / 5, b.height() / 2) // keep fingers on bare map, clear of search, chips, edge gestures and the sheet
        device.click(b.right - 40, b.top + b.height() / 2) // tap empty-ish map: no sheet movement expected to matter
        Thread.sleep(1500)
        val base = lastCam()
        map.pinchOpen(0.5f, 600); Thread.sleep(1500)
        val opened = lastCam()
        map.pinchClose(0.5f, 600); Thread.sleep(1500)
        val closed = lastCam()
        device.drag(cx - 300, cy, cx + 300, cy, 30); Thread.sleep(1500)
        val panned = lastCam()
        device.swipe(cx + 300, cy, cx - 300, cy, 8); Thread.sleep(2500)
        val flung = lastCam()
        println("GESTURE base=$base opened=$opened closed=$closed panned=$panned flung=$flung")
        android.util.Log.i("GestureTest", "base=$base opened=$opened closed=$closed panned=$panned flung=$flung")
        assertTrue("pinch open must zoom in: $base -> $opened", opened != null && base != null && opened.zoom > base.zoom + 0.3)
        assertTrue("pinch close must zoom out: $opened -> $closed", closed != null && closed.zoom < opened!!.zoom - 0.3)
        assertTrue("pan must move the camera: $closed -> $panned", panned != null && Math.abs(panned.lon - closed!!.lon) > 1e-4)
        assertTrue("camera must not snap back after pan: $panned -> $flung", flung != null && flung.lon != panned!!.lon)
    }
}
