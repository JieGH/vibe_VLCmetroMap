// Netlify & Cloudflare Workers serverless function for receiving direct in-app user feedback.
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function extractClientInfo(req) {
  const getHeader = (name) => {
    try {
      if (typeof req?.headers?.get === 'function') return req.headers.get(name);
      if (req?.headers && typeof req.headers === 'object') return req.headers[name.toLowerCase()] || req.headers[name];
    } catch {
      // ignore
    }
    return null;
  };

  const ip =
    getHeader('cf-connecting-ip') ||
    getHeader('x-nf-client-connection-ip') ||
    getHeader('x-real-ip') ||
    (getHeader('x-forwarded-for') ? getHeader('x-forwarded-for').split(',')[0].trim() : null) ||
    'Unknown';

  const country =
    getHeader('cf-ipcountry') ||
    getHeader('x-country') ||
    req?.cf?.country ||
    null;

  const city =
    getHeader('cf-ipcity') ||
    req?.cf?.city ||
    null;

  const region =
    req?.cf?.region ||
    null;

  return { ip, country, city, region };
}

export function formatTelegramMessage({ cleanMsg, email, clientInfo, metadata, timestamp }) {
  const geoParts = [clientInfo?.city, clientInfo?.region, clientInfo?.country].filter(Boolean);
  const geoStr = geoParts.length > 0 ? ` (${escapeHtml(geoParts.join(', '))})` : '';
  const ipStr = clientInfo?.ip ? `<code>${escapeHtml(clientInfo.ip)}</code>${geoStr}` : '<code>Unknown</code>';

  const versionStr = metadata?.appVersion
    ? `v${escapeHtml(metadata.appVersion)}${metadata?.gitSha ? ` (${escapeHtml(metadata.gitSha)})` : ''}`
    : '';

  const lines = [
    `📬 <b>New Feedback on Xarxa</b>\n`,
    `💬 <b>Message:</b>`,
    `${escapeHtml(cleanMsg)}\n`,
    `👤 <b>User & Device Info:</b>`,
    `• <b>IP:</b> ${ipStr}`,
  ];

  if (metadata?.platform) {
    lines.push(`• <b>Platform:</b> ${escapeHtml(metadata.platform)}`);
  }
  if (metadata?.device && metadata.device !== 'Unknown') {
    lines.push(`• <b>Device:</b> ${escapeHtml(metadata.device)}`);
  }
  if (metadata?.screen) {
    lines.push(`• <b>Screen:</b> <code>${escapeHtml(metadata.screen)}</code>`);
  }
  if (metadata?.timezone) {
    lines.push(`• <b>Timezone:</b> <code>${escapeHtml(metadata.timezone)}</code>`);
  }
  if (metadata?.language) {
    lines.push(`• <b>Language:</b> <code>${escapeHtml(metadata.language)}</code>`);
  }
  if (versionStr) {
    lines.push(`• <b>Version:</b> <code>${versionStr}</code>`);
  }
  if (email) {
    lines.push(`• <b>Contact:</b> <code>${escapeHtml(email)}</code>`);
  }
  lines.push(`⏱ <b>Time:</b> <code>${escapeHtml(timestamp)}</code>`);

  return lines.join('\n');
}

async function forwardToTelegram(env, { cleanMsg, email, clientInfo, metadata, timestamp }) {
  // Never fire real external notifications during tests
  if (
    (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || process.env?.VITEST)) ||
    env?.NODE_ENV === 'test'
  ) {
    return;
  }

  const token = env?.TELEGRAM_BOT_TOKEN || (typeof process !== 'undefined' && process.env?.TELEGRAM_BOT_TOKEN);
  const chatId = env?.TELEGRAM_CHAT_ID || (typeof process !== 'undefined' && process.env?.TELEGRAM_CHAT_ID) || '5007040501';

  if (!token || !chatId) return;

  try {
    const text = formatTelegramMessage({ cleanMsg, email, clientInfo, metadata, timestamp });

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

    const cleanMsg = data.message.trim().slice(0, 1000);
    const timestamp = new Date().toISOString();
    const clientInfo = extractClientInfo(req);
    const geoParts = [clientInfo.city, clientInfo.region, clientInfo.country].filter(Boolean);

    console.log('\n================== [FEEDBACK RECEIVED] ==================');
    console.log(`Time:     ${timestamp}`);
    console.log(`IP:       ${clientInfo.ip}${geoParts.length ? ` (${geoParts.join(', ')})` : ''}`);
    console.log(`Message:  ${cleanMsg}`);
    if (data.email) console.log(`Email:    ${data.email}`);
    if (data.metadata) console.log(`Metadata: ${JSON.stringify(data.metadata)}`);
    console.log('=========================================================\n');

    // Forward to Telegram if chat ID is configured
    try {
      await forwardToTelegram(env, {
        cleanMsg,
        email: data.email,
        clientInfo,
        metadata: data.metadata,
        timestamp,
      });
    } catch {
      // Non-blocking
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Feedback received',
      receivedMessage: cleanMsg,
      clientIp: clientInfo.ip,
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
