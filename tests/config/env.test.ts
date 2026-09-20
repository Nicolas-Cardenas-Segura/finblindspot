import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const full = {
  TELEGRAM_BOT_TOKEN: 't',
  NEBIUS_API_KEY: 'k',
  NEBIUS_BASE_URL: 'https://api.tokenfactory.nebius.com/v1/',
  GALTEA_API_KEY: '',
  DATABASE_PATH: './data/x.sqlite',
  NUDGE_TICK_SECONDS: '10',
  NUDGE_DEMO_MINUTES: '1',
};

describe('loadEnv', () => {
  it('returns a typed object when all keys are present', () => {
    const env = loadEnv(full);
    expect(env.TELEGRAM_BOT_TOKEN).toBe('t');
    expect(env.NUDGE_TICK_SECONDS).toBe(10);
    expect(env.NUDGE_DEMO_MINUTES).toBe(1);
    expect(env.GALTEA_API_KEY).toBeUndefined();
  });

  it('treats an empty NUDGE_DEMO_MINUTES as unset', () => {
    expect(loadEnv({ ...full, NUDGE_DEMO_MINUTES: '' }).NUDGE_DEMO_MINUTES).toBeUndefined();
  });

  it('throws naming the missing key', () => {
    const { NEBIUS_API_KEY: _omit, ...rest } = full;
    expect(() => loadEnv(rest)).toThrow(/NEBIUS_API_KEY/);
  });
});
