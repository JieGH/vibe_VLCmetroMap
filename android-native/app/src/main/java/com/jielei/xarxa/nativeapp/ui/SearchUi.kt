package com.jielei.xarxa.nativeapp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.jielei.xarxa.nativeapp.R
import com.jielei.xarxa.nativeapp.domain.Station
import com.jielei.xarxa.nativeapp.domain.SearchResult
import com.jielei.xarxa.nativeapp.theme.toComposeColor

/** The pill at the top: menu button, query field, clear button. */
@Composable
fun SearchPill(
    query: String,
    onQueryChange: (String) -> Unit,
    onMenu: () -> Unit,
    onFocusChange: (Boolean) -> Unit,
    focusRequester: FocusRequester,
    modifier: Modifier = Modifier,
) {
    val focusManager = LocalFocusManager.current
    val searchAria = stringResource(R.string.search_aria)
    Surface(
        modifier = modifier.fillMaxWidth().heightIn(min = 56.dp),
        shape = RoundedCornerShape(28.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        tonalElevation = 3.dp,
        shadowElevation = 6.dp,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onMenu, modifier = Modifier.size(56.dp)) {
                Icon(Icons.Filled.Menu, contentDescription = stringResource(R.string.open_menu))
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (query.isEmpty()) {
                    Text(
                        stringResource(R.string.search_placeholder),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                BasicTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() }),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .focusRequester(focusRequester)
                        .onFocusChanged { onFocusChange(it.isFocused) }
                        .semantics { contentDescription = searchAria },
                    decorationBox = { inner -> Box(Modifier.heightIn(min = 48.dp), contentAlignment = Alignment.CenterStart) { inner() } },
                )
            }
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.clear_search))
                }
            } else {
                Icon(
                    Icons.Filled.Search, contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(end = 16.dp),
                )
            }
        }
    }
}

@Composable
fun SearchResults(
    results: List<SearchResult>,
    lineColors: Map<String, Long>,
    onLine: (String) -> Unit,
    onStation: (com.jielei.xarxa.nativeapp.domain.Station) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        tonalElevation = 3.dp,
        shadowElevation = 6.dp,
    ) {
        if (results.isEmpty()) {
            Text(
                stringResource(R.string.search_no_results),
                modifier = Modifier.padding(20.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Surface
        }
        val lines = results.filterIsInstance<SearchResult.LineHit>()
        val stations = results.filterIsInstance<SearchResult.StationHit>()
        LazyColumn(contentPadding = PaddingValues(vertical = 8.dp)) {
            if (lines.isNotEmpty()) {
                item(key = "h-lines") { SectionHeader(stringResource(R.string.search_lines)) }
                items(lines, key = { "l-" + it.line.id }) { hit ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable { onLine(hit.line.id) }
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        LineBadge(hit.line.id, hit.line.colorArgb)
                        Column {
                            Text(stringResource(R.string.line_prefix, hit.line.id), fontWeight = FontWeight.SemiBold)
                            Text(
                                lineTitle(hit.line.name), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
            if (stations.isNotEmpty()) {
                item(key = "h-stations") { SectionHeader(stringResource(R.string.search_stations)) }
                items(stations, key = { "s-" + it.station.id }) { hit ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable { onStation(hit.station) }
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(hit.station.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                stringResource(R.string.station_lines, hit.station.lines.joinToString(", ")),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            hit.station.lines.take(4).forEach { l ->
                                Box(
                                    Modifier.size(10.dp).background((lineColors[l] ?: 0xFF888888).toComposeColor(), CircleShape),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * What the dropdown shows before anything is typed: two halves side by side, popular stations on the left and a
 * grid of Line badges on the right. Compact on purpose, no scrolling for the usual 7 stations and 9 lines.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun SearchSuggestions(
    hubs: List<Station>,
    lines: List<com.jielei.xarxa.nativeapp.domain.LineInfo>,
    lineColors: Map<String, Long>,
    onLine: (String) -> Unit,
    onStation: (Station) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        tonalElevation = 3.dp,
        shadowElevation = 6.dp,
    ) {
        Row(Modifier.padding(horizontal = 6.dp, vertical = 8.dp)) {
            Column(Modifier.weight(1f)) {
                SectionHeader(stringResource(R.string.search_popular))
                hubs.take(6).forEach { st ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(12.dp))
                            .clickable { onStation(st) }.padding(horizontal = 10.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            st.name, Modifier.weight(1f), fontWeight = FontWeight.SemiBold,
                            style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                            st.lines.take(4).forEach { l ->
                                Box(Modifier.size(8.dp).background((lineColors[l] ?: 0xFF888888).toComposeColor(), CircleShape))
                            }
                        }
                    }
                }
            }
            Box(Modifier.width(1.dp).heightIn(min = 100.dp).background(MaterialTheme.colorScheme.outlineVariant).align(Alignment.CenterVertically))
            Column(Modifier.weight(1f).padding(start = 6.dp)) {
                SectionHeader(stringResource(R.string.search_lines))
                androidx.compose.foundation.layout.FlowRow(
                    Modifier.padding(horizontal = 6.dp),
                    maxItemsInEachRow = 3,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    lines.forEach { l ->
                        val desc = stringResource(R.string.line_prefix, l.id)
                        Box(
                            Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).clickable { onLine(l.id) }
                                .semantics { contentDescription = desc },
                            contentAlignment = Alignment.Center,
                        ) { LineBadge(l.id, l.colorArgb, size = 32.dp) }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text.uppercase(),
        modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 4.dp),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = FontWeight.Bold,
    )
}

/**
 * Dismissible filter chips under the search pill: one chip per active Line (line-color dot).
 * The drawer's line list sets the filter; tapping the chip clears it.
 */
@Composable
fun HubChips(
    lineColors: Map<String, Long>,
    activeLines: Set<String>,
    onClearLine: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (activeLines.isEmpty()) return
    LazyRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = 12.dp),
    ) {
        items(activeLines.toList().sorted(), key = { "line-$it" }) { id ->
            val desc = stringResource(R.string.filter_clear_desc, id)
            FilterChip(
                selected = true,
                onClick = { onClearLine(id) },
                label = { Text(id, fontWeight = FontWeight.Bold) },
                leadingIcon = { Box(Modifier.size(12.dp).background((lineColors[id] ?: 0xFF888888).toComposeColor(), CircleShape)) },
                trailingIcon = { Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp)) },
                modifier = Modifier.semantics { contentDescription = desc },
                shape = RoundedCornerShape(16.dp),
                colors = chipColors(),
                elevation = androidx.compose.material3.FilterChipDefaults.filterChipElevation(elevation = 3.dp),
            )
        }
    }
}

@Composable
private fun chipColors() = androidx.compose.material3.FilterChipDefaults.filterChipColors(
    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
    selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
)
