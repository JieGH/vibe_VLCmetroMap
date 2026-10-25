package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.data.LonLat
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt

/** Port of src/utils/geoUtils.js. Points are [LonLat] (GeoJSON order). */
object GeoUtils {
    /** Haversine distance in metres. Same operation order as the JS getDistance. */
    fun getDistance(p1: LonLat, p2: LonLat): Double {
        val r = 6371000.0
        val dLat = ((p2.lat - p1.lat) * Math.PI) / 180
        val dLon = ((p2.lon - p1.lon) * Math.PI) / 180
        val lat1 = (p1.lat * Math.PI) / 180
        val lat2 = (p2.lat * Math.PI) / 180
        val a = sin(dLat / 2) * sin(dLat / 2) +
            sin(dLon / 2) * sin(dLon / 2) * cos(lat1) * cos(lat2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
    }

    /** Point at progress t (0..1) along the polyline. */
    fun interpolatePath(coords: List<LonLat>, t: Double): LonLat {
        if (coords.isEmpty()) return LonLat(0.0, 0.0)
        if (coords.size == 1) return coords[0]

        val progress = maxOf(0.0, minOf(1.0, t))
        val cumulative = ArrayList<Double>(coords.size)
        cumulative.add(0.0)
        var total = 0.0
        for (i in 0 until coords.size - 1) {
            total += getDistance(coords[i], coords[i + 1])
            cumulative.add(total)
        }
        if (total == 0.0) return coords[0]

        val targetDist = progress * total
        var low = 0
        var high = cumulative.size - 1
        while (low <= high) {
            val mid = (low + high) shr 1
            if (cumulative[mid] <= targetDist) low = mid + 1 else high = mid - 1
        }
        val idx = maxOf(0, high)
        if (idx >= coords.size - 1) return coords[coords.size - 1]

        val segStart = cumulative[idx]
        val segLen = cumulative[idx + 1] - segStart
        val segProgress = if (segLen > 0) (targetDist - segStart) / segLen else 0.0
        val p1 = coords[idx]
        val p2 = coords[idx + 1]
        return LonLat(p1.lon + (p2.lon - p1.lon) * segProgress, p1.lat + (p2.lat - p1.lat) * segProgress)
    }

    data class OnPath(val coordinates: LonLat, val distance: Double)

    /** The point on a polyline closest to [point], via a local flat projection. Null for an empty path. */
    fun nearestPointOnPath(coords: List<LonLat>, point: LonLat?): OnPath? {
        if (coords.isEmpty() || point == null) return null
        if (coords.size == 1) return OnPath(coords[0], getDistance(point, coords[0]))

        val metresPerLon = cos((point.lat * Math.PI) / 180) * 111320
        val metresPerLat = 110540.0
        fun lx(c: LonLat) = (c.lon - point.lon) * metresPerLon
        fun ly(c: LonLat) = (c.lat - point.lat) * metresPerLat

        var best: OnPath? = null
        for (i in 0 until coords.size - 1) {
            val ax = lx(coords[i]); val ay = ly(coords[i])
            val bx = lx(coords[i + 1]); val by = ly(coords[i + 1])
            val dx = bx - ax
            val dy = by - ay
            val lengthSquared = dx * dx + dy * dy
            val t = if (lengthSquared == 0.0) 0.0
            else maxOf(0.0, minOf(1.0, (-ax * dx - ay * dy) / lengthSquared))
            val cx = ax + dx * t
            val cy = ay + dy * t
            val distance = hypot(cx, cy)
            val b = best
            if (b == null || distance < b.distance) {
                best = OnPath(LonLat(point.lon + cx / metresPerLon, point.lat + cy / metresPerLat), distance)
            }
        }
        return best
    }

    /** The stretches of [path] further than [toleranceMetres] from [reference], extended one vertex each end. */
    fun pathsOffReference(path: List<LonLat>, reference: List<LonLat>, toleranceMetres: Double): List<List<LonLat>> {
        if (path.size < 2 || reference.isEmpty()) return emptyList()
        val off = path.map { nearestPointOnPath(reference, it)!!.distance > toleranceMetres }
        val runs = ArrayList<List<LonLat>>()
        var start = -1
        for (i in 0..path.size) {
            if (i < path.size && off[i]) {
                if (start < 0) start = i
            } else if (start >= 0) {
                runs.add(path.subList(maxOf(0, start - 1), minOf(path.size, i + 1)).toList())
                start = -1
            }
        }
        return runs.filter { it.size >= 2 }
    }

    data class Nearest<T>(val item: T, val distance: Double)

    /** The item nearest [at], whatever the distance (the caller applies its own threshold). */
    fun <T> nearestFeature(items: List<T>, at: LonLat?, location: (T) -> LonLat): Nearest<T>? {
        if (items.isEmpty() || at == null) return null
        var best: Nearest<T>? = null
        for (item in items) {
            val d = getDistance(at, location(item))
            val b = best
            if (b == null || d < b.distance) best = Nearest(item, d)
        }
        return best
    }
}
