package com.jielei.xarxa.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jielei.xarxa.nativeapp.theme.onLineColor
import com.jielei.xarxa.nativeapp.theme.toComposeColor

/** Line number on a Line-coloured rounded square. Decorative: callers describe the row. */
@Composable
fun LineBadge(line: String, colorArgb: Long, modifier: Modifier = Modifier, size: Dp = 28.dp) {
    Box(
        modifier = modifier
            .defaultMinSize(minWidth = size)
            .height(size)
            .background(colorArgb.toComposeColor(), RoundedCornerShape(size * 0.29f))
            .padding(horizontal = size * 0.25f)
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Text(line, color = onLineColor(colorArgb), fontWeight = FontWeight.Black, fontSize = (size.value * 0.5f).sp)
    }
}

/** "Línia 1: Bétera - Castelló" -> "Bétera - Castelló". */
fun lineTitle(name: String): String = name.substringAfter(':', name).trim()
