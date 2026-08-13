import type { PageAnalysis } from './types';

export interface RedactedReport {
  schemaVersion: 3;
  checkedAt: string;
  totalCandidates: number;
  statusCounts: Record<string, number>;
  controlCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
  boundaryCounts: Record<string, number>;
  fields: Array<{
    element: string;
    domId: string;
    domName: string;
    displayName: string;
    profileField: string;
    section: string;
    control: string;
    visibility: string;
    required: boolean;
    status: string;
    confidence: string;
  }>;
  actions: PageAnalysis['actions'];
}

export function createRedactedReport(analysis: PageAnalysis, checkedAt: string): RedactedReport {
  return {
    schemaVersion: 3,
    checkedAt,
    totalCandidates: analysis.controls.length,
    statusCounts: count(analysis.controls.map(({ status }) => status)),
    controlCounts: count(analysis.controls.map(({ control }) => control)),
    reasonCounts: count(analysis.controls.flatMap(({ reasons }) => reasons)),
    boundaryCounts: count(analysis.boundaries.map(({ reason }) => reason)),
    fields: analysis.controls.map(({
      element, domId, domName, displayName, profileField, section, control,
      visibility, required, status, confidence,
    }) => ({
      element, domId, domName, displayName, profileField, section, control,
      visibility, required, status, confidence,
    })),
    actions: analysis.actions,
  };
}

function count(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => ({
    ...result,
    [value]: (result[value] ?? 0) + 1,
  }), {});
}
