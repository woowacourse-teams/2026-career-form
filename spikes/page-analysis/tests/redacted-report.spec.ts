import { expect, test } from '@playwright/test';

import { createRedactedReport } from '../src/create-redacted-report';
import type { PageAnalysis } from '../src/types';

test('returns only timestamp and aggregate structural counts', () => {
  const analysis: PageAnalysis = {
    controls: [
      { element: 'input', control: 'text', status: 'supported', reasons: [], required: true, frameDepth: 0, shadowDepth: 0 },
      { element: 'input', control: 'password', status: 'unsupported', reasons: ['sensitive'], required: false, frameDepth: 0, shadowDepth: 0 },
      { element: 'div', control: 'combobox', status: 'review-required', reasons: ['inaccessible-custom-element'], required: false, frameDepth: 0, shadowDepth: 0 },
    ],
    boundaries: [{ kind: 'iframe', reason: 'inaccessible-frame', frameDepth: 1, shadowDepth: 0 }],
  };

  const report = createRedactedReport(analysis, '2026-08-13T00:00:00.000Z');

  expect(report).toEqual({
    schemaVersion: 1,
    checkedAt: '2026-08-13T00:00:00.000Z',
    totalCandidates: 3,
    statusCounts: { supported: 1, 'review-required': 1, unsupported: 1 },
    controlCounts: { text: 1, password: 1, combobox: 1 },
    reasonCounts: { sensitive: 1, 'inaccessible-custom-element': 1 },
    boundaryCounts: { 'inaccessible-frame': 1 },
  });
  expect(JSON.stringify(report)).not.toContain('input');
});
