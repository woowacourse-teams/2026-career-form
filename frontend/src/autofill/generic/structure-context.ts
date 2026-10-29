import {
  collectFieldsSnapshotWithDropdowns,
  type CollectedSnapshot,
} from "../dom/collect";
import type { FieldsAnalyzeRequest, FieldsAnalyzeResponse } from "../api/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { genericRowFor } from "../dom/repeatable-rows";
import { localWorkflowLog } from "../debug/local-workflow";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";

/** Stable UI reason; detailed structural reasons stay in the local receipt. */
export const GENERIC_STRUCTURE_BLOCKED_REASON = "STRUCTURE_BLOCKED";

/** Browser-local receipts. None of these nodes or profile indices is serialized. */
export interface GenericStructureContext {
  blockedScopes: Map<Element, string>;
  educationGroups: Set<Element>;
  educationRows: Map<
    Element,
    {
      sectionId: string;
      sectionIndex: number;
      /** The stage select of the row; absent for a row with a fixed stage text. */
      select?: HTMLSelectElement;
      selectedValue?: string;
      /** The fixed stage text a select-less row shows. */
      label?: string;
      /** A non-select control the structure step used to choose the stage. */
      kindControl?: HTMLElement;
    }
  >;
  /** Rows the structure step grew for a repeatable category, by entry order. */
  repeatRows: Map<Element, { category: string; index: number }>;
}

export function createGenericStructureContext(): GenericStructureContext {
  return {
    blockedScopes: new Map(),
    educationGroups: new Set(),
    educationRows: new Map(),
    repeatRows: new Map(),
  };
}

type Snapshot = CollectedSnapshot<FieldsAnalyzeRequest>;

function structureRowFor(
  element: Element,
  context: GenericStructureContext,
): Element | undefined {
  return (
    genericRowFor(element) ??
    [...context.educationRows.keys(), ...context.repeatRows.keys()].find(
      (row) => row.contains(element),
    )
  );
}

/** Give each confirmed stage its own repeat count and index before matching. */
export function bindGenericStructureRows(
  snapshot: Snapshot,
  context: GenericStructureContext,
): Snapshot {
  const counts = new Map<Element, Map<string, number>>();
  for (const [row, binding] of context.educationRows) {
    if (!row.isConnected || !row.parentElement) continue;
    const stages = counts.get(row.parentElement) ?? new Map<string, number>();
    stages.set(binding.sectionId, (stages.get(binding.sectionId) ?? 0) + 1);
    counts.set(row.parentElement, stages);
  }
  const ids = new Set(
    snapshot.request.sections.flatMap((section) => [
      ...section.fields.map(({ candidateId }) => candidateId),
      ...(section.items ?? []).flatMap((item) =>
        item.fields.map(({ candidateId }) => candidateId),
      ),
    ]),
  );
  const repeatCounts = new Map<string, number>();
  for (const { category } of context.repeatRows.values())
    repeatCounts.set(category, (repeatCounts.get(category) ?? 0) + 1);
  for (const candidateId of ids) {
    const lookup = snapshot.registry.lookupField(candidateId);
    if (!("handle" in lookup)) continue;
    const handle = lookup.handle;
    const element = handle.elements[0] ?? handle.customElements?.[0];
    const row = element && structureRowFor(element, context);
    const repeat = row && context.repeatRows.get(row);
    if (row && repeat && row.isConnected) {
      handle.itemIndex = repeat.index;
      handle.itemGroupId = `${handle.itemGroupId ?? ""}:repeat:${repeat.category}`;
      snapshot.registry.setFieldItemCount(
        handle.sectionId,
        repeatCounts.get(repeat.category) ?? 0,
        handle.itemGroupId,
      );
      const wasCurrent = handle.isCurrentContext;
      handle.isCurrentContext = () =>
        wasCurrent?.() !== false && row.isConnected && row.contains(element!);
      continue;
    }
    const binding = row && context.educationRows.get(row);
    if (!row || !binding || !row.parentElement) continue;
    handle.itemIndex = binding.sectionIndex;
    handle.itemGroupId = `${handle.itemGroupId ?? ""}:stage:${binding.sectionId}`;
    const selectedLabel = (
      binding.select
        ? binding.select.selectedOptions[0]?.textContent
        : binding.label
    )
      ?.normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    if (selectedLabel) {
      handle.candidate.semanticContext = {
        ...handle.candidate.semanticContext,
        labels: [
          ...(handle.candidate.semanticContext?.labels ?? []).slice(0, 7),
          { source: "section-heading", text: selectedLabel },
        ],
      };
    }
    snapshot.registry.setFieldItemCount(
      handle.sectionId,
      counts.get(row.parentElement)?.get(binding.sectionId) ?? 0,
      handle.itemGroupId,
    );
    const wasCurrent = handle.isCurrentContext;
    handle.isCurrentContext = () =>
      wasCurrent?.() !== false &&
      row.isConnected &&
      row.contains(element!) &&
      (!binding.select || binding.select.value === binding.selectedValue);
  }
  return snapshot;
}

export async function collectGenericStructureSnapshot(
  document: Document,
  signal: AbortSignal | undefined,
  context: GenericStructureContext,
): Promise<Snapshot> {
  return bindGenericStructureRows(
    await collectFieldsSnapshotWithDropdowns(document, signal, {
      mixedSectionDetection: false,
    }),
    context,
  );
}

function structuralBlockReason(
  element: Element,
  key: string | undefined,
  context: GenericStructureContext,
): string | undefined {
  let reason = [...context.blockedScopes].find(([scope]) =>
    scope.contains(element),
  )?.[1];
  const row = structureRowFor(element, context);
  if (
    !reason &&
    row &&
    [...context.educationGroups].some((group) => group.contains(row))
  ) {
    const binding = context.educationRows.get(row);
    if (!binding) reason = "ROW_KIND_UNCONFIRMED";
    else if (element === binding.select || element === binding.kindControl)
      reason = "ROW_KIND_ALREADY_PREPARED";
    else if (key && !key.startsWith(`education.${binding.sectionId}.`))
      reason = "STAGE_KEY_MISMATCH";
    else if (binding.select && binding.select.value !== binding.selectedValue)
      reason = "ROW_KIND_CHANGED";
  }
  return reason;
}

function bindingFor(element: Element, context: GenericStructureContext) {
  const row = structureRowFor(element, context);
  return row ? context.educationRows.get(row) : undefined;
}

/**
 * A row that names its stage as fixed text takes that stage: an education key
 * of another stage for a field the stage also has is read as this stage's key.
 */
export function fixedStageKey(
  key: string,
  binding: { sectionId: string; select?: HTMLSelectElement } | undefined,
): string {
  if (!binding || binding.select) return key;
  const [category, section, field] = key.split(".");
  if (category !== "education" || !field || section === binding.sectionId)
    return key;
  const stageFields = PROFILE_CATEGORIES.find(({ id }) => id === "education")
    ?.sections.find(({ id }) => id === binding.sectionId)
    ?.fields.map(({ id }) => id);
  return stageFields?.includes(field)
    ? `education.${binding.sectionId}.${field}`
    : key;
}

/** Isolate blocked mappings before the shared planner checks duplicate targets. */
export function applyGenericStructureAnalysis(
  analysis: FieldsAnalyzeResponse,
  snapshot: Snapshot,
  context: GenericStructureContext,
): FieldsAnalyzeResponse {
  return {
    ...analysis,
    fields: analysis.fields.map((field) => {
      const lookup = snapshot.registry.lookupField(field.candidateId);
      if (!("handle" in lookup)) return field;
      const element =
        lookup.handle.elements[0] ?? lookup.handle.customElements?.[0];
      const mapped =
        field.matchType === "MATCH"
          ? (field.valueBinding?.profileFieldKey ?? field.profileFieldKey)
          : undefined;
      const key =
        mapped && element
          ? fixedStageKey(mapped, bindingFor(element, context))
          : mapped;
      const staged =
        key && key !== mapped && field.matchType === "MATCH"
          ? {
              ...field,
              ...(field.profileFieldKey ? { profileFieldKey: key } : {}),
              ...(field.valueBinding && "profileFieldKey" in field.valueBinding
                ? {
                    valueBinding: {
                      ...field.valueBinding,
                      profileFieldKey: key,
                    },
                  }
                : {}),
            }
          : field;
      const blockReason = element && structuralBlockReason(element, key, context);
      if (blockReason)
        localWorkflowLog("structure-blocked", {
          candidateId: field.candidateId,
          key: key ?? "none",
          reason: blockReason,
        });
      return blockReason
        ? {
            candidateId: field.candidateId,
            matchType: "NO_MATCH" as const,
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "BLOCKED" as const,
            reasonCodes: ["NO_MATCH" as const],
          }
        : staged;
    }),
  };
}

/** Reapply receipts on every review pass, including search follow-ups. */
export function applyGenericStructureReview(
  item: ReviewPlanItem,
  snapshot: Snapshot,
  context: GenericStructureContext,
): ReviewPlanItem {
  const lookup = snapshot.registry.lookupField(item.candidateId);
  if (!("handle" in lookup)) return item;
  const element =
    lookup.handle.elements[0] ?? lookup.handle.customElements?.[0];
  if (!element) return item;
  const reason = structuralBlockReason(
    element,
    item.profileFieldKey ?? item.analysis?.valueBinding?.profileFieldKey,
    context,
  );
  return reason
    ? {
        ...item,
        selected: false,
        disabled: true,
        status: "unavailable",
        reason,
        genericGrade: "BLOCKED",
        genericReasonCode: GENERIC_STRUCTURE_BLOCKED_REASON,
      }
    : item;
}
