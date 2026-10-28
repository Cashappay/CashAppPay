const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Use native fetch if available (Node 18+), fallback to node-fetch
const fetch = globalThis.fetch || require('node-fetch');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Render zero-downtime deployment monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Secure backend proxy endpoint for payment alerts
app.post('/api/notify', async (req, res) => {
  const { sats, usdVal, receiver, invoice } = req.body;

  if (!sats || !invoice) {
    return res.status(400).json({ error: 'Missing required payment details' });
  }

  const shortInvoice = invoice.length > 40
    ? invoice.substring(0, 20) + '...' + invoice.substring(invoice.length - 15)
    : invoice;

  const message = `⚡ Lightning Invoice Created!\n\n` +
    `👤 Receiver: ${receiver || 'Merchant'}\n` +
    `💰 Amount: ${Number(sats).toLocaleString()} Sats (~$${usdVal})\n` +
    `🧾 Invoice: ${shortInvoice}`;

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId || botToken.includes('ReplaceMe')) {
      console.warn('⚠️ [Telegram Alert Skipped]: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing or still set to placeholder.');
      return res.json({ success: false, reason: 'Telegram credentials missing or placeholder in environment' });
    }

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message
      })
    });

    const data = await response.json();
    if (!data.ok) {
      console.error(`❌ [Telegram API Error]: ${data.error_code} - ${data.description}`);
      return res.status(502).json({ error: data.description || 'Telegram API error' });
    }

    console.log(`✅ [Telegram Alert Sent]: Successfully delivered invoice alert to chat ${chatId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ [Notification proxy error]:', err.message);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Fallback to index.html for any frontend navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Render provides PORT environment variable (default: 10000 on Render)
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Payment Server running on http://${HOST}:${PORT}`);
});
