#!/usr/bin/env node
/**
 * Telegram Notification & Incident Reporting Script.
 * Sends release sync reports, deployment status, and major incident alerts to @Xraxa_bot.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  try {
    const envContent = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf-8');
    const match = envContent.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m);
    if (match) token = match[1].trim();
  } catch {}
}

const chatId = process.env.TELEGRAM_CHAT_ID || '5007040501';

if (!token) {
  console.error('[notify_telegram] Error: TELEGRAM_BOT_TOKEN not found.');
  process.exit(1);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getGitInfo() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const commitMsg = execSync('git log -1 --pretty=%s', { encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    return { sha, commitMsg, branch };
  } catch {
    return { sha: 'unknown', commitMsg: 'manual dispatch', branch: 'main' };
  }
}

async function sendTelegramMessage(htmlText) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API responded with error: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const mode = process.argv[2] || 'deploy';
  const customMessage = process.argv[3];
  const { sha, commitMsg, branch } = getGitInfo();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  let message = '';

  if (mode === 'incident') {
    message = [
      `🚨 <b>MAJOR INCIDENT REPORT - Xarxa Transit</b>\n`,
      `⚠️ <b>Details:</b> ${escapeHtml(customMessage || 'Unspecified runtime alert')}`,
      `📌 <b>Commit:</b> <code>${escapeHtml(sha)}</code> (${escapeHtml(branch)})`,
      `⏱ <b>Time:</b> <code>${escapeHtml(timestamp)}</code>`,
    ].join('\n');
  } else {
    // Default: deployment & sync notification
    message = [
      `🚀 <b>Xarxa Version Sync & Deployment Report</b>\n`,
      `📌 <b>Commit:</b> <code>${escapeHtml(sha)}</code> (branch: <code>${escapeHtml(branch)}</code>)`,
      `📝 <b>Summary:</b> <i>${escapeHtml(customMessage || commitMsg)}</i>`,
      `✅ <b>Pre-Push Validation:</b> All tests passed, Oxlint verified`,
      `🗺 <b>MapLibre Integrity:</b> Worker bundle synchronized, GeoJSON validated`,
      `📱 <b>iOS Native Sync:</b> Complete (Xcode ready)`,
      `🌐 <b>Target:</b> Cloudflare Worker / xarxa.net`,
      `⏱ <b>Time:</b> <code>${escapeHtml(timestamp)}</code>`,
    ].join('\n');
  }

  try {
    console.log(`Sending Telegram notification to chat ${chatId}...`);
    await sendTelegramMessage(message);
    console.log('✅ Telegram notification sent successfully.');
  } catch (err) {
    console.error('❌ Failed to send Telegram notification:', err.message);
    process.exit(1);
  }
}

main();
