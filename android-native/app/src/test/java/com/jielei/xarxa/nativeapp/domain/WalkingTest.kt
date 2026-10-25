package com.jielei.xarxa.nativeapp.domain

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test

class WalkingTest {
    @Test fun minutesRoundUpAndNeverDropBelowOne() {
        assertEquals(1, walkingMinutes(0.0))
        assertEquals(1, walkingMinutes(75.0))   // exactly 60 s
        assertEquals(2, walkingMinutes(76.0))   // 60.8 s rounds up
        assertEquals(5, walkingMinutes(316.0))  // 252.8 s
        assertEquals(27, walkingMinutes(2000.0)) // 1600 s = 26.7 min
    }

    @Test fun distanceUsesMetresBelowAKilometreAndKilometresAbove() {
        assertEquals("316 m", formatDistance(316.4))
        assertEquals("999 m", formatDistance(999.4))
        assertEquals("1.0 km", formatDistance(1000.0, Locale.US))
        assertEquals("1.2 km", formatDistance(1234.0, Locale.US))
        assertEquals("1,2 km", formatDistance(1234.0, Locale("es", "ES")))
    }
}

class WalkCategoryTest {
    @Test fun thresholdsMapToCategories() {
        assertEquals(WalkCategory.Short, walkCategory(1))
        assertEquals(WalkCategory.Short, walkCategory(5))
        assertEquals(WalkCategory.Medium, walkCategory(6))
        assertEquals(WalkCategory.Medium, walkCategory(15))
        assertEquals(WalkCategory.Long, walkCategory(16))
    }
}
