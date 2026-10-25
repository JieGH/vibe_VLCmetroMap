package com.jielei.xarxa.nativeapp.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.util.DisplayMetrics
import org.maplibre.android.maps.Style

/**
 * The web's train marker (MapView.jsx createVehicleMarker) as a bitmap: a 28 px disc, 2 px border, "L<line>"
 * at 10 px weight 800, filled with its Line colour inside a 90% white ring with white text. Live trains only:
 * Simulated Trains are not drawn.
 */
object TrainIcons {
    const val SIZE_DP = 28f
    /** Drawn at twice the pixel density so the marker stays sharp as the zoom curve enlarges it. */
    private const val SUPERSAMPLE = 2

    fun name(line: String) = "train-live-$line"

    fun addAll(style: Style, colors: Map<String, Long>, densityDpi: Int) {
        val scale = densityDpi / DisplayMetrics.DENSITY_DEFAULT.toFloat()
        for ((line, argb) in colors) style.addImage(name(line), render(line, argb.toInt(), scale * SUPERSAMPLE, densityDpi * SUPERSAMPLE))
        // Lines without a known colour fall back to this grey, as trainsJson does.
        style.addImage(name("?"), render("?", 0xFF888888.toInt(), scale * SUPERSAMPLE, densityDpi * SUPERSAMPLE))
    }

    private fun render(line: String, argb: Int, scale: Float, densityDpi: Int): Bitmap {
        val px = Math.round(SIZE_DP * scale)
        val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        bmp.density = densityDpi
        val c = Canvas(bmp)
        val border = 2f * scale
        val half = px / 2f
        val r = half - border / 2f
        val opaque = argb or (0xFF shl 24)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.style = Paint.Style.FILL; paint.color = opaque
        c.drawCircle(half, half, half, paint)
        paint.style = Paint.Style.STROKE; paint.strokeWidth = border; paint.color = 0xE6FFFFFF.toInt()
        c.drawCircle(half, half, r, paint)
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFFFFFF.toInt()
            // The number is a fixed share of the disc (a single digit 17/28, "10" 14/28) at every zoom: it lives in the bitmap.
            textSize = (if (line.length > 1) 14f else 17f) * scale
            typeface = Typeface.create(Typeface.DEFAULT, 800, false)
            textAlign = Paint.Align.CENTER
        }
        val label = if (line == "?") "" else line
        c.drawText(label, half, half - (text.descent() + text.ascent()) / 2f, text)
        return bmp
    }
}
