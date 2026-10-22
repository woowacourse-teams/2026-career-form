import type { CompanyId } from "../../adapters/company";
import type { FieldCandidate, GenericFieldsResponse } from "../../api/types";

export type SnapshotStatus =
  "RUNNABLE" | "UNREVIEWED" | "NO_SNAPSHOT" | "ABORTED" | "NOT_GENERIC_ROUTE";

export interface SnapshotManifestEntry {
  snapshot: string;
  status: SnapshotStatus;
  reason: string;
  policyFixture?: "sk";
  documentUrl: string;
  expectedRoute: CompanyId;
  routeCheck: "ASSERTED" | "NOT_REPRODUCIBLE_OFFLINE";
}

/** No id, name, label or current value is part of an evidence identity. */
export interface AccuracyCandidate {
  ordinal: number;
  structurePath: string[];
  rowIndex: number | null;
  controlKind: FieldCandidate["control"];
}

export type ExpectedDomState =
  { value: string } | { checkedValues: string[] } | { text: string };

export interface TruthField extends AccuracyCandidate {
  profileFieldKey: string | null;
  expectedDomState: ExpectedDomState;
  exercisable: boolean;
  exercisableReason?: string;
  preserve?: true;
  /** Explicit widget contracts, fixed before observing product results. */
  writeCommand?: NonNullable<
    GenericFieldsResponse["fields"][number]["writePlan"]
  >["command"];
  binding?: GenericFieldsResponse["fields"][number]["binding"];
}

export interface SnapshotTruth {
  schemaVersion: 1;
  snapshot: string;
  fields: TruthField[];
}

export interface AccuracyMetrics {
  registered: number;
  exercisable: number;
  approved: number;
  /** Exercisable scored candidates sent through the pipeline, including holds. */
  attempted: number;
  reportedWritten: number;
  correct: number;
  wrong: number;
  held: number;
  unscored: number;
  reportedSuccessButWrong: number;
  preservedViolated: number;
}

export interface AccuracyFieldReport extends AccuracyCandidate {
  outcome:
    "correct" | "wrong" | "held" | "unscored" | "preserved" | "not-exercisable";
  approved: boolean;
  reportedWritten: boolean;
  preservedViolated: boolean;
  writeCode?: string;
}

export interface AccuracyReport {
  schemaVersion: 1;
  snapshot: string;
  status: SnapshotStatus;
  expectedRoute: CompanyId;
  actualRoute: CompanyId;
  scored: boolean;
  metrics: AccuracyMetrics;
  byControlKind: Partial<Record<FieldCandidate["control"], AccuracyMetrics>>;
  fields: AccuracyFieldReport[];
  diagnostics: string[];
}

export function emptyMetrics(): AccuracyMetrics {
  return {
    registered: 0,
    exercisable: 0,
    approved: 0,
    attempted: 0,
    reportedWritten: 0,
    correct: 0,
    wrong: 0,
    held: 0,
    unscored: 0,
    reportedSuccessButWrong: 0,
    preservedViolated: 0,
  };
}
