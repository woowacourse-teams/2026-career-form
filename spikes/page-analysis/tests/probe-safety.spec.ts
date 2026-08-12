import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const root = join(import.meta.dirname, '..');

test('uses only activeTab and scripting permissions', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'extension', 'manifest.json'), 'utf8')) as {
    manifest_version: number; permissions: string[]; host_permissions?: string[];
  };

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(['activeTab', 'scripting']);
  expect(manifest.host_permissions).toBeUndefined();
});

test('probe sources contain no mutation persistence navigation or network APIs', async () => {
  const sources = await Promise.all([
    'popup.ts', 'probe.ts',
  ].map((file) => readFile(join(root, 'extension', file), 'utf8')));
  const combined = sources.join('\n');

  expect(combined).not.toMatch(/fetch\s*\(|XMLHttpRequest|chrome\.storage|\.click\s*\(|\.submit\s*\(|location\s*=|location\.(assign|replace)|window\.open|form\.requestSubmit/);
});
