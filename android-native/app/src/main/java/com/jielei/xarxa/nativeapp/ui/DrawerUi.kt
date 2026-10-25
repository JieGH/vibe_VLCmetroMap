package com.jielei.xarxa.nativeapp.ui

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
    onWhatsNew: () -> Unit,
    onAbout: () -> Unit,
    onFeedback: () -> Unit,
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
            val langs = listOf("en" to "EN", "es" to "ES", "ca" to "VAL")
            val modes = listOf(
                ThemeMode.System to stringResource(R.string.theme_system),
                ThemeMode.Light to stringResource(R.string.theme_light),
                ThemeMode.Dark to stringResource(R.string.theme_dark),
            )

            // Unified settings row: Theme and Language side-by-side
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
                    .padding(top = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Theme 3-way toggle (Auto, Light, Dark)
                SingleChoiceSegmentedButtonRow(Modifier.weight(1f)) {
                    modes.forEachIndexed { i, (mode, _) ->
                        SegmentedButton(
                            selected = mode == themeMode,
                            onClick = { onTheme(mode) },
                            shape = SegmentedButtonDefaults.itemShape(i, modes.size),
                            modifier = Modifier.heightIn(min = 40.dp),
                            label = {
                                Text(
                                    when (mode) {
                                        ThemeMode.System -> "AUTO"
                                        ThemeMode.Light -> "☀"
                                        ThemeMode.Dark -> "☾"
                                    },
                                    maxLines = 1,
                                    fontWeight = FontWeight.Bold,
                                )
                            },
                        )
                    }
                }

                // Language 3-way toggle (EN, ES, VAL)
                SingleChoiceSegmentedButtonRow(Modifier.weight(1f)) {
                    langs.forEachIndexed { i, (code, label) ->
                        val selected = code == lang || (code == "ca" && lang.startsWith("ca"))
                        SegmentedButton(
                            selected = selected,
                            onClick = {
                                val tag = if (code == "ca") "ca-ES-valencia" else code
                                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))
                            },
                            shape = SegmentedButtonDefaults.itemShape(i, langs.size),
                            modifier = Modifier.heightIn(min = 40.dp),
                            label = { Text(label, maxLines = 1, fontWeight = FontWeight.Bold) },
                        )
                    }
                }
            }

            HorizontalDivider(Modifier.padding(horizontal = 28.dp, vertical = 12.dp))

            NavigationDrawerItem(
                label = { Text(stringResource(R.string.whats_new)) },
                icon = { Icon(Icons.Filled.AutoAwesome, contentDescription = null) },
                selected = false,
                onClick = onWhatsNew,
                modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding).heightIn(min = 48.dp),
            )

            NavigationDrawerItem(
                label = { Text(stringResource(R.string.about_legal)) },
                icon = { Icon(Icons.Filled.Info, contentDescription = null) },
                selected = false,
                onClick = onAbout,
                modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding).heightIn(min = 48.dp),
            )

            NavigationDrawerItem(
                label = { Text(stringResource(R.string.contact_author)) },
                icon = { Icon(Icons.Filled.Email, contentDescription = null) },
                selected = false,
                onClick = onFeedback,
                modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding).heightIn(min = 48.dp),
            )

            VersionPill(Modifier.padding(horizontal = 28.dp).padding(top = 8.dp))

            Text(
                stringResource(R.string.made_by),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier.padding(horizontal = 28.dp).padding(top = 16.dp),
            )
        }
    }
}

/** One setting: icon and label, then a segmented toggle with every option visible. */
@Composable
private fun SettingToggle(
    icon: ImageVector,
    label: String,
    options: List<String>,
    selectedIndex: Int,
    onPick: (Int) -> Unit,
) {
    Column(Modifier.padding(horizontal = 28.dp).padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(label, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            options.forEachIndexed { i, name ->
                SegmentedButton(
                    selected = i == selectedIndex,
                    onClick = { onPick(i) },
                    shape = SegmentedButtonDefaults.itemShape(i, options.size),
                    modifier = Modifier.heightIn(min = 48.dp),
                    label = { Text(name, maxLines = 1) },
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
