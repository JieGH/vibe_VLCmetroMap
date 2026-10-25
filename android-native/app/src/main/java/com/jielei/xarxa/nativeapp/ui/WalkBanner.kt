package com.jielei.xarxa.nativeapp.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jielei.xarxa.nativeapp.R
import com.jielei.xarxa.nativeapp.domain.WalkCategory
import com.jielei.xarxa.nativeapp.domain.formatDistance
import com.jielei.xarxa.nativeapp.domain.walkCategory
import com.jielei.xarxa.nativeapp.domain.walkingMinutes

/** Tonal container colours per walk length: a soft green, amber and coral, never an alarm red. */
private data class WalkTone(val container: Color, val onContainer: Color, val icon: ImageVector)

private fun tone(category: WalkCategory, dark: Boolean): WalkTone = when (category) {
    WalkCategory.Short -> WalkTone(
        if (dark) Color(0xFF1E4B26) else Color(0xFFD7F0D9), if (dark) Color(0xFFBDEBC0) else Color(0xFF0B3D12),
        Icons.AutoMirrored.Filled.DirectionsWalk,
    )
    WalkCategory.Medium -> WalkTone(
        if (dark) Color(0xFF54430A) else Color(0xFFFFF1C2), if (dark) Color(0xFFFFE08A) else Color(0xFF4A3800),
        Icons.Filled.Schedule,
    )
    WalkCategory.Long -> WalkTone(
        if (dark) Color(0xFF6A2F10) else Color(0xFFFFDCCB), if (dark) Color(0xFFFFC9B0) else Color(0xFF5A2100),
        Icons.Filled.Warning,
    )
}

/**
 * The floating "N min walk to <station> · <distance>" box above the sheet. [meters] is live: it follows the
 * latest fix. The icon changes with the category as well as the colour, so colour is never the only signal.
 */
@Composable
fun WalkBanner(station: String, meters: Double, dark: Boolean, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    val minutes = walkingMinutes(meters)
    // The configuration locale, not Locale.getDefault(): it changes the moment the language is switched.
    val locale = androidx.compose.ui.platform.LocalConfiguration.current.locales[0]
    val t = tone(walkCategory(minutes), dark)
    Surface(
        modifier = modifier.fillMaxWidth().padding(horizontal = 12.dp),
        shape = RoundedCornerShape(16.dp),
        color = t.container,
        contentColor = t.onContainer,
        shadowElevation = 6.dp,
    ) {
        Row(
            Modifier.heightIn(min = 48.dp).padding(start = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(t.icon, contentDescription = null, modifier = Modifier.size(22.dp))
            Text(
                stringResource(R.string.walk_to, minutes, station, formatDistance(meters, locale)),
                modifier = Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 10.dp),
                fontWeight = FontWeight.Medium,
            )
            IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.walk_dismiss))
            }
        }
    }
}
