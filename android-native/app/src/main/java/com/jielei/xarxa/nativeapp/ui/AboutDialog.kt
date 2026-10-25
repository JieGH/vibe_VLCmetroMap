package com.jielei.xarxa.nativeapp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.jielei.xarxa.nativeapp.R

private const val SOURCE_URL = "https://github.com/JieGH/vibe_VLCmetroMap"
private const val PRIVACY_URL = "https://github.com/JieGH/vibe_VLCmetroMap/blob/main/docs/android/privacy-policy.md"

@Composable
fun AboutDialog(onDismiss: () -> Unit) {
    val uri = LocalUriHandler.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = null,
        text = {
            Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState())) {
                Column(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    AppBadge(72.dp)
                    Text("Xarxa", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
                    VersionPill()
                    Text(
                        stringResource(R.string.about_tagline),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
                HorizontalDivider()
                Section(R.string.about_what_title, listOf(R.string.about_what_body))
                Section(R.string.about_copyright, listOf(R.string.about_license_summary))
                Section(R.string.about_data, listOf(R.string.about_operator, R.string.about_arrivals, R.string.about_osm, R.string.about_privacy))
                TextButton(onClick = { uri.openUri(PRIVACY_URL) }, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.about_privacy_link)) }
            }
        },
        dismissButton = {
            TextButton(onClick = { uri.openUri(SOURCE_URL) }, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.about_source)) }
        },
        confirmButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.done)) }
        },
    )
}

@Composable
private fun Section(title: Int, bodies: List<Int>) {
    Text(stringResource(title), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 14.dp))
    bodies.forEach {
        Text(stringResource(it), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
    }
}
