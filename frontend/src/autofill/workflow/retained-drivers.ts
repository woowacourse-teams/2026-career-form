import type { CandidateRegistry } from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import type { CompletedGenericStateDriver } from "./workflow-analysis-types";
import { normalizeDisplayName } from "../write/display-name";
import { stateDriverKey } from "./workflow-model";

type RetainedDriverCandidate = {
  item: ReviewPlanItem;
  handle: FieldCandidateHandle;
};

function retainedStateDriverValue(
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
  value: string,
): boolean {
  const command = item.analysis?.writePlan?.command;
  if (command === "SELECT_OPTION") {
    const select = handle.elements[0];
    return (
      select instanceof HTMLSelectElement &&
      normalizeDisplayName(select.selectedOptions[0]?.textContent ?? "") ===
        normalizeDisplayName(value)
    );
  }
  if (command !== "CHECK_RADIO") return false;
  const options = (handle.candidate.options ?? [])
    .filter(
      (option) =>
        normalizeDisplayName(option.displayName) ===
        normalizeDisplayName(value),
    )
    .map((option) => handle.optionElements.get(option.optionId))
    .filter(
      (option): option is HTMLInputElement =>
        option instanceof HTMLInputElement,
    );
  return options.length === 1 && options[0]!.checked;
}

export function retainedDriverCandidates(
  items: readonly ReviewPlanItem[],
  registry: CandidateRegistry,
  completed: ReadonlyMap<string, CompletedGenericStateDriver>,
): Map<string, RetainedDriverCandidate[]> {
  const candidates = new Map<string, RetainedDriverCandidate[]>();
  items.forEach((item) => {
    const lookup = registry.lookupField(item.candidateId);
    if (lookup.status !== "ready") return;
    const key = stateDriverKey(
      item,
      lookup.handle.candidate.domName ?? lookup.handle.candidate.domId,
      lookup.handle.itemIndex,
    );
    if (!completed.has(key)) return;
    candidates.set(key, [
      ...(candidates.get(key) ?? []),
      { item, handle: lookup.handle },
    ]);
  });
  return candidates;
}

export function retainedDriverReviewResults(
  candidates: ReadonlyMap<string, RetainedDriverCandidate[]>,
  completed: ReadonlyMap<string, CompletedGenericStateDriver>,
): { results: ApprovedWriteResult[]; unmatched: boolean } {
  let unmatched = false;
  const results = [...completed].flatMap(
    ([key, record]): ApprovedWriteResult[] => {
      const matches = candidates.get(key) ?? [];
      if (matches.length === 0) {
        unmatched = true;
        return [];
      }
      if (matches.length > 1) {
        return matches.map(({ item }) => ({
          candidateId: item.candidateId,
          status: "skipped" as const,
          outcome: "needs-verification" as const,
          code: "RETAINED_VALUE_UNCONFIRMED" as const,
          reason: "조건부 선택 항목을 하나로 다시 연결하지 못했습니다.",
        }));
      }
      const { item, handle } = matches[0]!;
      return retainedStateDriverValue(item, handle, record.profileValue)
        ? [
            {
              candidateId: item.candidateId,
              status: "written",
              outcome: "success",
              code: "WRITTEN",
            },
          ]
        : [
            {
              candidateId: item.candidateId,
              status: "skipped",
              outcome: "needs-verification",
              code: "RETAINED_VALUE_UNCONFIRMED",
              reason: "조건부 선택값이 유지되는지 확인하지 못했습니다.",
            },
          ];
    },
  );
  return { results, unmatched };
}
