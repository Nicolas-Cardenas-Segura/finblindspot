import 'dotenv/config';
import { configuredAI } from './ai.js';
import { AssessmentService } from './interview.js';
import { Store } from './store.js';
import { createBot } from './telegram-bot.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN to run Telegram, or use npm run dev without credentials.');
const ai = configuredAI();
const store = new Store(process.env.MYFINGAP_DB || 'data/myfingap.db');
const bot = createBot(token, new AssessmentService(store, ai));
bot.catch(() => console.error('Telegram turn failed. No message content was logged. Use /resume or /report to recover.'));
const stop = () => { if (bot.isRunning()) void bot.stop(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
console.log(`MyFinGap Telegram · ${ai ? 'AI-assisted, independent outbound classifier' : 'structured mode, fixed text only'}`);
try { await bot.start(); } finally { store.close(); }
