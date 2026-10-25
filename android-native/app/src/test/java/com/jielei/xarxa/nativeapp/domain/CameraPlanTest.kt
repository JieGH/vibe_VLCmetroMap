package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.map.CameraPlan
import com.jielei.xarxa.nativeapp.map.DEFAULT_ZOOM
import org.junit.Assert.assertEquals
import org.junit.Test

class CameraPlanTest {
    @Test fun closingTheSheetPullsBackTwoLevelsButNotBeyondTheOverview() {
        assertEquals(14.6 - 2.0, CameraPlan.zoomOutTarget(14.6), 1e-9)
        assertEquals(DEFAULT_ZOOM, CameraPlan.zoomOutTarget(13.0), 1e-9)   // 11 would be wider than the overview
        assertEquals(17.0 - 2.0, CameraPlan.zoomOutTarget(17.0), 1e-9)
    }

    @Test fun neverZoomsInWhenAlreadyWide() {
        assertEquals(11.0, CameraPlan.zoomOutTarget(11.0), 1e-9)
        assertEquals(DEFAULT_ZOOM, CameraPlan.zoomOutTarget(DEFAULT_ZOOM), 1e-9)
    }
}
