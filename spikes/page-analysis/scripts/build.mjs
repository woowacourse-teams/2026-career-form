import { copyFile, mkdir, rm } from 'node:fs/promises';

import { build } from 'esbuild';

const output = new URL('../dist/extension/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([
  build({ entryPoints: ['extension/probe.ts'], bundle: true, format: 'iife', outfile: 'dist/extension/probe.js' }),
  build({ entryPoints: ['extension/popup.ts'], bundle: true, format: 'iife', outfile: 'dist/extension/popup.js' }),
  copyFile(new URL('../extension/manifest.json', import.meta.url), new URL('manifest.json', output)),
  copyFile(new URL('../extension/popup.html', import.meta.url), new URL('popup.html', output)),
]);
