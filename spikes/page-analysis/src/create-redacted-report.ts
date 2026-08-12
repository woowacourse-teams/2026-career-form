import type { PageAnalysis } from './types';

export interface RedactedReport {
  schemaVersion: 1;
  checkedAt: string;
  totalCandidates: number;
  statusCounts: Record<string, number>;
  controlCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
  boundaryCounts: Record<string, number>;
}

export function createRedactedReport(analysis: PageAnalysis, checkedAt: string): RedactedReport {
  return {
    schemaVersion: 1,
    checkedAt,
    totalCandidates: analysis.controls.length,
    statusCounts: count(analysis.controls.map(({ status }) => status)),
    controlCounts: count(analysis.controls.map(({ control }) => control)),
    reasonCounts: count(analysis.controls.flatMap(({ reasons }) => reasons)),
    boundaryCounts: count(analysis.boundaries.map(({ reason }) => reason)),
  };
}

function count(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => ({
    ...result,
    [value]: (result[value] ?? 0) + 1,
  }), {});
}
