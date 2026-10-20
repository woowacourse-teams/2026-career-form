import type { FieldAnalysis } from "../../src/autofill/api/types";
import type { QualityObservation } from "../../src/autofill/quality/observation";

export interface ClientAnalysis {
  snapshotId: string;
  domIds: Record<string, string>;
  fields?: (Pick<FieldAnalysis, "candidateId" | "matchType"> &
    Partial<FieldAnalysis>)[];
}

export function isFieldAnalysisEvent(event: { type: string }): boolean;
export function fieldResponse(event: unknown): {
  ok: boolean;
  error_code: string | null;
  analysis_status: string | null;
  warning_codes: string[];
  fields: number;
  matches: number;
};
export function installClientAnalysisCollector(
  quality: QualityObservation,
  records: ClientAnalysis[],
): void;
export function fieldAnalysis(
  events: unknown[],
  clientAnalyses?: ClientAnalysis[],
): {
  domIds: Map<string, string>;
  analyses: Map<string, FieldAnalysis>;
};
