import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createClient } from '@libsql/client';

export async function prepareDatabase(url: string): Promise<void> {
  if (url.startsWith('file:') && url !== 'file::memory:') await mkdir(dirname(resolve(url.slice(5))), { recursive: true, mode: 0o700 });
}
export const openDatabase = (url: string) => createClient({ url });
