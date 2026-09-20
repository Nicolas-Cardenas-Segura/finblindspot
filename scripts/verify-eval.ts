import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../src/config/env';
import { privacyMessages, conversationMessages, questions, acknowledgeAnswer } from '../src/core/interview';

async function main() {
  const config = readConfig();
  if (!config.EVAL_API_TOKEN || !config.NEBIUS_API_KEY) throw new Error('Configure evaluation and model credentials before this live check');
  const base = new URL(config.PUBLIC_BASE_URL);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) throw new Error('Use HTTPS or a loopback address');
  const nativeIds = [`smoke-${randomUUID()}`, `smoke-${randomUUID()}`];
  const active = new Map<string, string>();
  let legacyId: string | undefined;
  async function post(path: string, body: unknown, secret: string | null = config.EVAL_API_TOKEN!) {
    const response = await fetch(new URL(path, base), {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json() as { response?: string; session_id?: string; closed?: boolean; error?: string };
    return { status: response.status, payload };
  }
  function check(name: string, passed: boolean, status: number) {
    console.log(JSON.stringify({ check: name, passed, status }));
    if (!passed) throw new Error('Evaluation smoke check failed');
  }
  async function message(id: string, text: string, turnId = randomUUID()) {
    const result = await post('/api/eval/message', { galtea_session_id: id, message: text, turn_id: turnId });
    if (result.payload.session_id) active.set(id, result.payload.session_id);
    return result;
  }
  try {
    let result = await post('/api/eval/message', { galtea_session_id: nativeIds[0], message: '/quick' }, null);
    check('missing_secret_rejected', result.status === 401, result.status);
    result = await post('/api/eval/message', { galtea_session_id: nativeIds[0], message: '/quick' }, 'invalid-test-secret');
    check('wrong_secret_rejected', result.status === 401, result.status);
    result = await post('/api/eval/message', { session_id: 'thread_abc123', message: '/start' });
    check('uninitialized_external_placeholder_rejected', result.status === 400, result.status);
    result = await post('/api/eval/message', { galtea_session_id: '{{ galtea_session_id }}', message: '/start' });
    check('unrendered_native_placeholder_rejected', result.status === 400, result.status);
    result = await message(nativeIds[0], 'Hi');
    check('natural_welcome', result.status === 200 && !!result.payload.response?.includes('MyFinGap') && !!result.payload.response?.includes(conversationMessages.choosePath), result.status);
    result = await message(nativeIds[0], 'A quick check, please');
    check('native_session_created_without_init', result.status === 200 && !!result.payload.session_id && !!result.payload.response?.includes(questions.residency), result.status);
    result = await message(nativeIds[0], 'Spain, EUR');
    check('native_session_preserves_residency', result.status === 200 && !!result.payload.response?.includes(acknowledgeAnswer('residency', { status: 'known', value: { country: 'ES', currency: 'EUR' } })) && !!result.payload.response?.includes('take-home income'), result.status);
    result = await message(nativeIds[1], 'Can we do a short check?');
    check('second_native_session_isolated', result.status === 200 && !!result.payload.response?.includes('Which country') && active.get(nativeIds[0]) !== active.get(nativeIds[1]), result.status);
    const turnId = randomUUID();
    result = await message(nativeIds[0], 'Continue', turnId);
    check('first_native_session_resumes', result.status === 200 && !!result.payload.response?.includes('take-home income'), result.status);
    const firstResponse = result.payload.response;
    result = await message(nativeIds[0], 'Continue', turnId);
    check('duplicate_turn_preserves_response', result.status === 200 && result.payload.response === firstResponse, result.status);
    result = await message(nativeIds[0], 'Start fresh');
    check('forget_confirmation_displayed', result.status === 200 && result.payload.response === privacyMessages.confirmForget, result.status);
    result = await message(nativeIds[0], '/resume');
    check('pending_forget_requires_confirmation', result.status === 200 && result.payload.response === privacyMessages.forgetPending, result.status);
    result = await message(nativeIds[0], 'Cancel');
    check('cancel_preserves_assessment', result.status === 200 && !!result.payload.response?.includes('take-home income'), result.status);
    result = await message(nativeIds[0], 'Start fresh');
    check('forget_confirmation_repeated', result.status === 200 && result.payload.response === privacyMessages.confirmForget, result.status);
    const forgottenId = active.get(nativeIds[0]);
    result = await message(nativeIds[0], '/confirmforget');
    check('confirmed_forget_acknowledged', result.status === 200 && result.payload.response === privacyMessages.forgotten, result.status);
    result = await post('/api/eval/message', { session_id: forgottenId, message: '/resume' });
    check('forgotten_internal_session_unavailable', result.status === 404, result.status);
    result = await message(nativeIds[0], '/quick');
    check('fresh_assessment_after_forget', result.status === 200 && !!result.payload.response?.includes('Which country') && result.payload.session_id !== forgottenId, result.status);
    result = await post('/api/eval/init', {});
    legacyId = result.payload.session_id;
    check('explicit_init_preserved', result.status === 200 && !!legacyId, result.status);
    result = await post('/api/eval/message', { session_id: legacyId, message: '/start', turn_id: randomUUID() });
    check('explicit_session_message_preserved', result.status === 200 && !!result.payload.response?.includes('financial education'), result.status);
    for (const [name, answer, expected] of [
      ['natural_residency', 'Spain, EUR', questions.income],
      ['natural_income', 'Around 4000 EUR per month', questions.expenses],
      ['natural_expenses', 'About 2000 EUR per month', questions.cash],
      ['natural_cash', '5400 EUR', questions.debt],
      ['natural_report', '0 EUR per month', 'Emergency runway: RED — 2.7 months'],
    ]) {
      result = await message(nativeIds[1], answer);
      check(name, result.status === 200 && !!result.payload.response?.includes(expected), result.status);
    }
    check('report_math_preserved', !!result.payload.response?.includes('Debt exposure: GREEN — 0%'), result.status);
  } finally {
    for (const id of nativeIds) {
      const internalId = active.get(id);
      try {
        const result = await post('/api/eval/finalize', { galtea_session_id: id });
        check('native_test_session_cleanup', result.status === 404 || (result.status === 200 && result.payload.closed === true), result.status);
        if (internalId) {
          const closed = await post('/api/eval/message', { session_id: internalId, message: '/resume' });
          check('closed_internal_session_unavailable', closed.status === 404, closed.status);
        }
      } catch { console.error('Native test-session cleanup check failed; sensitive details withheld.'); process.exitCode = 1; }
    }
    if (legacyId) {
      try {
        const result = await post('/api/eval/finalize', { session_id: legacyId });
        check('explicit_test_session_cleanup', result.status === 200 && result.payload.closed === true, result.status);
      } catch { console.error('Explicit test-session cleanup check failed; sensitive details withheld.'); process.exitCode = 1; }
    }
  }
}
main().catch(() => { console.error('Live evaluation check failed; check configuration and the preceding status results. No sensitive error payload logged.'); process.exitCode = 1; });
