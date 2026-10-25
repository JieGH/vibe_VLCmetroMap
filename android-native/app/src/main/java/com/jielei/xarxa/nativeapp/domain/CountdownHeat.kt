package com.jielei.xarxa.nativeapp.domain

/** Port of src/utils/countdownHeat.js. Colours are 0xFFRRGGBB. */
const val DUE_THRESHOLD_SECONDS = 10

data class HeatBand(val key: String, val maxSeconds: Double, val dark: Long, val light: Long)

val HEAT_BANDS = listOf(
    HeatBand("due", DUE_THRESHOLD_SECONDS.toDouble(), 0xFFff6369, 0xFFc62828),
    HeatBand("imminent", 120.0, 0xFFff8b3d, 0xFFa34500),
    HeatBand("soon", 300.0, 0xFFffb224, 0xFF7a5200),
    HeatBand("waiting", 600.0, 0xFFa7c957, 0xFF4d7c0f),
    HeatBand("distant", Double.POSITIVE_INFINITY, 0xFF3dd68c, 0xFF146c43),
)

/** Panel backdrops each ramp was contrast-checked against. */
const val HEAT_BACKDROP_DARK = 0xFF1e1e24
const val HEAT_BACKDROP_LIGHT = 0xFFffffff

fun countdownColor(seconds: Double, darkTheme: Boolean = true): Long {
    val band = HEAT_BANDS.firstOrNull { seconds <= it.maxSeconds } ?: HEAT_BANDS.last()
    return if (darkTheme) band.dark else band.light
}

fun countdownColor(seconds: Int, darkTheme: Boolean = true): Long = countdownColor(seconds.toDouble(), darkTheme)

/** "Due" inside [DUE_THRESHOLD_SECONDS], whole seconds under a minute, else whole minutes. */
fun countdownLabel(seconds: Double, dueLabel: String = "Due"): String {
    if (seconds <= DUE_THRESHOLD_SECONDS) return dueLabel
    if (seconds < 60) return Math.round(seconds).toString()
    return Math.round(seconds / 60).toString()
}

fun countdownLabel(seconds: Int, dueLabel: String = "Due"): String = countdownLabel(seconds.toDouble(), dueLabel)

/** "sec", "min", or null once the train reads as Due. */
fun countdownUnit(seconds: Double): String? = when {
    seconds <= DUE_THRESHOLD_SECONDS -> null
    seconds < 60 -> "sec"
    else -> "min"
}

fun countdownUnit(seconds: Int): String? = countdownUnit(seconds.toDouble())
