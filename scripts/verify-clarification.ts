import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../src/config/env';
import { questions } from '../src/core/interview';

async function main() {
  const config = readConfig();
  if (!config.EVAL_API_TOKEN || !config.NEBIUS_API_KEY) throw new Error('Configure evaluation and model credentials');
  const base = new URL(config.PUBLIC_BASE_URL);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) throw new Error('Use HTTPS or loopback');
  const ids = [`clarify-${randomUUID()}`, `opening-${randomUUID()}`];
  async function post(path: string, body: unknown) {
    const response = await fetch(new URL(path, base), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.EVAL_API_TOKEN}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    return { status: response.status, body: await response.json() as { response?: string; closed?: boolean } };
  }
  async function turn(id: string, message: string, name: string, expected: (text: string) => boolean) {
    const result = await post('/api/eval/message', { galtea_session_id: id, message, turn_id: randomUUID() });
    const passed = result.status === 200 && typeof result.body.response === 'string' && expected(result.body.response);
    console.log(JSON.stringify({ check: name, status: result.status, passed }));
    if (!passed) { console.log(JSON.stringify({ syntheticReply: result.body.response ?? null })); throw new Error('Clarification check failed'); }
  }
  const currencyOnly = (text: string) => text.includes('Spain') && text.includes('report') && !text.includes(questions.residency);
  try {
    await turn(ids[0], '/full', 'full_path_starts', text => text.includes(questions.residency));
    await turn(ids[0], 'spain, dollars and euros', 'mixed_currencies_ask_only_reporting_choice', currencyOnly);
    await turn(ids[0], 'spain, i have dollars and euros at the same time', 'repeated_explanation_preserves_country', currencyOnly);
    await turn(ids[0], 'euros', 'currency_only_reply_completes_residency', text => text.includes('Spain') && text.includes('EUR') && text.includes(questions.income));
    await turn(ids[0], '4000', 'bare_amount_does_not_inherit_reporting_currency', text => text.includes('4,000') && text.includes('Which currency') && !text.includes(questions.income));
    await turn(ids[0], 'US dollars', 'currency_reply_completes_previous_amount', text => text.includes('4,000 USD per month') && text.includes(questions.expenses));
    await turn(ids[1], 'Hi', 'opening_welcome', text => text.includes('MyFinGap'));
    await turn(ids[1], 'i dont know what to do with my finance i have dollars but i live in spain i dont know my wealth', 'opening_concern_acknowledged', text => text.includes('kept the country'));
    await turn(ids[1], 'fuller look', 'opening_country_survives_path_choice', currencyOnly);
    await turn(ids[1], 'EUR', 'opening_currency_reply_advances', text => text.includes('Spain') && text.includes(questions.income));
  } finally {
    for (const id of ids) {
      try {
        const result = await post('/api/eval/finalize', { galtea_session_id: id });
        const passed = result.status === 404 || (result.status === 200 && result.body.closed === true);
        console.log(JSON.stringify({ check: 'clarification_test_cleanup', status: result.status, passed }));
        if (!passed) process.exitCode = 1;
      } catch { console.error('Synthetic clarification-session cleanup failed; sensitive details withheld.'); process.exitCode = 1; }
    }
  }
}
main().catch(() => { console.error('Clarification verification failed; no sensitive error payload logged.'); process.exitCode = 1; });
