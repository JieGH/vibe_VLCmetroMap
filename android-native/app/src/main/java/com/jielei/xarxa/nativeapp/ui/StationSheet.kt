package com.jielei.xarxa.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jielei.xarxa.nativeapp.R
import com.jielei.xarxa.nativeapp.domain.ProjectedArrival
import com.jielei.xarxa.nativeapp.domain.Station
import com.jielei.xarxa.nativeapp.domain.StationFocus
import com.jielei.xarxa.nativeapp.domain.countdownColor
import com.jielei.xarxa.nativeapp.domain.countdownLabel
import com.jielei.xarxa.nativeapp.domain.countdownUnit
import com.jielei.xarxa.nativeapp.theme.Accent
import com.jielei.xarxa.nativeapp.theme.toComposeColor
import kotlin.math.roundToInt

@Composable
fun StationSheet(
    station: Station,
    focus: StationFocus?,
    lineColors: Map<String, Long>,
    dark: Boolean,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var dragPx by remember(station.id) { mutableFloatStateOf(0f) }
    val density = LocalDensity.current
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .offset { androidx.compose.ui.unit.IntOffset(0, dragPx.roundToInt().coerceAtLeast(0)) },
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
        tonalElevation = 3.dp,
        shadowElevation = 12.dp,
    ) {
        Column(Modifier.navigationBarsPadding()) {
            // Drag handle: swipe down dismisses.
            Box(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 28.dp)
                    .draggable(
                        orientation = Orientation.Vertical,
                        state = rememberDraggableState { dragPx = (dragPx + it).coerceAtLeast(0f) },
                        onDragStopped = {
                            if (dragPx > with(density) { 70.dp.toPx() }) onClose() else dragPx = 0f
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier.size(width = 36.dp, height = 4.dp)
                        .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.6f), CircleShape),
                )
            }
            val unheard = focus?.secondsUnheard
            val unheardLabel = when {
                unheard == null -> stringResource(R.string.station_never_fetched)
                unheard < 60 -> stringResource(R.string.station_just_now)
                else -> stringResource(R.string.station_min_ago, (unheard / 60.0).roundToInt())
            }
            val isFresh = focus?.isFresh == true
            val statusText = if (isFresh) stringResource(R.string.station_live) else stringResource(R.string.station_memory)
            val confirmed = stringResource(R.string.station_confirmed, unheardLabel)
            Row(
                Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        station.name,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.padding(top = 2.dp),
                    ) {
                        station.lines.forEach { l -> LineBadge(l, lineColors[l] ?: 0xFF888888, size = 22.dp) }
                        Icon(
                            if (isFresh) Icons.Filled.Sensors else Icons.Filled.Storage,
                            contentDescription = statusText,
                            tint = if (isFresh) Color(0xFF4CAF50) else Accent,
                            modifier = Modifier.padding(start = 4.dp).size(18.dp),
                        )
                        val recent = unheard != null && unheard < 60
                        Icon(
                            if (recent) Icons.Filled.CheckCircle else Icons.Filled.Schedule,
                            contentDescription = confirmed,
                            tint = if (recent) Color(0xFF4CAF50) else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
                IconButton(onClick = onClose, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.station_close))
                }
            }
            HorizontalDivider(Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.outlineVariant)

            val err = focus?.fetchError
            if (err != null) {
                Text(
                    err, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp), color = Color(0xFFFFB74D),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            val arrivals = focus?.arrivals.orEmpty()
            if (arrivals.isEmpty()) {
                Text(
                    stringResource(R.string.station_no_trains),
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            } else {
                // Header plus at most four rows; more arrivals scroll inside the list (the drag handle moves the sheet).
                LazyColumn(Modifier.heightIn(max = ROW_HEIGHT * VISIBLE_ROWS + 1.dp * (VISIBLE_ROWS - 1)).padding(horizontal = 12.dp)) {
                    itemsIndexed(arrivals) { i, a ->
                        ArrivalRow(a, lineColors, dark)
                        if (i < arrivals.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }
    }
}

private const val VISIBLE_ROWS = 4
private val ROW_HEIGHT = 56.dp

@Composable
private fun ArrivalRow(a: ProjectedArrival, lineColors: Map<String, Long>, dark: Boolean) {
    val due = stringResource(R.string.due)
    val label = countdownLabel(a.seconds, due)
    val unit = when (countdownUnit(a.seconds)) {
        "sec" -> stringResource(R.string.unit_sec)
        "min" -> stringResource(R.string.unit_min)
        else -> null
    }
    val spoken = stringResource(R.string.arrival_desc, a.line, a.destination, label + (unit?.let { " $it" } ?: ""))
    Row(
        Modifier.fillMaxWidth().heightIn(min = ROW_HEIGHT).padding(horizontal = 6.dp, vertical = 4.dp)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        LineBadge(a.line, lineColors[a.line] ?: 0xFF888888)
        Column(Modifier.weight(1f)) {
            Text(a.destination, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            a.arrival.vehicleId?.let {
                Text(
                    stringResource(R.string.station_vehicle, it),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.clearAndSetSemantics { }) {
            Text(
                label,
                color = countdownColor(a.seconds, dark).toComposeColor(),
                fontWeight = FontWeight.ExtraBold,
                fontSize = 20.sp,
            )
            if (unit != null) {
                Text(
                    unit, modifier = Modifier.padding(start = 3.dp, bottom = 2.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
