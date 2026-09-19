import { describe, expect, it } from 'vitest';
import { validBearer, RateLimiter } from '../src/server/access';
import { readConfig } from '../src/config/env';
import { OutboundGuard } from '../src/guardrail/classifier';

describe('access controls', () => {
  it('rejects missing, incorrect and differently sized bearer secrets', () => {
    const token = 'a'.repeat(32);
    expect(validBearer(undefined, token)).toBe(false);
    expect(validBearer('Bearer a', token)).toBe(false);
    expect(validBearer(`Bearer ${'b'.repeat(32)}`, token)).toBe(false);
    expect(validBearer(`Bearer ${token}`, token)).toBe(true);
    expect(validBearer('Bearer anything', undefined)).toBe(false);
  });
  it('bounds request rates and resets expired windows', () => {
    const limiter = new RateLimiter(2, 100);
    expect(limiter.accept('a', 1)).toBe(true);
    expect(limiter.accept('a', 2)).toBe(true);
    expect(limiter.accept('a', 3)).toBe(false);
    expect(limiter.accept('b', 3)).toBe(true);
    expect(limiter.accept('a', 101)).toBe(true);
  });
  it('does not silently choose ephemeral production storage', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow();
    expect(() => readConfig({ TELEGRAM_BOT_TOKEN: 'configured' })).toThrow();
    expect(() => readConfig({ EVAL_API_TOKEN: 'short' })).toThrow();
  });
  it('withholds every candidate and fallback when no classifier is configured', async () => {
    expect((await new OutboundGuard(null, 'unconfigured').approve('A safe deterministic greeting.')).response).toBeNull();
  });
});
