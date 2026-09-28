import type { SearchFollowUpControl } from "../interaction/search-follow-up";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import type {
  GenericSearchFollowUp,
  SearchFollowUpRef,
} from "./workflow-analysis-types";

export function recordSearchFollowUp(
  pageDocument: Document,
  searchFollowUp: SearchFollowUpRef,
  item: ReviewPlanItem,
  controls: readonly SearchFollowUpControl[],
  registry: CandidateRegistry,
): void {
  const lookup = registry.lookupField(item.candidateId);
  const target =
    lookup.status === "ready" || lookup.status === "blocked"
      ? lookup.handle.elements[0]
      : undefined;
  const repeatRow =
    target?.closest(
      "[data-repeatable-group], [data-repeater-item], [ismultirow], [data-multirow='true'], [data-repeatable-row]",
    ) ?? target?.parentElement;
  const binding = item.analysis?.valueBinding;
  const profileFieldKey =
    binding?.type === "DIRECT" ? binding.profileFieldKey : undefined;
  const actualValue = target instanceof HTMLInputElement ? target.value : "";
  const valid =
    target instanceof HTMLInputElement &&
    !!repeatRow &&
    !!item.profileEntryId &&
    !!profileFieldKey &&
    item.profileValue !== undefined &&
    actualValue.trim().length > 0 &&
    controls.length > 0 &&
    controls.every(
      (control) =>
        control.isConnected &&
        control.ownerDocument === pageDocument &&
        !control.disabled &&
        repeatRow.contains(control),
    );
  searchFollowUp.current = {
    item,
    target:
      target instanceof HTMLInputElement
        ? target
        : pageDocument.createElement("input"),
    repeatRow: repeatRow ?? pageDocument.body,
    controls,
    profileEntryId: item.profileEntryId ?? "",
    profileFieldKey: profileFieldKey ?? "",
    profileValue: item.profileValue ?? "",
    actualValue,
    valid,
  };
}

export function createSearchFollowUpRecorder(
  pageDocument: Document,
  searchFollowUp: SearchFollowUpRef,
): (
  item: ReviewPlanItem,
  controls: readonly SearchFollowUpControl[],
  registry: CandidateRegistry,
) => void {
  return (item, controls, registry) =>
    recordSearchFollowUp(
      pageDocument,
      searchFollowUp,
      item,
      controls,
      registry,
    );
}

export function takeWrittenSearchFollowUp(
  searchFollowUp: SearchFollowUpRef,
  results: readonly ApprovedWriteResult[],
): GenericSearchFollowUp | undefined {
  const pending = searchFollowUp.current;
  searchFollowUp.current = undefined;
  return pending &&
    results.some(
      (result) =>
        result.candidateId === pending.item.candidateId &&
        result.status === "written",
    )
    ? pending
    : undefined;
}
