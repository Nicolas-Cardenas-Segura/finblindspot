import 'dotenv/config';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { configuredAI } from './ai.js';
import { AssessmentService, help } from './interview.js';
import { Store } from './store.js';

const ai = configuredAI();
const store = new Store(process.env.MYFINGAP_DB || 'data/myfingap.db');
const service = new AssessmentService(store, ai);
const lines = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
console.log(`MyFinGap · ${ai ? 'AI-assisted' : 'structured, offline'} mode\n${help}\nSend /start to begin. Ctrl+D exits.`);
try {
  for await (const line of lines) {
    try { console.log('\n' + await service.reply('local-user', line) + '\n'); }
    catch { console.error('Unable to deliver this turn. Check service configuration, then use /resume or /report.'); }
  }
} finally {
  lines.close();
  store.close();
}
