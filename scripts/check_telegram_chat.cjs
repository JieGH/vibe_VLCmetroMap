#!/usr/bin/env node
const token = process.env.TELEGRAM_BOT_TOKEN || '8763009106:AAGwvWk6o8T0FXRVMZZuR6ANFopQ_wMB_mU';

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
