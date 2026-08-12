import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, type Page, test } from '@playwright/test';
import { build } from 'esbuild';

type Control = {
  element: string;
  control: string;
  status: 'supported' | 'review-required' | 'unsupported';
  reasons: string[];
  required: boolean;
  frameDepth: number;
  shadowDepth: number;
};

type Analysis = {
  controls: Control[];
  boundaries: Array<{ kind: string; reason: string; frameDepth: number; shadowDepth: number }>;
};

const fixturePath = join(import.meta.dirname, 'fixtures', 'generic-controls.html');
const analyzerPath = join(import.meta.dirname, '..', 'src', 'analyze-page.ts');

async function loadAnalyzer(page: Page): Promise<void> {
  const result = await build({
    entryPoints: [analyzerPath],
    bundle: true,
    format: 'iife',
    globalName: 'CareerFormPageAnalysis',
    write: false,
    outdir: tmpdir(),
  });
  await page.addScriptTag({ content: result.outputFiles[0]?.text ?? '' });
}

async function analyze(page: Page): Promise<Analysis> {
  return page.evaluate(() => {
    const probe = (globalThis as typeof globalThis & {
      CareerFormPageAnalysis: { analyzePage(root: Document): Analysis };
    }).CareerFormPageAnalysis;
    return probe.analyzePage(document);
  });
}

test.beforeEach(async ({ page }) => {
  await page.setContent(await readFile(fixturePath, 'utf8'));
  await page.waitForFunction(() => document.querySelector('[data-dynamic]') !== null);
  await page.waitForFunction(() => Boolean(
    document.querySelector<HTMLIFrameElement>('iframe:not([sandbox])')
      ?.contentDocument?.querySelector('input'),
  ));
});

test('classifies native controls without exposing page content', async ({ page }) => {
  await loadAnalyzer(page);

  const result = await analyze(page);
  const supportedKinds = result.controls
    .filter(({ status }) => status === 'supported')
    .map(({ control }) => control);

  expect(supportedKinds).toEqual(expect.arrayContaining([
    'text', 'textarea', 'select', 'radio', 'checkbox', 'contenteditable',
  ]));
  const forbiddenKeys = new Set([
    'value', 'text', 'label', 'selector', 'outerHTML', 'innerHTML', 'url', 'name', 'id', 'html',
  ]);
  const keys = JSON.stringify(result, (key, value) => {
    expect(forbiddenKeys.has(key)).toBe(false);
    return value;
  });
  expect(keys).not.toContain('Option A');
});

test('fails closed for hidden disabled and sensitive controls', async ({ page }) => {
  await loadAnalyzer(page);

  const result = await analyze(page);
  const unsupportedReasons = result.controls
    .filter(({ status }) => status === 'unsupported')
    .flatMap(({ reasons }) => reasons);

  expect(unsupportedReasons).toEqual(expect.arrayContaining(['hidden', 'disabled', 'sensitive']));
  expect(unsupportedReasons.filter((reason) => reason === 'hidden')).toHaveLength(4);
  expect(unsupportedReasons.filter((reason) => reason === 'disabled')).toHaveLength(2);
});

test('reports dynamic frame and shadow structures explicitly', async ({ page }) => {
  await loadAnalyzer(page);

  const result = await analyze(page);

  expect(result.controls.some(({ frameDepth }) => frameDepth === 1)).toBe(true);
  expect(result.controls.some(({ shadowDepth }) => shadowDepth === 1)).toBe(true);
  expect(result.controls.filter(({ control }) => control === 'text')).toHaveLength(6);
  expect(result.boundaries).toContainEqual(expect.objectContaining({ kind: 'iframe', reason: 'inaccessible-frame' }));
  expect(result.controls).toContainEqual(expect.objectContaining({
    element: 'closed-picker',
    status: 'review-required',
    reasons: expect.arrayContaining(['inaccessible-custom-element']),
  }));
  expect(result.controls.filter(({ element }) => element === 'closed-picker')).toHaveLength(1);
});

test('does not mutate the analyzed document', async ({ page }) => {
  await loadAnalyzer(page);
  const before = await page.locator('html').evaluate((element) => element.outerHTML);

  await analyze(page);

  const after = await page.locator('html').evaluate((element) => element.outerHTML);
  expect(after).toBe(before);
});
