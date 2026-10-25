package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.data.LonLat

/**
 * Which Stations of a filtered Line appear at which zoom, major first. Rank 0 is the major set: the ends of the
 * Line and every interchange; ranks 1 and 2 then fill in the gaps, always the Station farthest from those already
 * shown, so each level spreads evenly along the Line and branch ends come early.
 */
object LineReveal {
    const val MAJOR = 0
    const val MID = 1
    const val MINOR = 2

    fun ranks(stations: List<Station>, filter: Set<String>): Map<String, Int> {
        val on = stations.filter { st -> st.lines.any { it in filter } }
        if (on.size <= 2) return on.associate { it.id to MAJOR }
        fun d(a: Station, b: Station) = GeoUtils.getDistance(LonLat(a.lon, a.lat), LonLat(b.lon, b.lat))

        val major = LinkedHashSet<Station>()
        for (line in filter) {
            val s = on.filter { line in it.lines }
            if (s.size < 2) { major += s; continue }
            var best = s[0] to s[1]; var bd = -1.0
            for (i in s.indices) for (j in i + 1 until s.size) d(s[i], s[j]).let { if (it > bd) { bd = it; best = s[i] to s[j] } }
            major += best.first; major += best.second
        }
        major += on.filter { it.lines.size > 1 }

        val out = HashMap<String, Int>()
        major.forEach { out[it.id] = MAJOR }
        val shown = major.toMutableList()
        val rest = on.filter { it.id !in out }.toMutableList()
        val firstHalf = (rest.size + 1) / 2
        var picked = 0
        while (rest.isNotEmpty()) {
            val next = rest.maxByOrNull { c -> shown.minOf { d(c, it) } }!!
            rest.remove(next); shown += next
            out[next.id] = if (picked++ < firstHalf) MID else MINOR
        }
        return out
    }
}
