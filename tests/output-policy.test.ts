import { describe, expect, it } from 'vitest';
import { parseVerdict, prefilter, approveCandidate } from '../src/guardrail/output-policy';
import { checkInput } from '../src/guardrail/input-policy';
import { privacyMessages, questions } from '../src/core/interview';

describe('delivery protocol, not model accuracy', () => {
  it.each(['', 'ALLOW', '{"decision":"ALLOW"}', '{"decision":"allow","reasonCode":"educational"}', '{"decision":"ALLOW","reasonCode":"educational","extra":1}'])('fails closed on %s', raw => {
    expect(parseVerdict(raw)).toBeNull();
  });
  it('parses only strict complete verdicts', () => {
    expect(parseVerdict('{"decision":"ALLOW","reasonCode":"educational"}')?.decision).toBe('ALLOW');
  });
  it('recognises obvious obfuscated directives without serving as an allowlist', () => {
    expect(prefilter('You should b\u200buy VWCE.')).toBe(true);
    expect(prefilter('Emergency runway describes cash relative to expenditure.')).toBe(false);
  });
  it('rejects any unclassified candidate, even a deterministic fallback', () => {
    expect(approveCandidate('Educational message.', null)).toBeNull();
    expect(approveCandidate('Educational message.', { decision: 'BLOCK', reasonCode: 'advice' })).toBeNull();
  });
  it('does not let an ALLOW verdict override the deterministic deny check', () => {
    expect(approveCandidate('You should buy this ETF.', { decision: 'ALLOW', reasonCode: 'educational' })).toBeNull();
  });
  it.each(Object.entries(questions))('still requires an independent verdict for the %s question', (_domain, question) => {
    expect(prefilter(question)).toBe(false);
    expect(approveCandidate(question, null)).toBeNull();
    expect(approveCandidate(question, { decision: 'BLOCK', reasonCode: 'sensitive' })).toBeNull();
    expect(approveCandidate(question, { decision: 'ALLOW', reasonCode: 'educational' })?.text).toBe(question);
  });
  it.each(Object.entries(privacyMessages))('requires classification for the %s privacy message', (_name, message) => {
    expect(prefilter(message)).toBe(false);
    expect(approveCandidate(message, null)).toBeNull();
    expect(approveCandidate(message, { decision: 'BLOCK', reasonCode: 'uncertain' })).toBeNull();
    expect(approveCandidate(message, { decision: 'ALLOW', reasonCode: 'educational' })?.text).toBe(message);
  });
  it('returns an approved value only for safe, classified text', () => {
    expect(approveCandidate('Emergency runway measures accessible cash relative to spending.', { decision: 'ALLOW', reasonCode: 'educational' })?.text).toContain('Emergency runway');
  });
  it.each(['My IBAN is ES9121000418450200051332', 'My card number is 4111 1111 1111 1111', 'passport: ABC123456', 'password=hunter2', 'tax ID: 123456789'])('rejects sensitive input', text => {
    expect(checkInput(text).accepted).toBe(false);
  });
  it('accepts ordinary estimates without storing identifying data', () => {
    expect(checkInput('Around 2500 EUR per month.').accepted).toBe(true);
    expect(checkInput('x'.repeat(4001)).accepted).toBe(false);
  });
});
