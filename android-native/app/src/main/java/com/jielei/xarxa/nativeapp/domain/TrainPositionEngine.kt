package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.data.FgvSegment
import com.jielei.xarxa.nativeapp.data.LonLat
import com.jielei.xarxa.nativeapp.data.NetworkData
import com.jielei.xarxa.nativeapp.data.StationProperties
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** A Station projected onto one Line's track (one entry of a Station Chain). */
internal class TrackStation(
    val id: String,
    val stopId: String?,
    val name: String,
    val coords: LonLat,
    val trackDist: Double,
    val offTrackMetres: Double,
)

internal class LineTrack(
    val coords: List<LonLat>,
    val cumDists: DoubleArray,
    val totalLength: Double,
    val segments: Map<String, Double>,
    val fgvSegments: Map<String, FgvSegment>,
    val fallbackSpeed: Double,
    val minSegmentSeconds: Double,
)

internal class Located(val station: TrackStation, val isForward: Boolean)

internal class Walk(
    val trackDist: Double,
    val status: String,
    val nextStation: TrackStation?,
    val segmentsWalked: Double,
    val isDeadReckoned: Boolean,
    val metresPerSecond: Double,
)

internal class Sighting(
    val station: TrackStation?,
    val returnStation: TrackStation?,
    val secondsRemaining: Double,
    val fetchedAt: Double,
)

internal class TrainSightings(
    val key: String,
    val lineId: String,
    val vehicleId: String?,
    val destination: String,
    val sightings: MutableList<Sighting> = ArrayList(),
)

internal class Placed(val anchor: Sighting, val isForward: Boolean, val count: Int)

internal class Vehicle(
    val id: String,
    val line: String,
    val vehicleId: String?,
    val direction: String,
    val lon: Double,
    val lat: Double,
    val bearing: Double,
    val distanceAlongTrack: Double,
    val isForward: Boolean,
    val isLive: Boolean,
    val isSimulated: Boolean,
    val status: String?,
    val sightingCount: Int,
    val positionUncertaintyMetres: Int,
    val positionConfidence: Double,
    val isDeadReckoned: Boolean,
    val runningSpeed: Double,
    val secondsUnheard: Int,
    val targetStation: String,
    val secondsToTarget: Int,
) {
    fun at(lon: Double, lat: Double, bearing: Double, dist: Double) =
        Vehicle(
            id, line, vehicleId, direction, lon, lat, bearing, dist, isForward, isLive, isSimulated, status,
            sightingCount, positionUncertaintyMetres, positionConfidence, isDeadReckoned, runningSpeed,
            secondsUnheard, targetStation, secondsToTarget,
        )
}

private class RenderState(val trackDist: Double, val isForward: Boolean, val at: Double)

/**
 * Train Position Engine: port of src/services/trainPositionEngine.js. Same constants, same order of
 * floating-point operations. Not thread-safe by itself; [positions] is synchronized because it keeps
 * per-vehicle render state.
 */
class TrainPositionEngine(networkData: NetworkData) {
    private val segmentTimes = networkData.segmentTimes
    private val fgvSegmentTimes = networkData.segmentTimesFgv
    private val dwellSeconds = segmentTimes.dwellSeconds
    private val fgvDwellSeconds = fgvSegmentTimes.dwellSeconds

    private val lineTracks = HashMap<String, LineTrack>()
    private val lineStations = HashMap<String, List<TrackStation>>()
    private val returnLines = HashSet<String>()
    private val renderState = LinkedHashMap<String, RenderState>()
    internal val offTrackStations = ArrayList<Triple<String, String, Long>>()

    private val resyncForwardMetres = RESYNC_FORWARD_METRES
    private val resyncBackwardMetres = RESYNC_BACKWARD_METRES

    init {
        val allStationPoints = networkData.gtfs.features.filter { it.geometry.type == "Point" }
        val stationProps = allStationPoints.map {
            NetworkData.json.decodeFromJsonElement(StationProperties.serializer(), it.properties) to it.geometry.point()!!
        }

        for (l in 1..10) {
            val lineId = l.toString()
            val feature = networkData.metroLines.features.firstOrNull {
                it.properties["line"]?.let { v -> (v as kotlinx.serialization.json.JsonPrimitive).content } == lineId &&
                    it.geometry.type == "LineString"
            } ?: continue
            val coords = feature.geometry.line()
            if (coords.size < 2) continue

            val cum = DoubleArray(coords.size)
            for (i in 1 until coords.size) cum[i] = cum[i - 1] + haversineDistance(coords[i - 1], coords[i])
            val totalLength = if (cum.last() != 0.0) cum.last() else 1.0

            val timing = segmentTimes.lines[lineId]
            val fb = timing?.fallback ?: segmentTimes.networkFallback!!
            lineTracks[lineId] = LineTrack(
                coords = coords,
                cumDists = cum,
                totalLength = totalLength,
                segments = timing?.segments ?: emptyMap(),
                fgvSegments = fgvSegmentTimes.lines[lineId]?.segments ?: emptyMap(),
                fallbackSpeed = fb.metresPerSecond,
                minSegmentSeconds = fb.minSeconds ?: (dwellSeconds + 15),
            )

            val stationsForLine = stationProps.filter { (p, _) -> p.lines.contains(lineId) }
            val projectedStations = stationsForLine.map { (p, pt) ->
                val proj = projectPointOntoPolyline(pt, coords, cum)
                TrackStation(
                    id = p.id ?: "", stopId = p.stopId, name = p.name, coords = pt,
                    trackDist = proj.first, offTrackMetres = proj.second,
                )
            }
            for (st in projectedStations) {
                if (st.offTrackMetres > MAX_STATION_OFFSET_METRES) {
                    offTrackStations.add(Triple(lineId, st.name, Math.round(st.offTrackMetres)))
                }
            }

            val onTrack = projectedStations.filter { it.offTrackMetres <= MAX_STATION_OFFSET_METRES }
            val returnCoords = networkData.returnTracks.lines[lineId]?.path()
            val served = networkData.directionStations.lines[lineId]

            if (returnCoords == null || served == null) {
                lineStations[lineId] = onTrack.sortedBy { it.trackDist }
                continue
            }

            val outbound = served.forward.toSet()
            val inbound = served.reverse.toSet()
            lineStations[lineId] = onTrack.filter { it.stopId in outbound }.sortedBy { it.trackDist }

            val returnCum = DoubleArray(returnCoords.size)
            for (i in 1 until returnCoords.size) {
                returnCum[i] = returnCum[i - 1] + haversineDistance(returnCoords[i - 1], returnCoords[i])
            }
            returnLines.add(lineId)
            val base = lineTracks[lineId]!!
            lineTracks["$lineId:return"] = LineTrack(
                coords = returnCoords,
                cumDists = returnCum,
                totalLength = if (returnCum.last() != 0.0) returnCum.last() else 1.0,
                segments = base.segments,
                fgvSegments = base.fgvSegments,
                fallbackSpeed = base.fallbackSpeed,
                minSegmentSeconds = base.minSegmentSeconds,
            )
            lineStations["$lineId:return"] = stationsForLine
                .filter { (p, _) -> p.stopId in inbound }
                .map { (p, pt) ->
                    val proj = projectPointOntoPolyline(pt, returnCoords, returnCum)
                    TrackStation(
                        id = p.id ?: "", stopId = p.stopId, name = p.name, coords = pt,
                        trackDist = proj.first, offTrackMetres = proj.second,
                    )
                }
                .filter { it.offTrackMetres <= MAX_STATION_OFFSET_METRES }
                .sortedBy { it.trackDist }
        }
    }

    internal fun hasReturnTrack(lineId: String) = returnLines.contains(lineId)

    private fun chainKey(lineId: String, isForward: Boolean) =
        if (!isForward && returnLines.contains(lineId)) "$lineId:return" else lineId

    internal fun getLineTrack(lineId: String, isForward: Boolean = true) = lineTracks[chainKey(lineId, isForward)]

    internal fun getLineStations(lineId: String, isForward: Boolean = true): List<TrackStation> =
        lineStations[chainKey(lineId, isForward)] ?: emptyList()

    /** The Station a train reaches after [stationName] on [lineId] heading [isForward], or null at the end of the line. */
    fun stationAfter(lineId: String, stationName: String, isForward: Boolean): String? {
        val chain = getLineStations(lineId, isForward)
        val here = findStation(lineId, stationName, isForward) ?: return null
        val i = chain.indexOfFirst { it.id == here.id }
        return chain.getOrNull(i + if (isForward) 1 else -1)?.name
    }

    // ---- segment timing ----

    internal fun getSegmentTiming(lineId: String, from: TrackStation, to: TrackStation): Pair<Double, Double> {
        val stated = getStatedSegmentTiming(lineId, from, to)
        val track = getLineTrack(lineId)
        val ceiling = if (track != null) {
            minOf(
                MAX_RUNNING_METRES_PER_SECOND,
                maxOf(MIN_RUNNING_CEILING_METRES_PER_SECOND, RUNNING_CEILING_SPEED_FACTOR * track.fallbackSpeed),
            )
        } else MAX_RUNNING_METRES_PER_SECOND
        val minRunning = Math.abs(to.trackDist - from.trackDist) / ceiling
        if (stated.first - stated.second >= minRunning) return stated

        val dwell = minOf(stated.second, maxOf(dwellSeconds, stated.first - minRunning))
        return Pair(maxOf(stated.first, dwell + minRunning), dwell)
    }

    /** (seconds, dwell) as the sources state them. */
    private fun getStatedSegmentTiming(lineId: String, from: TrackStation, to: TrackStation): Pair<Double, Double> {
        val track = getLineTrack(lineId) ?: return Pair(dwellSeconds + 60, dwellSeconds)

        if (from.stopId != null && to.stopId != null && from.stopId.isNotEmpty() && to.stopId.isNotEmpty()) {
            val measured = track.fgvSegments["${from.stopId}>${to.stopId}"] ?: track.fgvSegments["${to.stopId}>${from.stopId}"]
            if (measured != null) return Pair(measured.seconds, fgvDwellSeconds)

            val timetabled = track.segments["${from.stopId}>${to.stopId}"] ?: track.segments["${to.stopId}>${from.stopId}"]
            if (timetabled != null && timetabled != 0.0) return Pair(timetabled, dwellSeconds)
        }

        val metres = Math.abs(to.trackDist - from.trackDist)
        return Pair(
            maxOf(track.minSegmentSeconds, Math.round(metres / track.fallbackSpeed).toDouble()),
            dwellSeconds,
        )
    }

    internal fun getSegmentSeconds(lineId: String, from: TrackStation, to: TrackStation) =
        getSegmentTiming(lineId, from, to).first

    // ---- geometry ----

    internal fun getCoordsAndBearingAtDistance(lineId: String, distanceMeters: Double, isForward: Boolean = true): Pair<LonLat, Double> {
        val track = getLineTrack(lineId, isForward) ?: return Pair(LonLat(0.0, 0.0), 0.0)

        val dist = maxOf(0.0, minOf(track.totalLength, distanceMeters))
        val coords = track.coords
        val cum = track.cumDists

        var low = 0
        var high = cum.size - 1
        while (low <= high) {
            val mid = (low + high) shr 1
            if (cum[mid] <= dist) low = mid + 1 else high = mid - 1
        }
        val idx = maxOf(0, minOf(coords.size - 2, high))
        val segStart = cum[idx]
        val segEnd = cum[idx + 1]
        val segLen = segEnd - segStart
        val t = if (segLen > 0) (dist - segStart) / segLen else 0.0

        val p1 = coords[idx]
        val p2 = coords[idx + 1]
        val lng = p1.lon + t * (p2.lon - p1.lon)
        val lat = p1.lat + t * (p2.lat - p1.lat)

        val dx = if (isForward) (p2.lon - p1.lon) else (p1.lon - p2.lon)
        val dy = if (isForward) (p2.lat - p1.lat) else (p1.lat - p2.lat)
        val rad = atan2(dx, dy)
        val bearing = (rad * 180 / PI + 360) % 360

        return Pair(LonLat(lng, lat), bearing)
    }

    // ---- stations / direction ----

    private fun normalise(value: String?) = (value ?: "").lowercase().trim()

    internal fun findStation(lineId: String, stationName: String?, isForward: Boolean = true): TrackStation? {
        val stations = getLineStations(lineId, isForward)
        val target = normalise(stationName)
        if (target.isEmpty()) return null

        stations.firstOrNull { normalise(it.name) == target }?.let { return it }
        return stations.firstOrNull { normalise(it.name).contains(target) || target.contains(normalise(it.name)) }
    }

    internal fun resolveDirection(lineId: String, destination: String?, target: TrackStation?, returnTarget: TrackStation? = null): Boolean {
        val stations = getLineStations(lineId)

        if (hasReturnTrack(lineId)) {
            if (target != null && returnTarget == null) return true
            if (returnTarget != null && target == null) return false

            val evidence = ArrayList<Boolean>()
            val outDest = findStation(lineId, destination, true)
            if (outDest != null && target != null && outDest.trackDist != target.trackDist) {
                evidence.add(outDest.trackDist > target.trackDist)
            }
            val backDest = findStation(lineId, destination, false)
            if (backDest != null && returnTarget != null && backDest.trackDist != returnTarget.trackDist) {
                evidence.add(backDest.trackDist > returnTarget.trackDist)
            }
            if (evidence.isNotEmpty() && evidence.all { it == evidence[0] }) return evidence[0]
        }

        if (stations.size < 2 || target == null) return true

        val dest = findStation(lineId, destination)
        if (dest != null && dest.trackDist != target.trackDist && !hasReturnTrack(lineId)) {
            return dest.trackDist > target.trackDist
        }

        val normDest = normalise(destination)
        val firstStop = stations[0]
        val lastStop = stations[stations.size - 1]
        if (normDest.isNotEmpty() && normalise(firstStop.name).startsWith(normDest.take(4))) return false
        if (normDest.isNotEmpty() && normalise(lastStop.name).startsWith(normDest.take(4))) return true

        return true
    }

    internal fun locateArrival(lineId: String, stationName: String?, destination: String?): Located? {
        val outbound = findStation(lineId, stationName, true)
        if (!hasReturnTrack(lineId)) {
            if (outbound == null) return null
            return Located(outbound, resolveDirection(lineId, destination, outbound))
        }
        val inbound = findStation(lineId, stationName, false)
        if (outbound == null && inbound == null) return null
        val isForward = resolveDirection(lineId, destination, outbound, inbound)
        return Located((if (isForward) outbound else inbound)!!, isForward)
    }

    // ---- the Timetable Walk ----

    internal fun walkFromStation(lineId: String, target: TrackStation?, secondsToTarget: Double, isForward: Boolean): Walk? {
        val track = getLineTrack(lineId, isForward)
        val stations = getLineStations(lineId, isForward)
        if (track == null || target == null) return null

        val targetIndex = stations.indexOfFirst { it.id == target.id }
        if (targetIndex < 0) return null

        val stepBack = if (isForward) -1 else 1
        var segmentsWalked = 0.0

        if (secondsToTarget <= 0) {
            return Walk(
                trackDist = target.trackDist,
                status = "At Platform",
                nextStation = target,
                segmentsWalked = segmentsWalked,
                isDeadReckoned = -secondsToTarget > dwellSeconds,
                metresPerSecond = track.fallbackSpeed,
            )
        }

        var remaining = secondsToTarget
        var arrivalIndex = targetIndex

        while (true) {
            val departureIndex = arrivalIndex + stepBack
            if (departureIndex < 0 || departureIndex >= stations.size) {
                return Walk(
                    trackDist = stations[arrivalIndex].trackDist,
                    status = "At Terminus",
                    nextStation = stations[targetIndex],
                    segmentsWalked = segmentsWalked,
                    isDeadReckoned = false,
                    metresPerSecond = track.fallbackSpeed,
                )
            }

            val departure = stations[departureIndex]
            val arrival = stations[arrivalIndex]
            val (timingSeconds, timingDwell) = getSegmentTiming(lineId, departure, arrival)
            val running = maxOf(1.0, timingSeconds - timingDwell)
            val metresPerSecond = Math.abs(arrival.trackDist - departure.trackDist) / running

            if (remaining <= running) {
                val progress = 1 - remaining / running
                return Walk(
                    trackDist = departure.trackDist + (arrival.trackDist - departure.trackDist) * progress,
                    status = if (remaining <= 60) "Approaching" else "En Route",
                    nextStation = arrival,
                    segmentsWalked = segmentsWalked + (1 - progress),
                    isDeadReckoned = false,
                    metresPerSecond = metresPerSecond,
                )
            }

            remaining -= running
            segmentsWalked += 1
            if (remaining <= timingDwell) {
                return Walk(departure.trackDist, "At Platform", arrival, segmentsWalked, false, metresPerSecond)
            }
            remaining -= timingDwell
            arrivalIndex = departureIndex
        }
    }

    // ---- sightings ----

    private fun collectVehicleSightings(arrivals: Map<String, List<Arrival>>, now: Double): LinkedHashMap<String, TrainSightings> {
        val byVehicle = LinkedHashMap<String, TrainSightings>()

        for ((_, list) in arrivals) {
            for (arrival in list) {
                if (!arrival.isLive || arrival.targetEpochMs == 0L) continue
                val fetchedAt = arrival.fetchedAtMs.toDouble()

                val secondsRemaining = (arrival.targetEpochMs - now) / 1000
                if (secondsRemaining < -MAX_SECONDS_PAST || secondsRemaining > MAX_SECONDS_AHEAD) continue

                val lineId = arrival.line
                val station = findStation(lineId, arrival.stationName, true)
                val returnStation = if (hasReturnTrack(lineId)) findStation(lineId, arrival.stationName, false) else station
                if (station == null && returnStation == null) continue

                val key = if (!arrival.vehicleId.isNullOrEmpty()) "$lineId-${arrival.vehicleId}"
                else "$lineId-${arrival.destination}-${jsRound(arrival.targetEpochMs / 60000.0)}"

                val train = byVehicle.getOrPut(key) {
                    TrainSightings(key, lineId, arrival.vehicleId?.ifEmpty { null }, arrival.destination)
                }
                train.sightings.add(Sighting(station, returnStation, secondsRemaining, fetchedAt))
            }
        }
        return byVehicle
    }

    private fun sightingsOnChain(train: TrainSightings, isForward: Boolean): List<Sighting> {
        val out = ArrayList<Sighting>()
        for (s in train.sightings) {
            val station = if (isForward) s.station else s.returnStation
            if (station != null) out.add(Sighting(station, s.returnStation, s.secondsRemaining, s.fetchedAt))
        }
        return out
    }

    private class Best(var length: Int, var misfit: Double, var previous: Int)

    internal fun consistentSightings(lineId: String, sightings: List<Sighting>, isForward: Boolean): List<Sighting> {
        if (sightings.size < 2) return sightings

        val stations = getLineStations(lineId, isForward)
        val step = if (isForward) 1 else -1
        val indexOf = HashMap<String, Int>()
        stations.forEachIndexed { i, st -> indexOf[st.id] = i }
        val ordered = sightings
            .filter { indexOf.containsKey(it.station!!.id) }
            .sortedWith { a, b ->
                val primary = step * (indexOf[a.station!!.id]!! - indexOf[b.station!!.id]!!)
                if (primary != 0) primary else a.secondsRemaining.compareTo(b.secondsRemaining)
            }

        fun expectedGap(from: Sighting, to: Sighting): Double {
            var seconds = 0.0
            var i = indexOf[from.station!!.id]!!
            val end = indexOf[to.station!!.id]!!
            while (i != end) {
                seconds += getSegmentTiming(lineId, stations[i], stations[i + step]).first
                i += step
            }
            return seconds
        }

        val best = ArrayList<Best>()
        for (i in ordered.indices) {
            best.add(Best(1, 0.0, -1))
            for (j in 0 until i) {
                if (ordered[j].station!!.id == ordered[i].station!!.id) continue
                val gap = ordered[i].secondsRemaining - ordered[j].secondsRemaining
                if (gap < -ORDER_TOLERANCE_SECONDS) continue
                val length = best[j].length + 1
                val misfit = best[j].misfit + Math.abs(gap - expectedGap(ordered[j], ordered[i]))
                if (length > best[i].length || (length == best[i].length && misfit < best[i].misfit)) {
                    best[i] = Best(length, misfit, j)
                }
            }
        }

        var end = 0
        for (i in 1 until best.size) {
            if (best[i].length > best[end].length || (best[i].length == best[end].length && best[i].misfit < best[end].misfit)) end = i
        }
        val kept = java.util.Collections.newSetFromMap(java.util.IdentityHashMap<Sighting, Boolean>())
        var i = end
        while (i >= 0) {
            kept.add(ordered[i])
            i = best[i].previous
        }
        return sightings.filter { kept.contains(it) }
    }

    private fun anchorAndDirection(train: TrainSightings, input: List<Sighting>): Pair<Sighting, Boolean> {
        val sightings = input.sortedBy { Math.abs(it.secondsRemaining) }
        val anchor = sightings.filter { it.secondsRemaining >= 0 }.sortedBy { it.secondsRemaining }.firstOrNull() ?: sightings[0]

        var votes = 0
        for (other in sightings) {
            if (other === anchor || other.station!!.trackDist == anchor.station!!.trackDist) continue
            if (other.secondsRemaining == anchor.secondsRemaining) continue
            val later = if (other.secondsRemaining > anchor.secondsRemaining) other else anchor
            val earlier = if (later === other) anchor else other
            votes += if (later.station!!.trackDist > earlier.station!!.trackDist) 1 else -1
        }
        val isForward = if (votes == 0) resolveDirection(train.lineId, train.destination, anchor.station) else votes > 0
        return Pair(anchor, isForward)
    }

    private fun placeVehicle(train: TrainSightings): Placed? {
        val lineId = train.lineId

        if (hasReturnTrack(lineId)) {
            class Try(val isForward: Boolean, val onChain: List<Sighting>, val kept: List<Sighting>)
            val tries = listOf(true, false).map { fwd ->
                val onChain = sightingsOnChain(train, fwd)
                Try(fwd, onChain, consistentSightings(lineId, onChain, fwd))
            }
            var pick = if (tries[0].kept.size >= tries[1].kept.size) tries[0] else tries[1]
            if (tries[0].kept.size == tries[1].kept.size) {
                val reference = train.sightings.sortedBy { Math.abs(it.secondsRemaining) }
                    .firstOrNull { it.secondsRemaining >= 0 } ?: train.sightings[0]
                val heading = resolveDirection(lineId, train.destination, reference.station, reference.returnStation)
                pick = if (heading) tries[0] else tries[1]
            }
            if (pick.kept.isEmpty()) return null
            val sorted = pick.kept.sortedBy { Math.abs(it.secondsRemaining) }
            val anchor = sorted.filter { it.secondsRemaining >= 0 }.sortedBy { it.secondsRemaining }.firstOrNull() ?: sorted[0]
            return Placed(anchor, pick.isForward, pick.onChain.size)
        }

        val all = sightingsOnChain(train, true)
        var placed = anchorAndDirection(train, all)
        val kept = consistentSightings(lineId, all, placed.second)
        if (kept.size < all.size) placed = anchorAndDirection(train, kept)
        return Placed(placed.first, placed.second, all.size)
    }

    // ---- vehicles ----

    private fun getLiveVehicles(arrivals: Map<String, List<Arrival>>, now: Double): List<Vehicle> {
        val vehicles = ArrayList<Vehicle>()

        for (train in collectVehicleSightings(arrivals, now).values) {
            val placed = placeVehicle(train) ?: continue
            val anchor = placed.anchor
            val isForward = placed.isForward

            val walked = walkFromStation(train.lineId, anchor.station, anchor.secondsRemaining, isForward) ?: continue
            val (coord, bearing) = getCoordsAndBearingAtDistance(train.lineId, walked.trackDist, isForward)

            val secondsUnheard = maxOf(0.0, (now - anchor.fetchedAt) / 1000)
            val uncertaintyMetres = estimatePositionUncertainty(
                walked.segmentsWalked, secondsUnheard, getLineTrack(train.lineId, isForward)!!.fallbackSpeed,
            )
            val isDeadReckoned = walked.isDeadReckoned

            vehicles.add(
                Vehicle(
                    id = "live-${train.key}",
                    line = train.lineId,
                    vehicleId = train.vehicleId,
                    direction = train.destination,
                    lon = coord.lon,
                    lat = coord.lat,
                    bearing = bearing,
                    distanceAlongTrack = walked.trackDist,
                    isForward = isForward,
                    isLive = true,
                    isSimulated = false,
                    status = walked.status,
                    sightingCount = placed.count,
                    positionUncertaintyMetres = jsRound(uncertaintyMetres).toInt(),
                    positionConfidence = if (isDeadReckoned) MIN_POSITION_CONFIDENCE else confidenceFromUncertainty(uncertaintyMetres),
                    isDeadReckoned = isDeadReckoned,
                    runningSpeed = walked.metresPerSecond,
                    secondsUnheard = jsRound(secondsUnheard).toInt(),
                    targetStation = walked.nextStation?.name ?: anchor.station!!.name,
                    secondsToTarget = maxOf(0L, jsRound(anchor.secondsRemaining)).toInt(),
                ),
            )
        }
        return vehicles
    }

    private fun getHeadwayVehiclesForLine(lineId: String, now: Double): List<Vehicle> {
        val outTrack = getLineTrack(lineId)
        val outStations = getLineStations(lineId)
        if (outTrack == null || outStations.size < 2) return emptyList()

        val firstStop = outStations[0]
        val lastStop = outStations[outStations.size - 1]
        val speed = outTrack.fallbackSpeed
        val totalLength = outTrack.totalLength

        val oneWaySecs = totalLength / speed
        val cycleTimeMs = maxOf(600000.0, oneWaySecs * 1000 * 2.2)
        val numTrainsPerDir = if (totalLength > 40000) 3 else if (totalLength > 15000) 2 else 1
        val vehicles = ArrayList<Vehicle>()

        for (dir in 0 until 2) {
            val isForward = dir == 0
            val track = getLineTrack(lineId, isForward)!!
            val stations = getLineStations(lineId, isForward)
            val legLength = track.totalLength
            val destination = if (isForward) lastStop.name else firstStop.name

            for (tIdx in 0 until numTrainsPerDir) {
                val offsetMs = (cycleTimeMs / numTrainsPerDir) * tIdx + (dir * (cycleTimeMs / (numTrainsPerDir * 2)))
                val cycleProgress = (((now + offsetMs) % cycleTimeMs) / cycleTimeMs)

                val posProgress = if (cycleProgress > 0.5) (1 - cycleProgress) * 2 else cycleProgress * 2
                val currentDist = posProgress * legLength

                var nearestTarget = if (isForward) lastStop else firstStop
                for (st in stations) {
                    if (isForward && st.trackDist >= currentDist) {
                        nearestTarget = st
                        break
                    } else if (!isForward && st.trackDist <= currentDist) {
                        nearestTarget = st
                        break
                    }
                }

                val remainingDist = Math.abs(nearestTarget.trackDist - currentDist)
                val secondsToTarget = jsRound(remainingDist / speed)

                val (coord, bearing) = getCoordsAndBearingAtDistance(lineId, currentDist, isForward)

                vehicles.add(
                    Vehicle(
                        id = "sim-L$lineId-${if (isForward) "fwd" else "rev"}-$tIdx",
                        line = lineId,
                        vehicleId = null,
                        direction = destination,
                        lon = coord.lon,
                        lat = coord.lat,
                        bearing = bearing,
                        distanceAlongTrack = currentDist,
                        isForward = isForward,
                        isLive = false,
                        isSimulated = true,
                        status = null,
                        sightingCount = 0,
                        positionUncertaintyMetres = 0,
                        positionConfidence = 1.0,
                        isDeadReckoned = false,
                        runningSpeed = 0.0,
                        secondsUnheard = 0,
                        targetStation = nearestTarget.name,
                        secondsToTarget = secondsToTarget.toInt(),
                    ),
                )
            }
        }
        return vehicles
    }

    private fun catchUpRate(v: Vehicle): Double {
        val running = if (v.runningSpeed > 0) v.runningSpeed else FALLBACK_RUNNING_SPEED
        return maxOf(CATCH_UP_MIN_METRES_PER_SECOND, minOf(CATCH_UP_MAX_METRES_PER_SECOND, CATCH_UP_SPEED_FACTOR * running))
    }

    private fun smoothVehicle(vehicle: Vehicle, now: Double): Vehicle {
        if (!vehicle.isLive) return vehicle

        val isForward = vehicle.isForward
        val previous = renderState[vehicle.id]
        fun resync(): Vehicle {
            renderState[vehicle.id] = RenderState(vehicle.distanceAlongTrack, isForward, now)
            return vehicle
        }

        if (previous == null || previous.isForward != isForward) return resync()

        val ahead = (vehicle.distanceAlongTrack - previous.trackDist) * (if (isForward) 1 else -1)
        if (ahead > resyncForwardMetres || -ahead > resyncBackwardMetres) return resync()

        val elapsedSeconds = maxOf(0.0, now - previous.at) / 1000
        val step = maxOf(0.0, minOf(ahead, catchUpRate(vehicle) * elapsedSeconds))
        val drawn = previous.trackDist + step * (if (isForward) 1 else -1)
        renderState[vehicle.id] = RenderState(drawn, isForward, now)
        if (drawn == vehicle.distanceAlongTrack) return vehicle

        val (coord, bearing) = getCoordsAndBearingAtDistance(vehicle.line, drawn, isForward)
        return vehicle.at(coord.lon, coord.lat, bearing, drawn)
    }

    private fun getAllVehicles(arrivals: Map<String, List<Arrival>>, now: Double): List<Vehicle> {
        val live = getLiveVehicles(arrivals, now)
        val all = ArrayList<Vehicle>(live)

        for (l in 1..10) {
            val lineId = l.toString()
            val liveOnLine = live.filter { it.line == lineId }

            if (liveOnLine.isEmpty()) {
                all.addAll(getHeadwayVehiclesForLine(lineId, now))
            } else if (liveOnLine.size == 1) {
                val simulated = getHeadwayVehiclesForLine(lineId, now)
                val oppSim = simulated.firstOrNull { it.direction != liveOnLine[0].direction }
                if (oppSim != null) all.add(oppSim)
            }
        }

        val alive = all.map { it.id }.toHashSet()
        renderState.keys.retainAll(alive)

        return all.map { smoothVehicle(it, now) }
    }

    /**
     * Live trains where predictions exist, headway-simulated trains elsewhere, eased frame to frame.
     * [arrivals] is [ArrivalStore.arrivals]`.value`.
     */
    @Synchronized
    fun positions(arrivals: Map<String, List<Arrival>>, nowMs: Long): List<TrainPosition> =
        getAllVehicles(arrivals, nowMs.toDouble()).map { it.toPosition() }

    /**
     * Only the trains placed from real arrivals, evaluated at [nowMs]. The Timetable Walk is a function of time,
     * so calling this every frame moves each train along its track at the walk's own speed with no stepping;
     * the headway guesses [positions] adds are not computed at all.
     */
    @Synchronized
    fun livePositions(arrivals: Map<String, List<Arrival>>, nowMs: Long): List<TrainPosition> {
        val now = nowMs.toDouble()
        val live = getLiveVehicles(arrivals, now)
        val alive = live.map { it.id }.toHashSet()
        renderState.keys.retainAll(alive)
        return live.map { smoothVehicle(it, now).toPosition() }
    }

    private fun Vehicle.toPosition() = TrainPosition(
        id = id, line = line, vehicleId = vehicleId, lat = lat, lon = lon, bearing = bearing,
        confidence = positionConfidence, simulated = isSimulated, isLive = isLive, isForward = isForward,
        isDeadReckoned = isDeadReckoned, distanceAlongTrack = distanceAlongTrack, destination = direction,
        status = status, targetStation = targetStation, secondsToTarget = secondsToTarget,
        uncertaintyMeters = positionUncertaintyMetres, secondsUnheard = secondsUnheard, sightingCount = sightingCount,
    )

    /** Everything the panel and the expanded Station marker need about one Station (port of stationFocus.js). */
    fun focusStation(station: Station, cached: CachedArrivals?, nowMs: Long): StationFocus {
        val arrivals = cached?.arrivals ?: emptyList()

        class Group(val key: String) {
            val destinations = ArrayList<String>()
            val arrivals = ArrayList<ProjectedArrival>()
            val bearings = ArrayList<Double>()
        }
        val groups = LinkedHashMap<String, Group>()

        for (arrival in arrivals) {
            val lineId = arrival.line
            val located = locateArrival(lineId, station.name, arrival.destination) ?: continue
            val key = if (located.isForward) "forward" else "backward"
            val group = groups.getOrPut(key) { Group(key) }
            group.arrivals.add(arrival)
            val bearing = getCoordsAndBearingAtDistance(lineId, located.station.trackDist, located.isForward).second
            group.bearings.add(bearing)
            if (arrival.destination.isNotEmpty() && !group.destinations.contains(arrival.destination)) {
                group.destinations.add(arrival.destination)
            }
        }

        val directions = listOf("forward", "backward")
            .filter { groups.containsKey(it) }
            .map { key ->
                val group = groups[key]!!
                val sorted = group.arrivals.sortedBy { it.seconds }
                val next = sorted.firstOrNull()
                val destination = next?.destination?.ifEmpty { null } ?: group.destinations.firstOrNull() ?: "Onwards"
                DirectionGroup(
                    key = key,
                    destinations = group.destinations.toList(),
                    destination = destination,
                    label = destination,
                    bearing = meanBearing(group.bearings),
                    arrivals = sorted,
                )
            }
            .sortedBy { it.arrivals.firstOrNull()?.seconds ?: Int.MAX_VALUE }

        val headlined = java.util.Collections.newSetFromMap(java.util.IdentityHashMap<ProjectedArrival, Boolean>())
        directions.forEach { d -> d.arrivals.firstOrNull()?.let { headlined.add(it) } }

        return StationFocus(
            name = station.name,
            lines = station.lines,
            arrivals = arrivals.sortedBy { it.seconds },
            laterArrivals = arrivals.filter { !headlined.contains(it) }.sortedBy { it.seconds },
            directions = directions,
            isFresh = cached?.isFresh == true,
            fetchedAtMs = cached?.fetchedAtMs,
            secondsUnheard = if (cached != null && cached.fetchedAtMs != 0L) jsRound((nowMs - cached.fetchedAtMs) / 1000.0).toInt() else null,
            fetchError = cached?.fetchError,
        )
    }

    /** Unit-vector mean, because bearings wrap: the mean of 350 and 10 is 0, not 180. */
    private fun meanBearing(bearings: List<Double>): Double? {
        if (bearings.isEmpty()) return null
        val toRad = PI / 180
        var x = 0.0
        var y = 0.0
        for (b in bearings) x += cos(b * toRad)
        for (b in bearings) y += sin(b * toRad)
        return (atan2(y, x) * (180 / PI) + 360) % 360
    }

    companion object {
        const val MAX_SECONDS_PAST = 20.0
        const val MAX_SECONDS_AHEAD = 1080.0
        const val MAX_STATION_OFFSET_METRES = 250.0
        const val CATCH_UP_SPEED_FACTOR = 2.0
        const val CATCH_UP_MIN_METRES_PER_SECOND = 6.0
        const val CATCH_UP_MAX_METRES_PER_SECOND = 20.0
        const val FALLBACK_RUNNING_SPEED = 7.5
        const val RESYNC_FORWARD_METRES = 1500.0
        const val RESYNC_BACKWARD_METRES = 1500.0
        const val MAX_RUNNING_METRES_PER_SECOND = 17.0
        const val MIN_RUNNING_CEILING_METRES_PER_SECOND = 10.0
        const val RUNNING_CEILING_SPEED_FACTOR = 1.8
        const val QUANTISATION_SECONDS = 30.0
        const val DRIFT_SECONDS_PER_SECOND_UNHEARD = 0.25
        const val FULL_CONFIDENCE_METRES = 200.0
        const val LOST_CONFIDENCE_METRES = 1000.0
        const val MIN_WALKED_CONFIDENCE = 0.45
        const val MIN_POSITION_CONFIDENCE = 0.35
        const val ORDER_TOLERANCE_SECONDS = 10.0

        /** JS Math.round: floor(x + 0.5). */
        internal fun jsRound(x: Double): Long = Math.floor(x + 0.5).toLong()

        /** The engine's own haversine (operation order differs from GeoUtils.getDistance). */
        fun haversineDistance(c1: LonLat, c2: LonLat): Double {
            val r = 6371000.0
            val dLat = (c2.lat - c1.lat) * (PI / 180)
            val dLon = (c2.lon - c1.lon) * (PI / 180)
            val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(c1.lat * (PI / 180)) * cos(c2.lat * (PI / 180)) * sin(dLon / 2) * sin(dLon / 2)
            return r * 2 * atan2(sqrt(a), sqrt(1 - a))
        }

        /** (distance along the track, perpendicular distance). */
        internal fun projectPointOntoPolyline(point: LonLat, coords: List<LonLat>, cumDists: DoubleArray): Pair<Double, Double> {
            var minPerpDist = Double.POSITIVE_INFINITY
            var bestDistAlong = 0.0
            for (i in 0 until coords.size - 1) {
                val p1 = coords[i]
                val p2 = coords[i + 1]
                val segLen = cumDists[i + 1] - cumDists[i]
                if (segLen == 0.0) continue

                val dx = p2.lon - p1.lon
                val dy = p2.lat - p1.lat
                val lenSq = dx * dx + dy * dy
                var t = if (lenSq == 0.0) 0.0 else ((point.lon - p1.lon) * dx + (point.lat - p1.lat) * dy) / lenSq
                t = maxOf(0.0, minOf(1.0, t))

                val proj = LonLat(p1.lon + t * dx, p1.lat + t * dy)
                val d = haversineDistance(point, proj)
                if (d < minPerpDist) {
                    minPerpDist = d
                    bestDistAlong = cumDists[i] + t * segLen
                }
            }
            return Pair(bestDistAlong, minPerpDist)
        }

        /** Metres of doubt around a walked position. */
        fun estimatePositionUncertainty(segmentsWalked: Double, secondsUnheard: Double, metresPerSecond: Double): Double {
            val quantisation = sqrt(maxOf(0.0, segmentsWalked)) * QUANTISATION_SECONDS
            val beyondOneSync = maxOf(0.0, secondsUnheard - NETWORK_SYNC_INTERVAL_MS / 1000)
            val drift = beyondOneSync * DRIFT_SECONDS_PER_SECOND_UNHEARD
            return (quantisation + drift) * metresPerSecond
        }

        /** The 0.45-1 scale a walked position is drawn at. */
        fun confidenceFromUncertainty(uncertaintyMetres: Double): Double {
            val span = LOST_CONFIDENCE_METRES - FULL_CONFIDENCE_METRES
            val lost = (uncertaintyMetres - FULL_CONFIDENCE_METRES) / span
            return maxOf(MIN_WALKED_CONFIDENCE, minOf(1.0, 1 - lost))
        }
    }
}
