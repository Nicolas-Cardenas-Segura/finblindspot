import 'dotenv/config';
import { readConfig } from '../src/config/env';
import { WEBHOOK_PATH } from '../src/mastra/telegram';

const c = readConfig();
if (!process.argv.includes('--confirm')) throw new Error('This changes the live Telegram webhook. Run with --confirm only after approving the destination.');
if (!c.TELEGRAM_BOT_TOKEN || !c.TELEGRAM_WEBHOOK_SECRET_TOKEN || !c.PUBLIC_BASE_URL.startsWith('https://')) throw new Error('Configure Telegram credentials and public HTTPS before registration.');
try {
  const result = await fetch(`https://api.telegram.org/bot${c.TELEGRAM_BOT_TOKEN}/setWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: `${c.PUBLIC_BASE_URL.replace(/\/$/, '')}${WEBHOOK_PATH}`, secret_token: c.TELEGRAM_WEBHOOK_SECRET_TOKEN, allowed_updates: ['message'], drop_pending_updates: false }), signal: AbortSignal.timeout(15000) });
  const payload = await result.json() as { ok?: boolean };
  if (!result.ok || !payload.ok) throw new Error('registration_failed');
  console.log('Telegram webhook registered successfully.');
} catch { console.error('Telegram webhook registration failed; no credential details logged.'); process.exitCode = 1; }
