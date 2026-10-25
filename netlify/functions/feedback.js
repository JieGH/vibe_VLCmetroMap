// Netlify & Cloudflare Workers serverless function for receiving direct in-app user feedback.
async function forwardToTelegram(env, { cleanMsg, email, metadata, timestamp }) {
  const token = env?.TELEGRAM_BOT_TOKEN || (typeof process !== 'undefined' && process.env?.TELEGRAM_BOT_TOKEN) || '8763009106:AAGwvWk6o8T0FXRVMZZuR6ANFopQ_wMB_mU';
  const chatId = env?.TELEGRAM_CHAT_ID || (typeof process !== 'undefined' && process.env?.TELEGRAM_CHAT_ID);

  if (!token || !chatId) return;

  try {
    const text =
      `📬 *New Feedback on Xarxa*\n\n` +
      `💬 *Message:*\n${cleanMsg}\n\n` +
      (email ? `📧 *Contact:* \`${email}\`\n` : '') +
      (metadata?.language ? `🌐 *Language:* \`${metadata.language}\`\n` : '') +
      (metadata?.screen ? `📱 *Screen:* \`${metadata.screen}\`\n` : '') +
      `⏱ *Time:* \`${timestamp}\``;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
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
