package com.jielei.xarxa.nativeapp.net

import kotlinx.coroutines.suspendCancellableCoroutine
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** An HTTP answer: [body] is only read for a 2xx status (an error status is an answer, not retried). */
data class PrevisionResponse(val status: Int, val body: String?) {
    val ok: Boolean get() = status in 200..299
}

/** One Station's live predictions. Implementations throw on network failure; the store retries once. */
fun interface PrevisionSource {
    suspend fun fetch(apiId: Int): PrevisionResponse
}

/**
 * Calls FGV's own app endpoint directly (keyless, no CORS on native). See docs/fgv-api.md, ADR-0005.
 * Cancelling the coroutine (the store's 4 s attempt timeout) disconnects the socket.
 */
class FgvPrevisionSource(
    private val baseUrl: String = FGV_PREVISION_URL,
    private val timeoutMs: Int = 4000,
) : PrevisionSource {
    override suspend fun fetch(apiId: Int): PrevisionResponse = suspendCancellableCoroutine { cont ->
        val conn = URL("$baseUrl/$apiId").openConnection() as HttpURLConnection
        cont.invokeOnCancellation { conn.disconnect() }
        thread(isDaemon = true, name = "fgv-prevision-$apiId") {
            try {
                conn.requestMethod = "GET"
                conn.connectTimeout = timeoutMs
                conn.readTimeout = timeoutMs
                conn.setRequestProperty("Accept", "application/json")
                val status = conn.responseCode
                val body = if (status in 200..299) conn.inputStream.bufferedReader().use { it.readText() } else null
                cont.resume(PrevisionResponse(status, body))
            } catch (e: Throwable) {
                cont.resumeWithException(e)
            } finally {
                conn.disconnect()
            }
        }
    }

    companion object {
        const val FGV_PREVISION_URL = "https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3"
    }
}
