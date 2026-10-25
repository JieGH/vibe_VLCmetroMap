package com.jielei.xarxa.nativeapp.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Brand surfaces carried over from the Capacitor app (dark #1D1D29-ish, accent #00B4D8). */
val Accent = Color(0xFF00B4D8)

private val DarkScheme = darkColorScheme(
    primary = Accent,
    onPrimary = Color(0xFF00232B),
    primaryContainer = Color(0xFF123B48),
    onPrimaryContainer = Color(0xFFBEEBF7),
    background = Color(0xFF1D1D29),
    onBackground = Color(0xFFFFFFFF),
    surface = Color(0xFF1D1D29),
    onSurface = Color(0xFFFFFFFF),
    onSurfaceVariant = Color(0xFFA0A0B0),
    surfaceContainerLowest = Color(0xFF16161F),
    surfaceContainerLow = Color(0xFF23233A),
    surfaceContainer = Color(0xFF272740),
    surfaceContainerHigh = Color(0xFF2F2F4A),
    surfaceContainerHighest = Color(0xFF383856),
    outline = Color(0xFF6E6E86),
    outlineVariant = Color(0x1FFFFFFF),
    secondaryContainer = Color(0xFF3A3A58),
    onSecondaryContainer = Color(0xFFFFFFFF),
)

private val LightScheme = lightColorScheme(
    primary = Color(0xFF006C84),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFBEEBF7),
    onPrimaryContainer = Color(0xFF001F27),
    background = Color(0xFFF0F2F5),
    onBackground = Color(0xFF121212),
    surface = Color(0xFFF0F2F5),
    onSurface = Color(0xFF121212),
    onSurfaceVariant = Color(0xFF5F6368),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFFFFFF),
    surfaceContainer = Color(0xFFFFFFFF),
    surfaceContainerHigh = Color(0xFFF4F5F8),
    surfaceContainerHighest = Color(0xFFE8EAEF),
    outline = Color(0xFF80838A),
    outlineVariant = Color(0x1F000000),
    secondaryContainer = Color(0xFFDDE3EA),
    onSecondaryContainer = Color(0xFF121212),
)

@Composable
fun XarxaTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) DarkScheme else LightScheme, content = content)
}

/** Foreground for text drawn on a Line-coloured badge (the web uses black on all of them). */
fun onLineColor(argb: Long): Color {
    val r = ((argb shr 16) and 0xFF) / 255.0
    val g = ((argb shr 8) and 0xFF) / 255.0
    val b = (argb and 0xFF) / 255.0
    val lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return if (lum > 0.35) Color.Black else Color.White
}

fun Long.toComposeColor(): Color = Color(this.toInt())

fun hexToArgb(hex: String): Long = (0xFF000000L or hex.removePrefix("#").toLong(16))
