package com.jielei.xarxa.nativeapp.domain

import com.jielei.xarxa.nativeapp.net.FgvPrevisionSource
import com.jielei.xarxa.nativeapp.net.PrevisionResponse
import com.jielei.xarxa.nativeapp.net.PrevisionSource
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ServerSocket
import kotlin.concurrent.thread
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger

internal val NOW: Long = Instant.parse("2026-10-20T17:30:00Z").toEpochMilli()
private const val LEAD_MS = ARRIVAL_COUNTDOWN_LEAD_SECONDS * 1000L

internal val ANGEL_GUIMERA = Station("st-ag", "Àngel Guimerà", 39.47, -0.38, listOf("1", "2", "3", "5", "9"), 17)

/** The shape FGV's horarios-prevision-3 returns: trains grouped under each Line. */
internal fun fgvPayload(vararg lines: Pair<Int, List<Triple<String, Number?, Int>>>): String {
    val groups = lines.joinToString(",") { (line, trains) ->
        val ts = trains.joinToString(",") { (dest, secs, vehicle) ->
            """{"cabecera":false,"destino":"$dest","latitude":null,"longitude":null,"meters":null,"seconds":${secs ?: "null"},"vehicle":$vehicle,"capacity":397,"line_id":$line}"""
        }
        """{"line":$line,"line_id":$line,"linea_id_interna":${40 + line},"trains":[$ts]}"""
    }
    return """{"previsiones":[$groups],"aforo_bloqueado":{"desde":null,"hasta":null}}"""
}

/** Scriptable fake HTTP: records every requested id and the peak number in flight. */
internal class FakeSource(var handler: suspend (Int) -> PrevisionResponse) : PrevisionSource {
    val calls = java.util.Collections.synchronizedList(ArrayList<Int>())
    val inFlight = AtomicInteger()
    val peak = AtomicInteger()
    override suspend fun fetch(apiId: Int): PrevisionResponse {
        calls.add(apiId)
        val now = inFlight.incrementAndGet()
        peak.updateAndGet { maxOf(it, now) }
        try {
            return handler(apiId)
        } finally {
            inFlight.decrementAndGet()
        }
    }
}

internal fun ok(body: String) = PrevisionResponse(200, body)

@OptIn(ExperimentalCoroutinesApi::class)
internal fun TestScope.clock() = Clock { NOW + testScheduler.currentTime }

@OptIn(ExperimentalCoroutinesApi::class)
internal fun TestScope.store(source: PrevisionSource) =
    ArrivalStore(TestData.network, source, clock(), StandardTestDispatcher(testScheduler))

@OptIn(ExperimentalCoroutinesApi::class)
class ArrivalStoreTest {
    @Test fun everyTrainInEveryLineGroupBecomesOneArrivalSoonestFirst() = runTest {
        val s = FakeSource { ok(fgvPayload(5 to listOf(Triple("Marítim", 137, 5113), Triple("Aeroport", 529, 5118)), 1 to listOf(Triple("Bétera", 216, 1143)))) }
        val r = store(s).refreshStation(ANGEL_GUIMERA)
        assertEquals(
            listOf(listOf("5", "Marítim", "5113", 137.0), listOf("1", "Bétera", "1143", 216.0), listOf("5", "Aeroport", "5118", 529.0)),
            r.arrivals.map { listOf(it.arrival.line, it.destination, it.arrival.vehicleId, it.arrival.initialSeconds) },
        )
        assertNull(r.fetchError)
        assertFalse(r.isFromCache)
    }

    @Test fun emptyStationIsEmptyNotBroken() = runTest {
        val r = store(FakeSource { ok(fgvPayload()) }).refreshStation(ANGEL_GUIMERA)
        assertTrue(r.arrivals.isEmpty()); assertNull(r.fetchError)
    }

    @Test fun dropsTrainsItCannotPlaceAndKeepsTheRest() = runTest {
        val s = FakeSource { ok(fgvPayload(3 to listOf(Triple("", 90, 3114), Triple("Aeroport", null, 3115), Triple("Rafelbunyol", 425, 3113)))) }
        val r = store(s).refreshStation(ANGEL_GUIMERA)
        assertEquals(listOf("3113"), r.arrivals.map { it.arrival.vehicleId })
    }

    @Test fun propagationLagPerLine() = runTest {
        val cases = listOf("4" to 10, "6" to 10, "8" to 10, "10" to 10, "1" to 15, "2" to 15, "3" to 15, "5" to 15, "7" to 15, "9" to 15)
        for ((line, lag) in cases) {
            val s = FakeSource { ok(fgvPayload(line.toInt() to listOf(Triple("Somewhere", 300, 9999)))) }
            val a = store(s).refreshStation(ANGEL_GUIMERA).arrivals.single().arrival
            assertEquals("line $line", NOW + (300 - lag - ARRIVAL_COUNTDOWN_LEAD_SECONDS) * 1000L, a.targetEpochMs)
        }
    }

    @Test fun countdownIsLeadSecondsShortOfTheLaggedFeedTime() = runTest {
        assertEquals(10, ARRIVAL_COUNTDOWN_LEAD_SECONDS)
        val s = FakeSource { ok(fgvPayload(3 to listOf(Triple("Aeroport", 300, 3114)))) }
        assertEquals(300 - 15 - ARRIVAL_COUNTDOWN_LEAD_SECONDS, store(s).refreshStation(ANGEL_GUIMERA).arrivals.single().seconds)
    }

    @Test fun givesUpOnAHungRequestAndAsksOnceMore() = runTest {
        val n = AtomicInteger()
        val s = FakeSource { if (n.incrementAndGet() == 1) awaitCancellation() else ok(fgvPayload(3 to listOf(Triple("Aeroport", 529, 3114)))) }
        val r = store(s).refreshStation(ANGEL_GUIMERA)
        assertEquals(2, s.calls.size)
        assertEquals(listOf("3114"), r.arrivals.map { it.arrival.vehicleId })
        assertNull(r.fetchError)
        assertEquals(4000L, testScheduler.currentTime)
    }

    @Test fun keepsCountingDownFromMemoryWhenBothAttemptsHang() = runTest {
        var hang = false
        val s = FakeSource { if (hang) awaitCancellation() else ok(fgvPayload(1 to listOf(Triple("Bétera", 300, 1143)))) }
        val st = store(s)
        st.refreshStation(ANGEL_GUIMERA)
        advanceTimeBy(90_000); hang = true
        val before = s.calls.size
        val r = st.refreshStation(ANGEL_GUIMERA)
        assertEquals(2, s.calls.size - before)
        assertEquals(listOf("1143"), r.arrivals.map { it.arrival.vehicleId })
        assertTrue(r.isFromCache); assertNotNull(r.fetchError)
    }

    @Test fun reportsUnavailableWhenBothAttemptsHangAndNothingRemembered() = runTest {
        val s = FakeSource { awaitCancellation() }
        val r = store(s).refreshStation(ANGEL_GUIMERA)
        assertEquals(2, s.calls.size)
        assertTrue(r.arrivals.isEmpty()); assertNotNull(r.fetchError)
    }

    @Test fun networkErrorIsRetriedOnce() = runTest {
        val n = AtomicInteger()
        val s = FakeSource { if (n.incrementAndGet() == 1) throw java.io.IOException("boom") else ok(fgvPayload(3 to listOf(Triple("Aeroport", 529, 3114)))) }
        val r = store(s).refreshStation(ANGEL_GUIMERA)
        assertEquals(2, s.calls.size); assertEquals(1, r.arrivals.size)
    }

    @Test fun httpErrorIsAnAnswerAndNotRetried() = runTest {
        val s = FakeSource { PrevisionResponse(503, null) }
        val r = store(s).refreshStation(ANGEL_GUIMERA)
        assertEquals(1, s.calls.size); assertNotNull(r.fetchError)
    }

    @Test fun insideTheMemoryPauseNoRequestIsMade() = runTest {
        val s = FakeSource { ok(fgvPayload(3 to listOf(Triple("Aeroport", 900, 3114)))) }
        val st = store(s)
        st.refreshStation(ANGEL_GUIMERA)
        advanceTimeBy(59_000)
        val cached = st.refreshStation(ANGEL_GUIMERA)
        assertTrue(cached.isFromCache); assertEquals(1, s.calls.size)
    }

    @Test fun forcedRefreshInsideCooldownReadsMemory() = runTest {
        val s = FakeSource { ok(fgvPayload(3 to listOf(Triple("Aeroport", 900, 3114)))) }
        val st = store(s)
        st.refreshStation(ANGEL_GUIMERA)
        advanceTimeBy(10_000)
        val r = st.refreshStation(ANGEL_GUIMERA, force = true)
        assertEquals(1, s.calls.size)
        assertTrue(r.isFromCache); assertEquals("Refreshed recently. Showing countdown from memory.", r.fetchError)
        advanceTimeBy(25_000)                                   // 35 s: past the cooldown, inside the pause
        st.refreshStation(ANGEL_GUIMERA, force = true)
        assertEquals(2, s.calls.size)
        advanceTimeBy(61_000)
        st.refreshStation(ANGEL_GUIMERA)                        // past the 60 s pause
        assertEquals(3, s.calls.size)
    }

    @Test fun concurrentRequestsForOneStationShareOneFetch() = runTest {
        val gate = CompletableDeferred<Unit>()
        val s = FakeSource { gate.await(); ok(fgvPayload(3 to listOf(Triple("Aeroport", 900, 3114)))) }
        val st = store(s)
        val a = async { st.refreshStation(ANGEL_GUIMERA) }
        val b = async { st.refreshStation(ANGEL_GUIMERA) }
        runCurrent()
        gate.complete(Unit)
        val (ra, rb) = awaitAll(a, b)
        assertEquals(1, s.calls.size)
        assertEquals(ra.arrivals.size, rb.arrivals.size)
    }

    @Test fun aStationWithNoEndpointSaysSo() = runTest {
        val s = FakeSource { ok(fgvPayload()) }
        val r = store(s).refreshStation(Station("x", "Nowhere", 0.0, 0.0, listOf("1"), null))
        assertTrue(s.calls.isEmpty()); assertTrue(r.fetchError!!.startsWith("N/A"))
    }

    @Test fun stationWithoutApiIdIsResolvedByName() = runTest {
        val s = FakeSource { ok(fgvPayload()) }
        store(s).refreshStation(Station("x", "Ayora", 0.0, 0.0, listOf("5", "7"), null))
        assertEquals(listOf(22), s.calls)
    }

    @Test fun arrivalsFlowPublishesStoredPredictionsByStationKey() = runTest {
        val s = FakeSource { ok(fgvPayload(3 to listOf(Triple("Aeroport", 300, 3114)))) }
        val st = store(s)
        assertTrue(st.arrivals.value.isEmpty())
        st.refreshStation(ANGEL_GUIMERA)
        val a = st.arrivals.value["17"]!!.single()
        assertEquals("Àngel Guimerà", a.stationName); assertEquals(NOW, a.fetchedAtMs)
        assertEquals("3", a.line); assertTrue(a.lineName.isNotEmpty()); assertTrue(a.lineColorArgb != 0L)
    }

    // ---- Network Sync ----

    private val hubs get() = TestData.network.liveStations.strategicHubs.map { it.id }
    private val majors get() = TestData.network.liveStations.majorStations.map { it.id }

    @Test fun bootFetchesEveryMajorStationHubsFirstEachOnce() = runTest {
        val s = FakeSource { ok(fgvPayload()) }
        val result = store(s).syncNetwork()
        assertEquals(hubs, s.calls.take(hubs.size))
        assertEquals(majors.sorted(), s.calls.sorted())
        assertEquals(SyncResult(majors.size, 0), result)
    }

    @Test fun syncingTwiceBackToBackDispatchesEachStationOnce() = runTest {
        val s = FakeSource { ok(fgvPayload()) }
        val st = store(s)
        val first = async { st.syncNetwork() }
        val second = async { st.syncNetwork() }
        awaitAll(first, second)
        assertEquals(s.calls.size, s.calls.toSet().size)
        assertEquals(SyncResult(0, 0), listOf(first.await(), second.await()).minBy { it.fetched })
    }

    @Test fun neverMoreThanFourRequestsInFlightDuringASync() = runTest {
        val gates = java.util.concurrent.ConcurrentLinkedQueue<CompletableDeferred<Unit>>()
        val s = FakeSource { val g = CompletableDeferred<Unit>(); gates.add(g); g.await(); ok(fgvPayload()) }
        val st = store(s)
        val sync = async { st.syncNetwork() }
        runCurrent()
        assertEquals(4, s.inFlight.get())
        while (!sync.isCompleted) {
            runCurrent()
            while (true) gates.poll()?.complete(Unit) ?: break
            runCurrent()
        }
        assertEquals(4, s.peak.get())
        assertEquals(majors.size, s.calls.size)
        assertEquals(SyncResult(majors.size, 0), sync.await())
    }

    @Test fun skipsStationsInsideTheirMemoryPauseAndSurvivesAFailingStation() = runTest {
        val fresh = majors[5]
        val broken = majors[7]
        val s = FakeSource { id ->
            if (id == broken) throw java.io.IOException("boom")
            ok(fgvPayload())
        }
        val st = store(s)
        st.refreshStation(Station("x", "fresh", 0.0, 0.0, emptyList(), fresh))
        s.calls.clear()
        val result = st.syncNetwork()
        assertFalse(s.calls.contains(fresh))
        assertEquals(1, result.skipped)
        assertEquals(majors.size, result.fetched + result.skipped)
    }

    @Test fun singleStationRequestsShareTheSameBound() = runTest {
        val gates = java.util.concurrent.ConcurrentLinkedQueue<CompletableDeferred<Unit>>()
        val s = FakeSource { val g = CompletableDeferred<Unit>(); gates.add(g); g.await(); ok(fgvPayload()) }
        val st = store(s)
        val taps = majors.take(10).map { id -> async { st.refreshStation(Station("x", "s$id", 0.0, 0.0, emptyList(), id)) } }
        runCurrent()
        assertEquals(4, s.inFlight.get())
        while (taps.any { !it.isCompleted }) {
            runCurrent()
            while (true) gates.poll()?.complete(Unit) ?: break
            runCurrent()
        }
        assertEquals(4, s.peak.get())
    }

    @Test fun networkSyncRunsNowAndEveryTwoMinutesUntilStopped() = runTest {
        val s = FakeSource { ok(fgvPayload()) }
        val st = store(s)
        st.startNetworkSync(backgroundScope)
        st.startNetworkSync(backgroundScope)                    // idempotent
        runCurrent()
        assertEquals(majors.size, s.calls.size)
        advanceTimeBy(NETWORK_SYNC_INTERVAL_MS + 1); runCurrent()
        // stations are inside their 60 s pause for the first 60 s only, so the second sweep refetches all
        assertEquals(2 * majors.size, s.calls.size)
        st.stopNetworkSync()
        advanceTimeBy(5 * NETWORK_SYNC_INTERVAL_MS); runCurrent()
        assertEquals(2 * majors.size, s.calls.size)
        assertTrue(st.lastNetworkSyncAt > NOW)
    }

    @Test fun cachedProjectsCountdownsToTheGivenMoment() = runTest {
        val s = FakeSource { ok(fgvPayload(3 to listOf(Triple("Aeroport", 300, 3114)))) }
        val st = store(s)
        st.refreshStation(ANGEL_GUIMERA)
        val c = st.cached(ANGEL_GUIMERA, NOW)!!
        assertTrue(c.isFresh)
        assertEquals(275, c.arrivals.single().seconds)
        assertEquals(ArrivalStatus.OnTime, c.arrivals.single().status)
        val later = st.cached(ANGEL_GUIMERA, NOW + 200_000)!!
        assertFalse(later.isFresh)
        assertEquals(75, later.arrivals.single().seconds); assertEquals(ArrivalStatus.Approaching, later.arrivals.single().status)
        val atPlatform = st.cached(ANGEL_GUIMERA, NOW + 285_000 + 5_000)!!
        assertEquals(ArrivalStatus.AtPlatform, atPlatform.arrivals.single().status)
        assertNull(st.cached(ANGEL_GUIMERA, NOW + 285_000 + 21_000))   // rolled off after the 20 s grace
    }
}

/** The real HttpURLConnection source against a tiny local HTTP server. */
class FgvPrevisionSourceTest {
    private fun serve(server: ServerSocket) = thread(isDaemon = true) {
        while (!server.isClosed) {
            val sock = try { server.accept() } catch (e: Exception) { return@thread }
            thread(isDaemon = true) {
                try {
                    val reader = sock.getInputStream().bufferedReader()
                    val request = reader.readLine()
                    val headers = generateSequence { reader.readLine() }.takeWhile { it.isNotEmpty() }.toList()
                    val out = sock.getOutputStream()
                    fun respond(status: String, body: String) {
                        val bytes = body.toByteArray()
                        out.write("HTTP/1.1 $status\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
                        out.write(bytes); out.flush()
                    }
                    when {
                        request.contains("/p/17") -> {
                            val accept = headers.firstOrNull { it.startsWith("Accept:", true) }?.substringAfter(":")?.trim()
                            respond("200 OK", """{"previsiones":[],"accept":"$accept"}""")
                        }
                        request.contains("/p/99") -> respond("503 Service Unavailable", "")
                        else -> Thread.sleep(5000)
                    }
                } catch (e: Exception) {
                } finally {
                    try { sock.close() } catch (e: Exception) {}
                }
            }
        }
    }

    @Test fun readsBodyOn200AndStatusOnErrorAndAbandonsASlowRequest() = kotlinx.coroutines.runBlocking {
        val server = ServerSocket(0, 10, java.net.InetAddress.getByName("127.0.0.1"))
        serve(server)
        try {
            val src = FgvPrevisionSource("http://127.0.0.1:${server.localPort}/p", timeoutMs = 4000)
            val ok = src.fetch(17)
            assertTrue(ok.ok); assertTrue(ok.body!!.contains("\"accept\":\"application/json\""))
            val bad = src.fetch(99)
            assertEquals(503, bad.status); assertNull(bad.body)
            val t0 = System.nanoTime()
            val r = withTimeoutOrNull(300) { src.fetch(5) }
            assertNull(r)
            assertTrue((System.nanoTime() - t0) / 1_000_000 < 2000)
        } finally {
            server.close()
        }
    }

    @Test fun usesFgvsOwnEndpoint() {
        assertEquals("https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3", FgvPrevisionSource.FGV_PREVISION_URL)
    }
}
