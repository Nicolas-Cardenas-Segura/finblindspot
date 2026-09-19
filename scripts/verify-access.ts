import 'dotenv/config';
import { readConfig } from '../src/config/env';
import { WEBHOOK_PATH } from '../src/mastra/telegram';

const base = readConfig().PUBLIC_BASE_URL;
const cases = [
  { path: '/health', method: 'GET', allowed: [200] },
  { path: '/ready', method: 'GET', allowed: [200] },
  { path: '/internal/agents', method: 'GET', allowed: [401, 403, 404] },
  { path: '/internal/memory/threads', method: 'GET', allowed: [401, 403, 404] },
  { path: '/api/eval/init', method: 'POST', allowed: [401] },
  { path: '/api/reports/invalid-token', method: 'GET', allowed: [404] },
  { path: WEBHOOK_PATH, method: 'POST', allowed: [401, 403, 404] },
];
let failed = false;
for (const entry of cases) {
  const response = await fetch(new URL(entry.path, base), { method: entry.method, headers: { 'Content-Type': 'application/json' }, ...(entry.method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(10000), redirect: 'manual' });
  const passed = entry.allowed.includes(response.status);
  console.log(JSON.stringify({ path: entry.path, status: response.status, passed }));
  if (!passed) failed = true;
}
for (const path of ['/', '/evidence', '/r/invalid']) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10000) });
  const html = await response.text();
  const privateHeaders = response.headers.get('cache-control') === 'no-store' && response.headers.get('referrer-policy') === 'no-referrer';
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
  let passed = response.ok && privateHeaders && assets.length >= 2;
  for (const asset of assets) if (!(await fetch(new URL(asset, base), { signal: AbortSignal.timeout(10000) })).ok) passed = false;
  console.log(JSON.stringify({ path, status: response.status, passed, assetCount: assets.length }));
  if (!passed) failed = true;
}
if (failed) process.exitCode = 1;
