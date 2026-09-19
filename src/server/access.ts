import { timingSafeEqual } from 'node:crypto';

export function validBearer(header: string | undefined, expected: string | undefined): boolean {
  if (!expected || !header?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7));
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}
export function validSecret(actual: string | undefined, expected: string | undefined): boolean {
  return validBearer(actual === undefined ? undefined : `Bearer ${actual}`, expected);
}
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  constructor(private maximum = 30, private duration = 60000) {}
  accept(key: string, now = Date.now()): boolean {
    if (this.windows.size > 10000) for (const [id, window] of this.windows) if (now - window.start >= this.duration) this.windows.delete(id);
    const entry = this.windows.get(key);
    if (!entry || now - entry.start >= this.duration) {
      if (this.windows.size >= 10000 && !entry) return false;
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.maximum;
  }
}
