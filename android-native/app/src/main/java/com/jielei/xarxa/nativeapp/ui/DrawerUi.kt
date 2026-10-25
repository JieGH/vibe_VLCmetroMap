package com.jielei.xarxa.nativeapp.ui

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.DrawerState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import com.jielei.xarxa.nativeapp.R
import com.jielei.xarxa.nativeapp.domain.LineInfo

@Composable
fun XarxaDrawer(
    lines: List<LineInfo>,
    filter: Set<String>,
    themeMode: ThemeMode,
    onTheme: (ThemeMode) -> Unit,
    onLine: (String) -> Unit,
    onAbout: () -> Unit,
) {
    ModalDrawerSheet(drawerContainerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 16.dp)) {
            Column(Modifier.padding(horizontal = 28.dp).padding(top = 28.dp, bottom = 16.dp)) {
                Text("Xarxa", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold)
                Text(
                    stringResource(R.string.app_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            DrawerLabel(stringResource(R.string.drawer_language))
            val lang = LocalConfiguration.current.locales[0].language
            val langs = listOf("en" to "English", "es" to "Español")
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
                langs.forEachIndexed { i, (code, name) ->
                    SegmentedButton(
                        selected = (lang == code),
                        onClick = { AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(code)) },
                        shape = SegmentedButtonDefaults.itemShape(i, langs.size),
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) { Text(name) }
                }
            }
            DrawerLabel(stringResource(R.string.drawer_theme))
            val modes = listOf(
                ThemeMode.System to R.string.theme_system,
                ThemeMode.Light to R.string.theme_light,
                ThemeMode.Dark to R.string.theme_dark,
            )
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
                modes.forEachIndexed { i, (mode, label) ->
                    SegmentedButton(
                        selected = themeMode == mode,
                        onClick = { onTheme(mode) },
                        shape = SegmentedButtonDefaults.itemShape(i, modes.size),
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) { Text(stringResource(label)) }
                }
            }
            HorizontalDivider(Modifier.padding(horizontal = 28.dp, vertical = 12.dp))
            NavigationDrawerItem(
                label = { Text(stringResource(R.string.about_legal)) },
                icon = { Icon(Icons.Filled.Info, contentDescription = null) },
                selected = false,
                onClick = onAbout,
                modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding).heightIn(min = 48.dp),
            )
        }
    }
}

@Composable
private fun DrawerLabel(text: String) {
    Text(
        text,
        modifier = Modifier.padding(horizontal = 28.dp).padding(top = 8.dp, bottom = 8.dp),
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
