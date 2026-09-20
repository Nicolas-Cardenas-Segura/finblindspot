import { describe, expect, it } from 'vitest';
import { emptyProfile } from '../src/core/profile';
import { applyAnswer, initialState, nextDomain, selectMode, confirmPending, conversationCommand, acknowledgeAnswer, conversationalBridge, welcomeMessage, conversationMessages } from '../src/core/interview';

describe('conversational wording and navigation', () => {
  it.each(['A quick check, please', 'Can we do a short check?', 'Let’s do a quick one', 'Yes please', 'Sure'])('accepts a natural quick-path choice: %s', text => {
    expect(conversationCommand(text, initialState())).toBe('/quick');
  });
  it.each(['The full check, please', 'I would like a more detailed look', 'Full'])('accepts a natural full-path choice: %s', text => {
    expect(conversationCommand(text, initialState())).toBe('/full');
  });
  it.each(['What is the difference between quick and full?', 'I work full time', 'Not the full one', 'A quick question about pensions'])('does not guess a path from ambiguous text: %s', text => {
    expect(conversationCommand(text, initialState())).toBeNull();
  });
  it('does not interpret yes as starting a path during an answer or confirmation', () => {
    expect(conversationCommand('yes', selectMode(initialState(), 'quick'))).toBeNull();
    expect(conversationCommand('yes', { ...initialState(), forgetRequested: true })).toBeNull();
    expect(conversationCommand('yes', { ...initialState(), pending: { domain: 'age', value: { status: 'known', value: 30 } } })).toBeNull();
  });
  it('accepts common navigation but never treats casual yes as deletion consent', () => {
    expect(conversationCommand('Show my report', initialState())).toBe('/report');
    expect(conversationCommand('Start fresh', initialState())).toBe('/forget');
    expect(conversationCommand('Cancel', initialState())).toBe('/cancel');
    expect(conversationCommand('Yes, delete it', { ...initialState(), forgetRequested: true })).not.toBe('/confirmforget');
  });
  it('acknowledges real values and uncertainty without judging financial health', () => {
    expect(acknowledgeAnswer('income', { status: 'known', value: { min: 3500, max: 4000, currency: 'EUR', period: 'monthly' } })).toContain('3,500–4,000 EUR per month');
    expect(acknowledgeAnswer('cash', { status: 'unknown' })).toContain('unknown');
    expect(acknowledgeAnswer('income', { status: 'skipped' })).toContain('skip');
    expect(acknowledgeAnswer('residency', { status: 'known', value: { country: 'ES', currency: 'EUR' } })).toContain('Spain');
  });
  it('does not prepend another model-generated question or unverified number', () => {
    expect(conversationalBridge('What is your currency?', 'fallback')).toBe('fallback');
    expect(conversationalBridge('Your savings cover 10 months.', 'fallback')).toBe('fallback');
    expect(conversationalBridge('We can work with an estimate.', 'fallback')).toBe('We can work with an estimate.');
  });
  it('keeps the AI identity, boundary, retention and choice in the welcome', () => {
    const welcome = welcomeMessage(7);
    expect(welcome).toContain('MyFinGap');
    expect(welcome).toContain('AI');
    expect(welcome).toContain('7 days');
    expect(welcome).toContain('/forget');
    expect(welcome).toContain(conversationMessages.choosePath);
  });
});

describe('interview state', () => {
  it('starts with a mode choice and then residency', () => {
    expect(initialState().mode).toBeNull();
    expect(nextDomain(selectMode(initialState(), 'quick'))).toBe('residency');
  });
  it('records unknown without replacing it with zero', () => {
    const result = applyAnswer(emptyProfile(), selectMode(initialState(), 'quick'), 'residency', { status: 'unknown' });
    expect(result.profile.residency.status).toBe('unknown');
    expect(nextDomain(result.state)).toBe('income');
  });
  it('requires confirmation before replacing a recorded answer', () => {
    const first = applyAnswer(emptyProfile(), selectMode(initialState(), 'full'), 'age', { status: 'known', value: 35 });
    const correction = applyAnswer(first.profile, first.state, 'age', { status: 'known', value: 36 });
    expect(correction.profile.age).toEqual({ status: 'known', value: 35 });
    expect(correction.state.pending?.domain).toBe('age');
    expect(confirmPending(correction.profile, correction.state, true).profile.age).toEqual({ status: 'known', value: 36 });
  });
  it('invalid data never advances the interview', () => {
    const state = selectMode(initialState(), 'quick');
    expect(() => applyAnswer(emptyProfile(), state, 'income', { status: 'known', value: -10 })).toThrow();
    expect(state.answered).toEqual([]);
  });
});
