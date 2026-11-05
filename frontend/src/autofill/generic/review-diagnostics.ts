import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type { Profile, RepeatedProfileCategoryId } from "../../profile/model";
import type { FieldCandidate } from "../api/types";
import { isAutofillProfileFieldKey } from "../profile/profile-field-key";
import {
  reviewItemsForDisplay,
  type ReviewPlanItem,
} from "../review/review-plan";

export interface ReviewDiagnosticContext {
  candidate: FieldCandidate;
  sectionCategory: string;
  repeatRowIndex: number | null;
  fieldOrdinal?: number | null;
  pageSectionOrdinal?: number;
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
  fieldOrdinal: number | null;
  pageSectionOrdinal: number | null;
  profileFieldKey: string | null;
  profileSectionId: string | null;
  profileRowOrdinal: number | null;
}

// This is a dev-only gate and must never ship in a production build.
export function localDiagnosticsEnabled(): boolean {
  return (
    import.meta.env.DEV === true &&
    import.meta.env.VITE_LOCAL_WORKFLOW_DIAGNOSTICS === "1" &&
    import.meta.env.VITE_API_BASE_URL === "http://localhost:8080"
  );
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

/** Explicit projection: page/profile text and internal identifiers never leave this boundary. */
export function buildReviewDiagnostics(
  items: readonly ReviewPlanItem[],
  contexts: ReadonlyMap<string, ReviewDiagnosticContext>,
  profile?: Profile,
) {
  // Match WorkflowScreens' displayed fields and panels, not internal items.
  const displayedItems = reviewItemsForDisplay(items);
  const tiered = items.some((item) => item.genericGrade);
  const exceptionalItems = new Set(
    displayedItems.filter(
      (item) =>
        item.status !== "available" ||
        !item.selected ||
        item.genericGrade === "BLOCKED" ||
        (!tiered &&
          (item.analysis?.writePlan?.command === "SELECT_DATE" ||
            item.searchValuePlan !== undefined)),
    ),
  );
  const fields: ReviewDiagnosticField[] = displayedItems.map((item) => {
    const context = contexts.get(item.candidateId);
    // Match execution's valueBinding-before-legacy precedence. Multi-source
    // derived recipes have no single observable canonical source key.
    const binding = item.analysis?.valueBinding;
    const rawKey = binding
      ? binding.type !== "DERIVED" ||
        binding.recipe === "YEAR_MONTH" ||
        binding.recipe === "BOOLEAN_YN"
        ? binding.profileFieldKey
        : undefined
      : (item.analysis?.profileFieldKey ?? item.profileFieldKey);
    const key = rawKey && isAutofillProfileFieldKey(rawKey) ? rawKey : null;
    let profileSectionId: string | null = null;
    let profileRowOrdinal: number | null = null;
    const category = key
      ? PROFILE_CATEGORIES.find((entry) => entry.id === key.split(".")[0])
      : undefined;
    if (profile && category?.repeatable && item.profileEntryId) {
      const entries = profile[category.id as RepeatedProfileCategoryId];
      const boundEntries = entries.filter(
        (entry) => entry.id === item.profileEntryId,
      );
      const entry = boundEntries.length === 1 ? boundEntries[0] : undefined;
      if (
        entry &&
        category.sections.some((section) => section.id === entry.sectionId)
      ) {
        profileSectionId = entry.sectionId;
        profileRowOrdinal = entries
          .filter((row) => row.sectionId === entry.sectionId)
          .indexOf(entry);
      }
    }
    return {
      grade: exceptionalItems.has(item)
        ? tiered && item.genericGrade === "BLOCKED"
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
      fieldOrdinal: context?.fieldOrdinal ?? null,
      pageSectionOrdinal: context?.pageSectionOrdinal ?? null,
      profileFieldKey: key,
      profileSectionId,
      profileRowOrdinal,
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
  profile?: Profile,
): void {
  // Inline literal so production bundles drop the output below as dead code;
  // a call to the gate function alone is not inlined by the minifier.
  if (import.meta.env.DEV !== true) return;
  if (!localDiagnosticsEnabled()) return;
  console.info(
    `[CareerForm] 진단 요약: ${JSON.stringify(buildReviewDiagnostics(items, contexts, profile))}`,
  );
}
