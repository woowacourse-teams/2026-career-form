/**
 * Dev-only, value-free write-run trace: one row per review item.
 * Labels, values, option texts and selectors never enter this module.
 */
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/write-result";

export type WriteTraceHold = {
  kind: "followUp" | "surfaceLeftOpen" | "unconfirmedSearch";
  /** The item whose result halted this one. */
  triggerCandidateId: string;
  /** True when the halt reached beyond the triggering row. */
  batch: boolean;
};

interface WriteTraceEntry {
  targetFound?: boolean;
  setterCalled?: boolean;
  valueAfterWrite?: boolean;
  valueAtSettle?: boolean;
  hold?: WriteTraceHold;
}

const entries = new Map<string, WriteTraceEntry>();

export function beginWriteTrace(): void {
  entries.clear();
}

export function traceWrite(
  candidateId: string,
  patch: Omit<WriteTraceEntry, "hold">,
): void {
  // Inline on purpose: the bundler folds this to a constant, so production
  // builds drop the whole trace instead of keeping it behind a function call.
  if (
    import.meta.env.DEV !== true ||
    import.meta.env.VITE_LOCAL_WORKFLOW_DIAGNOSTICS !== "1" ||
    import.meta.env.VITE_API_BASE_URL !== "http://localhost:8080"
  )
    return;
  entries.set(candidateId, { ...entries.get(candidateId), ...patch });
}

export function traceHold(candidateId: string, hold: WriteTraceHold): void {
  // Inline on purpose: the bundler folds this to a constant, so production
  // builds drop the whole trace instead of keeping it behind a function call.
  if (
    import.meta.env.DEV !== true ||
    import.meta.env.VITE_LOCAL_WORKFLOW_DIAGNOSTICS !== "1" ||
    import.meta.env.VITE_API_BASE_URL !== "http://localhost:8080"
  )
    return;
  entries.set(candidateId, { ...entries.get(candidateId), hold });
}

function executorKind(
  item: ReviewPlanItem,
  registry: CandidateRegistry,
): string {
  const command = item.analysis?.writePlan?.command;
  if (command === "SELECT_DATE") return "calendar";
  if (command === "SEARCH_SELECTION") return "search";
  const lookup = registry.lookupField(item.candidateId);
  if (!("handle" in lookup)) return "native";
  if (lookup.handle.owner === "legacy") return "legacy";
  return lookup.handle.buttonDropdown ? "button-dropdown" : "native";
}

function state(result?: ApprovedWriteResult): string {
  if (!result) return "none";
  return result.status === "written"
    ? "written"
    : `skipped${result.outcome ? `/${result.outcome}` : ""}`;
}

export function buildWriteTraceRows(
  items: readonly ReviewPlanItem[],
  approvedCandidateIds: ReadonlySet<string>,
  registry: CandidateRegistry,
  executed: readonly ApprovedWriteResult[] | undefined,
  finalResults: readonly ApprovedWriteResult[],
) {
  const writeOrdinals = new Map<string, number>();
  for (const item of items)
    if (approvedCandidateIds.has(item.candidateId))
      writeOrdinals.set(item.candidateId, writeOrdinals.size + 1);
  return items.map((item, index) => {
    const entry = entries.get(item.candidateId);
    const final = finalResults[index];
    const hold = entry?.hold;
    return {
      writeOrdinal: writeOrdinals.get(item.candidateId) ?? null,
      fieldOrdinal: index + 1,
      executor: executorKind(item, registry),
      targetFound: entry?.targetFound ?? null,
      setterCalled: entry?.setterCalled ?? null,
      valueAfterWrite: entry?.valueAfterWrite ?? null,
      valueAtSettle: entry?.valueAtSettle ?? null,
      runState: executed ? state(executed[index]) : null,
      finalState: state(final),
      code: final?.code ?? "",
      failureCode: final?.status === "skipped" ? (final.failureCode ?? "") : "",
      heldByBatchHalt: hold?.batch === true,
      haltKind: hold?.kind ?? "",
      haltTriggerOrdinal: hold
        ? (writeOrdinals.get(hold.triggerCandidateId) ?? null)
        : null,
    };
  });
}

export function emitWriteTrace(
  items: readonly ReviewPlanItem[],
  approvedCandidateIds: ReadonlySet<string>,
  registry: CandidateRegistry,
  executed: readonly ApprovedWriteResult[] | undefined,
  finalResults: readonly ApprovedWriteResult[],
): void {
  // Inline on purpose: the bundler folds this to a constant, so production
  // builds drop the whole trace instead of keeping it behind a function call.
  if (
    import.meta.env.DEV !== true ||
    import.meta.env.VITE_LOCAL_WORKFLOW_DIAGNOSTICS !== "1" ||
    import.meta.env.VITE_API_BASE_URL !== "http://localhost:8080"
  )
    return;
  try {
    const rows = buildWriteTraceRows(
      items,
      approvedCandidateIds,
      registry,
      executed,
      finalResults,
    );
    console.groupCollapsed(`[CareerForm] 4. 기입 실행 추적 (${rows.length})`);
    console.table(rows);
  } catch (error) {
    console.warn("[CareerForm] 기입 실행 추적 출력 실패", error);
  } finally {
    console.groupEnd();
  }
}
