import { afterEach, describe, expect, it } from 'vitest';
import {
  createLogger,
  errorData,
  getLogLevel,
  parseLevel,
  setLogLevel,
  setLogSink,
} from '../../src/log/logger.js';

const initialLevel = getLogLevel();

function capture(): string[] {
  const lines: string[] = [];
  setLogSink((l) => lines.push(l));
  return lines;
}

afterEach(() => {
  setLogLevel(initialLevel);
  setLogSink((l) => process.stderr.write(`${l}\n`));
});

describe('logger', () => {
  it('filters by level', () => {
    const lines = capture();
    const log = createLogger('t');
    setLogLevel('warn');
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    expect(lines.map((l) => l.split(/\s+/)[1])).toEqual(['WARN', 'ERROR']);
  });

  it('silent drops everything', () => {
    const lines = capture();
    setLogLevel('silent');
    createLogger('t').error('x');
    expect(lines).toEqual([]);
  });

  it('formats scope, message and data', () => {
    const lines = capture();
    setLogLevel('debug');
    createLogger('handler').child('sub').debug('state loaded', { userId: '1', n: 2 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.* DEBUG \[handler:sub\] state loaded \{ userId: '1', n: 2 \}$/);
  });

  it('time() logs duration and rethrows', async () => {
    const lines = capture();
    setLogLevel('debug');
    const log = createLogger('t');
    await expect(log.time('ok', async () => 1)).resolves.toBe(1);
    expect(lines[0]).toContain('DEBUG [t] ok { ms:');
    await expect(log.time('bad', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(lines[1]).toContain("ERROR [t] bad failed { ms:");
    expect(lines[1]).toContain("error: 'boom'");
  });

  it('parseLevel and errorData', () => {
    expect(parseLevel(' Debug ')).toBe('debug');
    expect(parseLevel('verbose')).toBeUndefined();
    expect(errorData(new TypeError('t'))).toMatchObject({ error: 't', name: 'TypeError' });
    expect(errorData('plain')).toEqual({ error: 'plain' });
  });
});
