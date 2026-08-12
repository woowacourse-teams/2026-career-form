import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, type Page, test } from '@playwright/test';
import { build } from 'esbuild';

type Analysis = {
  controls: Array<{ control: string; status: string; required: boolean }>;
  boundaries: Array<{ kind: string; reason: string }>;
};

const analyzerPath = join(import.meta.dirname, '..', 'src', 'analyze-page.ts');

async function analyzeFixture(page: Page, fixture: string): Promise<Analysis> {
  await page.setContent(await readFile(join(import.meta.dirname, 'fixtures', fixture), 'utf8'));
  const result = await build({
    entryPoints: [analyzerPath], bundle: true, format: 'iife',
    globalName: 'CareerFormPageAnalysis', write: false, outdir: tmpdir(),
  });
  await page.addScriptTag({ content: result.outputFiles[0]?.text ?? '' });
  return page.evaluate(() => (
    globalThis as typeof globalThis & {
      CareerFormPageAnalysis: { analyzePage(root: Document): Analysis };
    }
  ).CareerFormPageAnalysis.analyzePage(document));
}

test('classifies nested native and custom combobox structures', async ({ page }) => {
  const result = await analyzeFixture(page, 'samsung-application.html');

  expect(result.controls).toContainEqual(expect.objectContaining({ control: 'text', status: 'supported' }));
  expect(result.controls).toContainEqual(expect.objectContaining({
    control: 'combobox', status: 'review-required', required: true,
  }));
});

test('classifies controls revealed by a user action and listbox structures', async ({ page }) => {
  await page.setContent(await readFile(join(import.meta.dirname, 'fixtures', 'sk-application.html'), 'utf8'));
  await page.locator('#reveal').click();
  const result = await analyzeFixtureFromCurrentPage(page);

  expect(result.controls).toContainEqual(expect.objectContaining({ control: 'textarea', status: 'supported' }));
  expect(result.controls).toContainEqual(expect.objectContaining({ control: 'listbox', status: 'review-required' }));
});

test('classifies ARIA controls and reports inaccessible frame structures', async ({ page }) => {
  const result = await analyzeFixture(page, 'cj-application.html');

  expect(result.controls).toContainEqual(expect.objectContaining({ control: 'contenteditable', status: 'review-required' }));
  expect(result.controls).toContainEqual(expect.objectContaining({ control: 'checkbox', status: 'review-required' }));
  expect(result.boundaries).toContainEqual({ kind: 'iframe', reason: 'inaccessible-frame', frameDepth: 1, shadowDepth: 0 });
});

async function analyzeFixtureFromCurrentPage(page: Page): Promise<Analysis> {
  const result = await build({
    entryPoints: [analyzerPath], bundle: true, format: 'iife',
    globalName: 'CareerFormPageAnalysis', write: false, outdir: tmpdir(),
  });
  await page.addScriptTag({ content: result.outputFiles[0]?.text ?? '' });
  return page.evaluate(() => (
    globalThis as typeof globalThis & {
      CareerFormPageAnalysis: { analyzePage(root: Document): Analysis };
    }
  ).CareerFormPageAnalysis.analyzePage(document));
}
