package com.jielei.xarxa.nativeapp.ui

import com.jielei.xarxa.nativeapp.domain.TrainPosition

/**
 * Debug/bench builds only (`am start --ez fakeTrains true`): one marker per Line parked on a Station and drifting
 * north-east at about 12 m/s, so marker sizing, typography and smooth motion can be checked when the real
 * service is not running (night) or the feed is down. Never reachable from a release build.
 */
object FakeTrains {
    /** [many]: also one marker per other Station (about 140 in all), the load of a busy day. */
    fun at(g: Graph, nowMs: Long, many: Boolean = false): List<TrainPosition> {
        val names = listOf("1" to "Colón", "3" to "Colón", "5" to "Xàtiva", "7" to "Alameda", "9" to "Àngel Guimerà", "10" to "Alacant", "4" to "Pl. Espanya")
        val t = (nowMs % 3_600_000L) / 1000.0
        val extra = if (many) g.stations.filter { it.lines.isNotEmpty() }.map { it.lines.first() to it.name } else emptyList()
        return (names + extra).mapIndexedNotNull { i, (line, name) ->
            val st = g.stations.firstOrNull { it.name == name } ?: return@mapIndexedNotNull null
            TrainPosition(
                id = "fake-$line-$i", line = line, vehicleId = null,
                lat = st.lat + 0.00011 * 0.6 * t % 0.004, lon = st.lon + 0.00011 * 0.8 * t % 0.004, bearing = 53.0,
                confidence = 1.0, simulated = false, isLive = true, isForward = true, isDeadReckoned = false,
                distanceAlongTrack = 0.0, destination = name, status = null, targetStation = name,
                secondsToTarget = 30, uncertaintyMeters = 0, secondsUnheard = 0, sightingCount = 1,
            )
        }
    }
}
