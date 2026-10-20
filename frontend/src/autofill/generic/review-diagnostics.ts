import type { FieldCandidate } from "../api/types";
import {
  reviewItemsForDisplay,
  type ReviewPlanItem,
} from "../review/review-plan";

export interface ReviewDiagnosticContext {
  candidate: FieldCandidate;
  sectionCategory: string;
  repeatRowIndex: number | null;
}

type Grade = "AUTO" | "REVIEW" | "BLOCKED";
type ControlKind =
  | "text"
  | "select"
  | "date"
  | "month"
  | "search"
  | "radio"
  | "checkbox"
  | "textarea"
  | "custom"
  | "other";

export interface ReviewDiagnosticField {
  grade: Grade;
  reasonCode: string | null;
  sectionCategory: string;
  repeatRowIndex: number | null;
  controlKind: ControlKind;
  mapped: boolean;
  mappedKeyCategory: string | null;
}

function controlKind(candidate: FieldCandidate | undefined): ControlKind {
  if (!candidate) return "other";
  if (candidate.element === "custom") return "custom";
  if (candidate.control === "text") {
    const inputType = candidate.semanticContext?.inputType;
    return inputType === "date" ||
      inputType === "month" ||
      inputType === "search"
      ? inputType
      : "text";
  }
  return candidate.control === "button" ? "other" : candidate.control;
}

/** Explicit projection: page/profile text and candidate identifiers never leave this boundary. */
export function buildReviewDiagnostics(
  items: readonly ReviewPlanItem[],
  contexts: ReadonlyMap<string, ReviewDiagnosticContext>,
) {
  // Match WorkflowScreens' displayed fields and panels, not internal items.
  const displayedItems = reviewItemsForDisplay(items);
  const exceptionalItems = new Set(
    displayedItems.filter(
      (item) =>
        item.status !== "available" ||
        item.analysis?.writePlan?.command === "SELECT_DATE" ||
        item.searchValuePlan ||
        !item.selected,
    ),
  );
  const fields: ReviewDiagnosticField[] = displayedItems.map((item) => {
    const context = contexts.get(item.candidateId);
    const key =
      item.profileFieldKey ??
      item.analysis?.valueBinding?.profileFieldKey ??
      item.analysis?.profileFieldKey;
    return {
      grade: exceptionalItems.has(item)
        ? item.genericGrade === "BLOCKED"
          ? "BLOCKED"
          : "REVIEW"
        : item.disabled || item.status === "unavailable"
          ? "BLOCKED"
          : item.selected
            ? "AUTO"
            : "REVIEW",
      reasonCode: item.genericReasonCode ?? item.failureCode ?? null,
      sectionCategory: context?.sectionCategory ?? "none",
      repeatRowIndex: context?.repeatRowIndex ?? null,
      controlKind: controlKind(context?.candidate),
      mapped: !!key || item.analysis?.matchType === "MATCH",
      mappedKeyCategory: key?.split(".")[0] ?? null,
    };
  });
  const empty = (): Record<Grade, Record<string, number>> => ({
    AUTO: {},
    REVIEW: {},
    BLOCKED: {},
  });
  const counts = {
    byGradeReasonCode: empty(),
    byGradeRepeatRowIndex: empty(),
    byGradeControlKind: empty(),
  };
  for (const field of fields) {
    for (const [dimension, key] of [
      [counts.byGradeReasonCode, field.reasonCode ?? "none"],
      [counts.byGradeRepeatRowIndex, String(field.repeatRowIndex ?? "none")],
      [counts.byGradeControlKind, field.controlKind],
    ] as const) {
      dimension[field.grade][key] = (dimension[field.grade][key] ?? 0) + 1;
    }
  }
  return { fields, counts };
}

export function emitReviewDiagnostics(
  items: readonly ReviewPlanItem[],
  contexts: ReadonlyMap<string, ReviewDiagnosticContext>,
): void {
  if (
    import.meta.env.VITE_LOCAL_WORKFLOW_DIAGNOSTICS !== "1" ||
    import.meta.env.VITE_API_BASE_URL !== "http://localhost:8080"
  )
    return;
  console.info(
    `[CareerForm] 진단 요약: ${JSON.stringify(buildReviewDiagnostics(items, contexts))}`,
  );
}
