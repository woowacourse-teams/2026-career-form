import { afterEach, expect, it } from "vitest";
import { collectPreparationSnapshot } from "../dom/collect";
import {
  executeApprovedPreparationPlans,
  type PreparationSnapshot,
} from "../preparation/executor";
import { installExecutionPolicy } from "../workflow/execution-policy";
import {
  mountSyntheticNative,
  nativeCareerRow,
  syntheticNativePolicy,
} from "./__fixtures__/hplace-mrs2-native.synthetic";
afterEach(() => installExecutionPolicy(document));
function collect() {
  const c = collectPreparationSnapshot(document);
  return {
    registry: c.registry,
    isTargetSectionVisible: c.isSectionVisible,
    countRepeatableGroups: (p) => c.countRepeatableGroups(p.actionCandidateId),
    repeatableGroupState: (p) => c.repeatableGroupState(p.actionCandidateId),
  } satisfies PreparationSnapshot;
}
it.each([0, 1])("adds exactly one owned row from %s", async (count) => {
  mountSyntheticNative(count);
  installExecutionPolicy(document, syntheticNativePolicy());
  const root = document.querySelector(".subject")!;
  root.querySelector("button")!.addEventListener("click", () => {
    if (count === 0) root.querySelector("button")!.remove();
    root.insertAdjacentHTML("beforeend", nativeCareerRow(count));
  });
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: collect(),
    refreshSnapshot: async () => collect(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: count + 1,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: "native-action-0",
        },
      },
    ],
  });
  expect(result).toMatchObject({ status: "completed", executedPlanCount: 1 });
});
it.each([0, 2])("rejects a row delta of %s", async (delta) => {
  mountSyntheticNative(1);
  installExecutionPolicy(document, syntheticNativePolicy());
  const root = document.querySelector(".subject")!;
  root.querySelector("button")!.addEventListener("click", () => {
    for (let i = 0; i < delta; i++)
      root.insertAdjacentHTML("beforeend", nativeCareerRow(i + 1));
  });
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: collect(),
    refreshSnapshot: async () => collect(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: 2,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: "native-action-0",
        },
      },
    ],
  });
  expect(result).toMatchObject({
    status: "failed",
    reason: "group-count-not-incremented",
  });
});
it("rejects an existing row edit made by an add handler", async () => {
  mountSyntheticNative(1);
  installExecutionPolicy(document, syntheticNativePolicy());
  const root = document.querySelector(".subject")!;
  root.querySelector("button")!.addEventListener("click", () => {
    (
      root.querySelector('[name="career[0].company"]') as HTMLInputElement
    ).value = "unexpected";
    root.insertAdjacentHTML("beforeend", nativeCareerRow(1));
  });
  const result = await executeApprovedPreparationPlans({
    document,
    initialSnapshot: collect(),
    refreshSnapshot: async () => collect(),
    countRepeatableGroups: (s, p) => s.countRepeatableGroups!(p)!,
    approvedPlans: [
      {
        approved: true,
        localItemCount: 2,
        plan: {
          command: "ADD_REPEATABLE_GROUP",
          expectedEffect: "GROUP_COUNT_INCREMENT",
          actionCandidateId: "native-action-0",
        },
      },
    ],
  });
  expect(result).toMatchObject({
    status: "failed",
    reason: "existing-group-value-changed",
  });
});
it("never collects a disabled add, existYn or submit control", () => {
  mountSyntheticNative(1);
  installExecutionPolicy(document, syntheticNativePolicy());
  document.querySelector<HTMLButtonElement>('[data-button="add"]')!.disabled =
    true;
  document
    .querySelector(".subject")!
    .insertAdjacentHTML(
      "beforeend",
      '<label><input type="radio" name="career.existYn" value="false">없음</label><button type="submit" data-button="add">다음</button>',
    );
  expect(
    collectPreparationSnapshot(document).request.sections.flatMap(
      (s) => s.actionCandidates,
    ),
  ).toEqual([]);
});
