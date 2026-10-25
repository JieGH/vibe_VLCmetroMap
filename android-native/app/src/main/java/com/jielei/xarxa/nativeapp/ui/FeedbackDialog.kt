package com.jielei.xarxa.nativeapp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jielei.xarxa.nativeapp.BuildConfig
import com.jielei.xarxa.nativeapp.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

@Composable
fun FeedbackDialog(onDismiss: () -> Unit) {
    var message by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sent by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(stringResource(R.string.feedback_title), fontWeight = FontWeight.Bold)
        },
        text = {
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (sent) {
                    Text(
                        stringResource(R.string.feedback_sent),
                        color = Color(0xFF4CAF50),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                } else {
                    Text(
                        stringResource(R.string.feedback_desc),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = message,
                        onValueChange = { message = it; error = null },
                        label = { Text(stringResource(R.string.feedback_placeholder)) },
                        minLines = 3,
                        maxLines = 6,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !sending,
                    )
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text(stringResource(R.string.feedback_email_optional)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !sending,
                    )
                    if (error != null) {
                        Text(
                            error!!,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !sending) {
                Text(stringResource(if (sent) R.string.done else R.string.feedback_cancel))
            }
        },
        confirmButton = {
            if (!sent) {
                Button(
                    onClick = {
                        if (message.isBlank()) return@Button
                        sending = true
                        error = null
                        scope.launch {
                            val success = withContext(Dispatchers.IO) {
                                sendFeedback(message.trim(), email.trim())
                            }
                            sending = false
                            if (success) {
                                sent = true
                            } else {
                                error = "Could not send feedback. Please check your connection."
                            }
                        }
                    },
                    enabled = message.isNotBlank() && !sending,
                ) {
                    if (sending) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp).padding(end = 4.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Text(stringResource(R.string.feedback_send))
                    }
                }
            }
        },
    )
}

private fun sendFeedback(message: String, email: String): Boolean {
    return try {
        val url = URL("https://xarxa.net/api/feedback")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
        conn.setRequestProperty("Accept", "application/json")

        val payload = JSONObject().apply {
            put("message", message)
            if (email.isNotBlank()) put("email", email)
            put("category", "Android Native")
            put("meta", JSONObject().apply {
                put("platform", "Android Native")
                put("version", BuildConfig.VERSION_NAME)
                put("build", BuildConfig.VERSION_CODE)
            })
        }

        conn.outputStream.use { os ->
            os.write(payload.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        conn.disconnect()
        code in 200..299
    } catch (_: Throwable) {
        false
    }
}
