import { inspect } from 'node:util';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

export type LogData = Record<string, unknown>;

export interface Logger {
  readonly scope: string;
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
  child(scope: string): Logger;
  /** Runs `fn`, logging its duration and outcome at debug level. */
  time<T>(message: string, fn: () => Promise<T>, data?: LogData): Promise<T>;
}

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

let currentLevel: LogLevel = parseLevel(process.env.LOG_LEVEL) ?? 'info';
let sink: (line: string) => void = (line) => process.stderr.write(`${line}\n`);

export function parseLevel(raw: string | undefined): LogLevel | undefined {
  const value = raw?.trim().toLowerCase();
  return LOG_LEVELS.find((l) => l === value);
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

export function setLogSink(next: (line: string) => void): void {
  sink = next;
}

export function isEnabled(level: LogLevel): boolean {
  return RANK[level] >= RANK[currentLevel] && currentLevel !== 'silent';
}

export function errorData(error: unknown): LogData {
  if (error instanceof Error) {
    return { error: error.message, name: error.name, stack: error.stack };
  }
  return { error: String(error) };
}

function formatData(data: LogData | undefined): string {
  if (data === undefined || Object.keys(data).length === 0) return '';
  return ` ${inspect(data, { depth: 6, breakLength: 140, compact: true, colors: false })}`;
}

function emit(level: Exclude<LogLevel, 'silent'>, scope: string, message: string, data?: LogData): void {
  if (!isEnabled(level)) return;
  const ts = new Date().toISOString();
  sink(`${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${formatData(data)}`);
}

export function createLogger(scope: string): Logger {
  return {
    scope,
    debug: (m, d) => emit('debug', scope, m, d),
    info: (m, d) => emit('info', scope, m, d),
    warn: (m, d) => emit('warn', scope, m, d),
    error: (m, d) => emit('error', scope, m, d),
    child: (sub) => createLogger(`${scope}:${sub}`),
    async time(message, fn, data) {
      const started = Date.now();
      try {
        const result = await fn();
        emit('debug', scope, message, { ...data, ms: Date.now() - started });
        return result;
      } catch (error) {
        emit('error', scope, `${message} failed`, { ...data, ms: Date.now() - started, ...errorData(error) });
        throw error;
      }
    },
  };
}
