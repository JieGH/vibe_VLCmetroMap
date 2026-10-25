// Netlify & Cloudflare Workers serverless function for receiving direct in-app user feedback.
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function forwardToTelegram(env, { cleanMsg, email, metadata, timestamp }) {
  const token = env?.TELEGRAM_BOT_TOKEN || (typeof process !== 'undefined' && process.env?.TELEGRAM_BOT_TOKEN) || '8763009106:AAGwvWk6o8T0FXRVMZZuR6ANFopQ_wMB_mU';
  const chatId = env?.TELEGRAM_CHAT_ID || (typeof process !== 'undefined' && process.env?.TELEGRAM_CHAT_ID) || '5007040501';

  if (!token || !chatId) return;

  try {
    const text =
      `📬 <b>New Feedback on Xarxa</b>\n\n` +
      `💬 <b>Message:</b>\n${escapeHtml(cleanMsg)}\n\n` +
      (email ? `📧 <b>Contact:</b> <code>${escapeHtml(email)}</code>\n` : '') +
      (metadata?.language ? `🌐 <b>Language:</b> <code>${escapeHtml(metadata.language)}</code>\n` : '') +
      (metadata?.screen ? `📱 <b>Screen:</b> <code>${escapeHtml(metadata.screen)}</code>\n` : '') +
      `⏱ <b>Time:</b> <code>${escapeHtml(timestamp)}</code>`;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('[Telegram notification failed]', err?.message || err);
  }
}

export default async (req, env) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
    });
  }

  try {
    const data = await req.json();
    if (!data || typeof data.message !== 'string' || !data.message.trim()) {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanMsg = data.message.trim();
    const timestamp = new Date().toISOString();

    console.log('\n================== [FEEDBACK RECEIVED] ==================');
    console.log(`Time:     ${timestamp}`);
    console.log(`Message:  ${cleanMsg}`);
    if (data.email) console.log(`Email:    ${data.email}`);
    if (data.metadata) console.log(`Metadata: ${JSON.stringify(data.metadata)}`);
    console.log('=========================================================\n');

    // Forward to Telegram if chat ID is configured
    try {
      await forwardToTelegram(env, { cleanMsg, email: data.email, metadata: data.metadata, timestamp });
    } catch {
      // Non-blocking
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Feedback received',
      receivedMessage: cleanMsg,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/feedback' };
