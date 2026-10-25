package com.jielei.xarxa.nativeapp.map

/** Pure camera rules, kept out of the MapView wrapper so they can be unit tested. */
object CameraPlan {
    /** How many zoom levels closing a Station sheet pulls back. */
    const val ZOOM_OUT_LEVELS = 2.0
    /** Duration of every programmatic camera move. */
    const val EASE_MS = 400

    /**
     * Where the camera zooms to when the sheet closes: two levels wider than now, but never wider than the
     * launch overview and never closer than it already is.
     */
    fun zoomOutTarget(currentZoom: Double, overviewZoom: Double = DEFAULT_ZOOM): Double =
        if (currentZoom <= overviewZoom) currentZoom else maxOf(overviewZoom, currentZoom - ZOOM_OUT_LEVELS)
}
