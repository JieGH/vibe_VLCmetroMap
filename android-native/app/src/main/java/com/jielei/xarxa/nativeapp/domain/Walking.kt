package com.jielei.xarxa.nativeapp.domain

import java.util.Locale
import kotlin.math.ceil

/** Walking pace used for the nearest-station notice: 1.25 m/s, about 4.5 km/h. */
const val WALKING_SPEED_MPS = 1.25

/** Whole minutes to walk [meters], rounded up, never below 1. */
fun walkingMinutes(meters: Double): Int = maxOf(1, ceil(meters / WALKING_SPEED_MPS / 60.0).toInt())

/** "316 m" below 1000 m (rounded to a whole metre), otherwise kilometres with one decimal ("1.2 km"). */
fun formatDistance(meters: Double, locale: Locale = Locale.getDefault()): String =
    if (meters < 1000.0) "${Math.round(meters)} m" else String.format(locale, "%.1f km", meters / 1000.0)

/** How far a walk is, for the colour and icon of the walking box. Thresholds in minutes, inclusive. */
enum class WalkCategory { Short, Medium, Long }

const val SHORT_WALK_MAX_MIN = 5
const val MEDIUM_WALK_MAX_MIN = 15

fun walkCategory(minutes: Int): WalkCategory = when {
    minutes <= SHORT_WALK_MAX_MIN -> WalkCategory.Short
    minutes <= MEDIUM_WALK_MAX_MIN -> WalkCategory.Medium
    else -> WalkCategory.Long
}
