import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import manifest from '../package.json';

it('loads dotenv in the start process before application modules are imported', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blindspot-startup-'));
  try {
    const path = join(directory, '.env');
    await writeFile(path, 'PORT=4199\n');
    const startupFlags = manifest.scripts.start.split(/\s+/).slice(1, -1);
    const output = execFileSync(process.execPath, [...startupFlags, '--input-type=module', '--eval', 'process.stdout.write(process.env.PORT ?? "missing")'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PORT: undefined, DOTENV_CONFIG_PATH: path },
    });
    expect(output).toBe('4199');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
