import type { Profile } from "../../../profile/model";
import { resolveDocumentCompany } from "../../adapters/company";
import type {
  FieldCandidate,
  FieldsAnalyzeRequest,
  WriteCommand,
} from "../../api/types";
import type { CollectedSnapshot } from "../../dom/collect";
import {
  analyzeGenericFields,
  applyGenericGrade,
  createGenericAnalysisCache,
  genericGradeFor,
  type GenericAnalysisApi,
} from "../../generic/generic-analysis";
import {
  applyGenericStructureAnalysis,
  applyGenericStructureReview,
  collectGenericStructureSnapshot,
  createGenericStructureContext,
} from "../../generic/structure-context";
import { buildReviewPlan } from "../../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../../write/executor";
import { primaryWriteElement } from "../../dom/write-target";
import { approvedReviewExecution } from "../workflow-write-items";
import { addMetrics } from "./report";
export { assertAccuracyReport, aggregateAccuracy } from "./report";
import {
  emptyMetrics,
  type AccuracyCandidate,
  type AccuracyReport,
  type ExpectedDomState,
  type SnapshotManifestEntry,
  type SnapshotTruth,
  type TruthField,
} from "./schema";

type Snapshot = CollectedSnapshot<FieldsAnalyzeRequest>;

function fieldsOf(snapshot: Snapshot): FieldCandidate[] {
  return snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}

function structurePath(element: Element, document: Document): string {
  const parts: string[] = [];
  for (
    let node: Element | null = element;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const index = node.parentElement
      ? Array.from(node.parentElement.children).indexOf(node) + 1
      : 1;
    parts.unshift(`${node.localName}:nth-child(${index})`);
  }
  return ["body", ...parts].join(" > ");
}

/** Collect this before authoring truth; never derive expected states from writes. */
export function accuracyCandidates(
  snapshot: Snapshot,
  document: Document,
): AccuracyCandidate[] {
  return fieldsOf(snapshot).map((field, ordinal) => {
    const lookup = snapshot.registry.lookupField(field.candidateId);
    const handle = "handle" in lookup ? lookup.handle : undefined;
    return {
      ordinal,
      structurePath: [
        ...(handle?.elements ?? []),
        ...(handle?.customElements ?? []),
      ].map((element) => structurePath(element, document)),
      rowIndex: handle?.itemIndex ?? null,
      controlKind: field.control,
    };
  });
}

function readState(document: Document, candidate: AccuracyCandidate) {
  return candidate.structurePath.map((path) => {
    const element = document.querySelector(path);
    if (!element) return null;
    if (element instanceof HTMLInputElement)
      return { value: element.value, checked: element.checked };
    if (element instanceof HTMLSelectElement)
      return {
        value: element.value,
        selectedValues: [...element.selectedOptions].map(
          (option) => option.value,
        ),
      };
    if (element instanceof HTMLTextAreaElement) return { value: element.value };
    return { text: element.textContent ?? "" };
  });
}

function matchesExpected(
  document: Document,
  candidate: AccuracyCandidate,
  expected: ExpectedDomState,
): boolean {
  const states = readState(document, candidate);
  if (states.length === 0 || states.some((state) => state === null))
    return false;
  if ("checkedValues" in expected) {
    const values = states.flatMap((state) =>
      state && "checked" in state && state.checked ? [state.value] : [],
    );
    return JSON.stringify(values) === JSON.stringify(expected.checkedValues);
  }
  const first = states[0]!;
  return "value" in expected
    ? "value" in first && first.value === expected.value
    : "text" in first && first.text === expected.text;
}

function commandFor(field: TruthField): WriteCommand {
  if (field.writeCommand) return field.writeCommand;
  switch (field.controlKind) {
    case "select":
      return "SELECT_OPTION";
    case "radio":
      return "CHECK_RADIO";
    case "checkbox":
      return "CHECK_CHECKBOX";
    case "button":
      return "SELECT_BUTTON_OPTION";
    default:
      return "SET_TEXT";
  }
}

/** Only API mapping is stubbed; grading, planning and writing remain product code. */
function fixedApi(truths: ReadonlyMap<string, TruthField>): GenericAnalysisApi {
  return {
    classifySections: async (request) => ({
      schemaVersion: 1,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      sections: request.sections.map(({ sectionId }) => ({
        sectionId,
        category: "PERSONAL",
        confidence: 1,
      })),
    }),
    analyzeGenericFields: async (request) => ({
      schemaVersion: 3,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      fields: request.sections.flatMap((section) =>
        section.fields.map((field) => {
          const truth = truths.get(field.candidateId);
          const linked =
            truth &&
            !truth.preserve &&
            (truth.profileFieldKey || truth.binding);
          return {
            candidateId: field.candidateId,
            profileFieldKey: linked ? truth.profileFieldKey : null,
            confidence: 1,
            categoryConfirmed: true,
            ...(linked
              ? {
                  interactionStatus: "READY" as const,
                  autofillPolicy: "ALLOWED" as const,
                  writePlan: { command: commandFor(truth) },
                  ...(truth.binding ? { binding: truth.binding } : {}),
                }
              : { interactionStatus: "BLOCKED" as const }),
          };
        }),
      ),
      diagnostics: { jevCalls: 0, elapsedMs: 0 },
    }),
  };
}

export function checkSnapshotRoute(
  entry: SnapshotManifestEntry,
  document: Document,
): string[] {
  if (
    entry.status === "NOT_GENERIC_ROUTE" &&
    entry.routeCheck === "NOT_REPRODUCIBLE_OFFLINE"
  )
    return entry.expectedRoute === "generic" ? ["ROUTE_MISMATCH"] : [];
  const actual = resolveDocumentCompany(document);
  const eligible = entry.status === "RUNNABLE" || entry.status === "UNREVIEWED";
  return actual !== entry.expectedRoute ||
    (eligible && actual !== "generic") ||
    (entry.status === "NOT_GENERIC_ROUTE" && actual === "generic")
    ? ["ROUTE_MISMATCH"]
    : [];
}

export async function runWriteAccuracy({
  document,
  entry,
  profile,
  truth,
}: {
  document: Document;
  entry: SnapshotManifestEntry;
  profile: Profile;
  truth?: SnapshotTruth;
}): Promise<AccuracyReport> {
  const report: AccuracyReport = {
    schemaVersion: 1,
    snapshot: entry.snapshot,
    status: entry.status,
    expectedRoute: entry.expectedRoute,
    actualRoute: resolveDocumentCompany(document),
    scored: entry.status === "RUNNABLE",
    metrics: emptyMetrics(),
    byControlKind: {},
    fields: [],
    diagnostics: checkSnapshotRoute(entry, document),
  };
  if (
    report.diagnostics.length ||
    !["RUNNABLE", "UNREVIEWED"].includes(entry.status)
  )
    return report;
  const context = createGenericStructureContext();
  const snapshot = await collectGenericStructureSnapshot(
    document,
    undefined,
    context,
  );
  const fields = fieldsOf(snapshot);
  const candidates = accuracyCandidates(snapshot, document);
  const initialStates = candidates.map((candidate) =>
    JSON.stringify(readState(document, candidate)),
  );
  if (!truth) report.diagnostics.push("MISSING_TRUTH");
  if (truth && truth.snapshot !== entry.snapshot)
    report.diagnostics.push("TRUTH_SNAPSHOT_MISMATCH");
  const matchedTruths = new Map<string, TruthField>();
  for (const field of truth?.fields ?? []) {
    const candidate = candidates[field.ordinal];
    if (
      !candidate ||
      JSON.stringify(candidate.structurePath) !==
        JSON.stringify(field.structurePath) ||
      candidate.controlKind !== field.controlKind ||
      candidate.rowIndex !== field.rowIndex ||
      matchedTruths.has(fields[field.ordinal].candidateId)
    ) {
      report.diagnostics.push("TRUTH_IDENTITY_MISMATCH");
      continue;
    }
    matchedTruths.set(fields[field.ordinal].candidateId, field);
  }
  const result = await analyzeGenericFields(
    snapshot,
    document,
    fixedApi(matchedTruths),
    profile,
    createGenericAnalysisCache(),
  );
  const analysis = applyGenericStructureAnalysis(
    result.analysis,
    snapshot,
    context,
  );
  const plan = buildReviewPlan({
    analysis,
    profile,
    registry: snapshot.registry,
  });
  const items = plan.items.map((item) =>
    applyGenericStructureReview(
      applyGenericGrade(item, genericGradeFor(result, item.candidateId)),
      snapshot,
      context,
    ),
  );
  const { executableReviewItems, approvedCandidateIds } =
    approvedReviewExecution(items, new Set());
  const results = await executeApprovedWritesAfterPageSettles({
    items: executableReviewItems,
    approvedCandidateIds,
    registry: snapshot.registry,
    document,
    followUpHaltScope: "row",
  });
  const byId = new Map(results.map((write) => [write.candidateId, write]));
  candidates.forEach((candidate, ordinal) => {
    const candidateId = fields[ordinal].candidateId;
    const field = matchedTruths.get(candidateId);
    const approved = approvedCandidateIds.has(candidateId);
    const write = byId.get(candidateId);
    const reportedWritten = write?.status === "written";
    const changed =
      JSON.stringify(readState(document, candidate)) !== initialStates[ordinal];
    const lookup = snapshot.registry.lookupField(candidateId);
    const handle = "handle" in lookup ? lookup.handle : undefined;
    const visibleTarget =
      !!handle &&
      (primaryWriteElement(handle) !== undefined ||
        (handle.customElements?.length ?? 0) > 0);
    const preserve = field?.preserve === true || !approved || !visibleTarget;
    const preservedViolated = preserve && changed;
    const outcome = !field
      ? "unscored"
      : field.preserve
        ? "preserved"
        : !field.exercisable
          ? "not-exercisable"
          : matchesExpected(document, candidate, field.expectedDomState)
            ? "correct"
            : reportedWritten || changed
              ? "wrong"
              : "held";
    const metrics = (report.byControlKind[candidate.controlKind] ??=
      emptyMetrics());
    metrics.registered++;
    if (approved) metrics.approved++;
    if (reportedWritten) metrics.reportedWritten++;
    if (preservedViolated) metrics.preservedViolated++;
    if (outcome === "unscored") metrics.unscored++;
    if (field?.exercisable && !field.preserve) {
      metrics.exercisable++;
      metrics.attempted++;
      if (outcome === "correct" || outcome === "wrong" || outcome === "held")
        metrics[outcome]++;
      if (reportedWritten && outcome === "wrong")
        metrics.reportedSuccessButWrong++;
    }
    report.fields.push({
      ...candidate,
      outcome,
      approved,
      reportedWritten,
      preservedViolated,
      ...(write
        ? {
            writeCode:
              write.status === "written"
                ? write.code
                : (write.failureCode ?? write.code),
          }
        : {}),
    });
  });
  for (const metrics of Object.values(report.byControlKind))
    addMetrics(report.metrics, metrics);
  if (report.metrics.unscored) report.diagnostics.push("UNSCORED_FIELDS");
  if (report.metrics.wrong) report.diagnostics.push("WRONG_VALUES");
  if (report.metrics.preservedViolated)
    report.diagnostics.push("PRESERVE_VIOLATION");
  return report;
}
