import { expect, test } from '@playwright/test';

import { createRedactedReport } from '../src/create-redacted-report';
import type { PageAnalysis } from '../src/types';

test('returns structural identifiers without field values or page DOM', () => {
  const analysis: PageAnalysis = {
    controls: [
      { element: 'input', control: 'text', domId: 'email', domName: 'email', displayName: '이메일주소', profileField: 'email', section: 'contact', confidence: 'exact', visibility: 'visible', status: 'supported', reasons: [], required: true, frameDepth: 0, shadowDepth: 0 },
      { element: 'input', control: 'password', domId: 'password', domName: '', displayName: '비밀번호', profileField: 'unknown', section: 'unknown', confidence: 'unknown', visibility: 'hidden', status: 'unsupported', reasons: ['sensitive'], required: false, frameDepth: 0, shadowDepth: 0 },
      { element: 'div', control: 'combobox', domId: 'license', domName: '', displayName: '자격증명', profileField: 'name', section: 'qualification', confidence: 'heuristic', visibility: 'hidden', status: 'review-required', reasons: ['inaccessible-custom-element'], required: false, frameDepth: 0, shadowDepth: 0 },
    ],
    actions: [{ action: 'qualification.add', element: 'button', domId: 'add-license', domName: '', displayName: '+자격 추가', kind: 'reveal', visibility: 'visible', safeToInvoke: true }],
    boundaries: [{ kind: 'iframe', reason: 'inaccessible-frame', frameDepth: 1, shadowDepth: 0 }],
  };

  const report = createRedactedReport(analysis, '2026-08-13T00:00:00.000Z');

  expect(report).toEqual({
    schemaVersion: 3,
    checkedAt: '2026-08-13T00:00:00.000Z',
    totalCandidates: 3,
    statusCounts: { supported: 1, 'review-required': 1, unsupported: 1 },
    controlCounts: { text: 1, password: 1, combobox: 1 },
    reasonCounts: { sensitive: 1, 'inaccessible-custom-element': 1 },
    boundaryCounts: { 'inaccessible-frame': 1 },
    fields: [
      { element: 'input', domId: 'email', domName: 'email', displayName: '이메일주소', profileField: 'email', section: 'contact', control: 'text', visibility: 'visible', required: true, status: 'supported', confidence: 'exact' },
      { element: 'input', domId: 'password', domName: '', displayName: '비밀번호', profileField: 'unknown', section: 'unknown', control: 'password', visibility: 'hidden', required: false, status: 'unsupported', confidence: 'unknown' },
      { element: 'div', domId: 'license', domName: '', displayName: '자격증명', profileField: 'name', section: 'qualification', control: 'combobox', visibility: 'hidden', required: false, status: 'review-required', confidence: 'heuristic' },
    ],
    actions: [{ action: 'qualification.add', element: 'button', domId: 'add-license', domName: '', displayName: '+자격 추가', kind: 'reveal', visibility: 'visible', safeToInvoke: true }],
  });
});
