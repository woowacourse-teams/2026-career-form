import { analyzePage } from '../src/analyze-page';
import { createRedactedReport } from '../src/create-redacted-report';

export function runProbe(): ReturnType<typeof createRedactedReport> {
  return createRedactedReport(analyzePage(document), new Date().toISOString());
}

Object.assign(globalThis, { runCareerFormPageAnalysisProbe: runProbe });
