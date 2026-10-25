package com.jielei.xarxa.nativeapp.ui

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import com.jielei.xarxa.nativeapp.BuildConfig
import com.jielei.xarxa.nativeapp.R

@Composable
fun XarxaDrawer(
    themeMode: ThemeMode,
    onTheme: (ThemeMode) -> Unit,
    onAbout: () -> Unit,
) {
    ModalDrawerSheet(drawerContainerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 16.dp)) {
            Row(
                Modifier.padding(horizontal = 28.dp).padding(top = 28.dp, bottom = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                AppBadge(56.dp)
                Column {
                    Text("Xarxa", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
                    Text(
                        stringResource(R.string.app_subtitle),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            HorizontalDivider(Modifier.padding(horizontal = 28.dp))

            val lang = LocalConfiguration.current.locales[0].language
            val langs = listOf("en" to "English", "es" to "Español")
            SettingRow(
                icon = Icons.Filled.Language,
                label = stringResource(R.string.drawer_language),
                value = langs.firstOrNull { it.first == lang }?.second ?: langs[0].second,
                options = langs.map { it.second },
                selectedIndex = langs.indexOfFirst { it.first == lang },
                onPick = { AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(langs[it].first)) },
            )
            val modes = listOf(
                ThemeMode.System to stringResource(R.string.theme_system),
                ThemeMode.Light to stringResource(R.string.theme_light),
                ThemeMode.Dark to stringResource(R.string.theme_dark),
            )
            SettingRow(
                icon = Icons.Filled.DarkMode,
                label = stringResource(R.string.drawer_theme),
                value = modes.first { it.first == themeMode }.second,
                options = modes.map { it.second },
                selectedIndex = modes.indexOfFirst { it.first == themeMode },
                onPick = { onTheme(modes[it].first) },
            )

            HorizontalDivider(Modifier.padding(horizontal = 28.dp, vertical = 12.dp))
            NavigationDrawerItem(
                label = { Text(stringResource(R.string.about_legal)) },
                icon = { Icon(Icons.Filled.Info, contentDescription = null) },
                selected = false,
                onClick = onAbout,
                modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding).heightIn(min = 48.dp),
            )
            VersionPill(Modifier.padding(horizontal = 28.dp).padding(top = 8.dp))
        }
    }
}

/** One settings line: icon, label, current value; tapping opens a menu of the options. */
@Composable
private fun SettingRow(
    icon: ImageVector,
    label: String,
    value: String,
    options: List<String>,
    selectedIndex: Int,
    onPick: (Int) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(28.dp))
                .clickable { open = true }.padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
            Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEachIndexed { i, name ->
                DropdownMenuItem(
                    text = { Text(name, fontWeight = if (i == selectedIndex) FontWeight.Bold else FontWeight.Normal) },
                    onClick = { open = false; onPick(i) },
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
        }
    }
}

/** The launcher icon on its own background, for the drawer and About headers. */
@Composable
fun AppBadge(size: Dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(size * 0.28f)).background(Color(0xFF1D1D29))) {
        Image(
            painterResource(R.drawable.ic_launcher_foreground),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(size).scale(1.5f),
        )
    }
}

/** Version at a glance: "v0.1.0" plus the build number. */
@Composable
fun VersionPill(modifier: Modifier = Modifier) {
    Surface(modifier, shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.secondaryContainer) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("v${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSecondaryContainer)
            Text(
                stringResource(R.string.about_build, BuildConfig.VERSION_CODE),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f),
            )
        }
    }
}
