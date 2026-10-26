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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jielei.xarxa.nativeapp.R

@Composable
fun WhatsNewDialog(
    onDismiss: () -> Unit,
    onContactAuthor: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = null,
        text = {
            Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState())) {
                Column(
                    Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    AppBadge(56.dp)
                    Text(
                        stringResource(R.string.whats_new_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    VersionPill()
                }
                HorizontalDivider()
                WhatsNewItem(R.string.whats_new_item1_title, R.string.whats_new_item1_desc)
                WhatsNewItem(R.string.whats_new_item2_title, R.string.whats_new_item2_desc)
                WhatsNewItem(R.string.whats_new_item3_title, R.string.whats_new_item3_desc)
                WhatsNewItem(R.string.whats_new_item4_title, R.string.whats_new_item4_desc)
                WhatsNewItem(R.string.whats_new_item5_title, R.string.whats_new_item5_desc)
            }
        },
        dismissButton = {
            TextButton(onClick = onContactAuthor, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.contact_author))
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.done))
            }
        },
    )
}

@Composable
private fun WhatsNewItem(titleRes: Int, descRes: Int) {
    Column(Modifier.padding(top = 12.dp)) {
        Text(stringResource(titleRes), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        Text(
            stringResource(descRes),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}
