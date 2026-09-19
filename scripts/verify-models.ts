import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { readConfig } from '../src/config/env';
import { createNebiusClient } from '../src/nebius/client';
import { OutboundGuard } from '../src/guardrail/classifier';
import { guardrailFixtures } from '../src/guardrail/fixtures';

async function main() {
const config = readConfig();
const client = createNebiusClient(config);
if (!client) throw new Error('Set NEBIUS_API_KEY securely before running this live verification.');
const catalogue = await client.models.list();
for (const model of [config.NEBIUS_INTERVIEW_MODEL, config.NEBIUS_CLASSIFIER_MODEL]) {
  if (!catalogue.data.some(entry => entry.id === model)) throw new Error(`Model not in live catalogue: ${model}`);
}
const schema = z.strictObject({ amount: z.number(), currency: z.string() });
const started = performance.now();
const result = await client.chat.completions.create({ model: config.NEBIUS_INTERVIEW_MODEL, messages: [{ role: 'system', content: 'Extract the reported amount and currency without calculating anything.' }, { role: 'user', content: 'My monthly essential expenses are approximately 2000 EUR.' }], response_format: zodResponseFormat(schema, 'smoke_extraction'), max_tokens: 100, temperature: 0 });
const parsed = schema.parse(JSON.parse(result.choices[0]?.message.content ?? ''));
if (parsed.amount !== 2000 || parsed.currency !== 'EUR') throw new Error('Synthetic extraction failed');
console.log(JSON.stringify({ check: 'extraction', passed: true, milliseconds: Math.round(performance.now() - started) }));
const guard = new OutboundGuard(client, config.NEBIUS_CLASSIFIER_MODEL);
let failed = 0;
for (const [index, fixture] of guardrailFixtures.entries()) {
  const start = performance.now();
  const outcome = await guard.check(fixture.message);
  const passed = outcome.decision === fixture.expected;
  if (!passed) failed++;
  console.log(JSON.stringify({ case: index + 1, passed, decision: outcome.decision, layer: outcome.layer, reasonCode: outcome.reasonCode, milliseconds: Math.round(performance.now() - start) }));
}
if (failed) process.exitCode = 1;
}
main().catch(() => { console.error('Live model verification failed. Check securely configured credentials, connectivity and model IDs. No sensitive error payload logged.'); process.exitCode = 1; });
