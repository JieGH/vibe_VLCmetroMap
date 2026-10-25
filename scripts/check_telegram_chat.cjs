#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

let token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  try {
    const envContent = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf-8');
    const match = envContent.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m);
    if (match) token = match[1].trim();
  } catch {}
}

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in environment or .env');
  process.exit(1);
}

async function main() {
  console.log('Querying Telegram for recent messages to @Xraxa_bot...');
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram API error:', data);
      return;
    }
    const updates = data.result || [];
    if (updates.length === 0) {
      console.log('No messages found yet. Please open Telegram, search for @Xraxa_bot and press Start.');
      return;
    }
    console.log(`Found ${updates.length} update(s):`);
    for (const u of updates) {
      const msg = u.message || u.channel_post;
      if (msg) {
        console.log(`Chat ID: ${msg.chat.id} (${msg.from?.first_name || ''} @${msg.from?.username || ''}) - Text: "${msg.text || ''}"`);
      }
    }
  } catch (err) {
    console.error('Failed to query Telegram:', err.message);
  }
}

main();
