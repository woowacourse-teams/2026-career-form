import { preparationFailureMessage } from "../preparation/failure-message";
import type { RefObject } from "react";
import type { Profile } from "../../profile/model";
import type { WorkflowAdapter } from "../adapters/workflow";
import { collectPreparationSnapshot } from "../dom/collect";
import type {
  PreparationExecutionResult,
  PreparationExecutionOptions,
} from "../preparation/executor";
import { selectNativeProfileOption } from "../preparation/select-profile-option";
import { waitForExpectedFields } from "../preparation/wait-for-fields";
import {
  resolveProfileFieldValue,
  type ReviewPlanItem,
} from "../review/review-plan";
import { progressCategory } from "./progress-model";
import { sensitiveValueApproved } from "./review-actions";
import {
  actionLabel,
  adapterProfileValue,
  localProfileValue,
  type PreparationItem,
  type WorkflowProps,
  type Stage,
} from "./workflow-model";

interface PreparationContext {
  adapter: WorkflowAdapter;
  pageDocument: Document;
  profile: Profile;
  repository: WorkflowProps["repository"];
  freshDefaultControls: RefObject<WeakSet<Element>>;
  writeController: RefObject<AbortController>;
  mounted: RefObject<boolean>;
  recordOperation(element: Element | undefined, category: string): void;
}

export function createPreparationOptions({
  adapter,
  pageDocument,
  profile,
  repository,
  freshDefaultControls,
  writeController,
  mounted,
  recordOperation,
}: PreparationContext) {
  return (
    snapshot: ReturnType<typeof collectPreparationSnapshot>,
  ): Omit<PreparationExecutionOptions, "approvedPlans"> => ({
    onVerifiedAddition: (action, before, after) => {
      if (!Number.isSafeInteger(before) || before < 1 || after !== before + 1)
        return;
      const control = adapter.freshDefaultAfterAdd?.(action);
      if (control) freshDefaultControls.current.add(control);
    },
    onAction: (element) => {
      const hint = adapter.repeatedProfileSectionHint?.(element.id);
      if (hint)
        recordOperation(
          element,
          progressCategory({
            profileFieldKey: `${hint.categoryId}.`,
          } as ReviewPlanItem),
        );
    },
    document: pageDocument,
    signal: writeController.current.signal,
    assertCurrent: () =>
      mounted.current && !writeController.current.signal.aborted,
    beforeMutation: async () =>
      mounted.current &&
      JSON.stringify(await repository.load()) === JSON.stringify(profile),
    initialSnapshot: {
      registry: snapshot.registry,
      isTargetSectionVisible: (targetSectionId) =>
        snapshot.isSectionVisible(targetSectionId),
      countRepeatableGroups: (plan) =>
        snapshot.countRepeatableGroups(plan.actionCandidateId),
      repeatableGroupState: (plan) =>
        snapshot.repeatableGroupState(plan.actionCandidateId),
    },
    refreshSnapshot: async () => {
      const refreshed = collectPreparationSnapshot(pageDocument);
      return {
        registry: refreshed.registry,
        isTargetSectionVisible: (targetSectionId) =>
          refreshed.isSectionVisible(targetSectionId),
        countRepeatableGroups: (plan) =>
          refreshed.countRepeatableGroups(plan.actionCandidateId),
        repeatableGroupState: (plan) =>
          refreshed.repeatableGroupState(plan.actionCandidateId),
      };
    },
    countRepeatableGroups: (snapshot, plan) =>
      snapshot.countRepeatableGroups?.(plan) ?? -1,
    waitForExpectedFields: async (plan) =>
      waitForExpectedFields(
        pageDocument,
        ("expectedFieldNames" in plan ? plan.expectedFieldNames : []) ?? [],
      ),
    selectProfileOption: (plan, snapshot) => {
      const lookup = snapshot.registry.lookupAction(plan.actionCandidateId);
      if (lookup.status !== "ready") {
        return "action-not-ready";
      }
      const value = resolveProfileFieldValue(profile, plan.profileFieldKey);
      if (value.status !== "resolved") return "profile-value-unavailable";
      const normalizedValue = adapterProfileValue(
        adapter,
        plan.profileFieldKey,
        value.value,
      );
      const adapterAllowsSelection = adapter.canSelectProfileOption?.(
        lookup.handle,
        normalizedValue,
        plan.profileFieldKey,
      );
      if (adapterAllowsSelection === false) return "action-not-ready";
      if (
        lookup.handle.element instanceof HTMLInputElement &&
        lookup.handle.element.type === "radio"
      ) {
        const label = plan.optionDisplayName ?? normalizedValue;
        if (lookup.handle.candidate.displayName !== label)
          return "option-label-mismatch";
        if (adapterAllowsSelection === true && lookup.handle.element.checked)
          return "selected";
        lookup.handle.element.click();
        recordOperation(
          lookup.handle.element,
          progressCategory({
            profileFieldKey: plan.profileFieldKey,
          } as ReviewPlanItem),
        );
        return lookup.handle.element.checked &&
          adapter.canSelectProfileOption?.(
            lookup.handle,
            normalizedValue,
            plan.profileFieldKey,
          ) !== false
          ? "selected"
          : "action-not-ready";
      }
      if (!(lookup.handle.element instanceof HTMLSelectElement))
        return "unsupported-option-action";
      const before = lookup.handle.element.value;
      const selected = selectNativeProfileOption(
        lookup.handle.element,
        normalizedValue,
        adapterAllowsSelection,
      );
      if (lookup.handle.element.value !== before)
        recordOperation(
          lookup.handle.element,
          progressCategory({
            profileFieldKey: plan.profileFieldKey,
          } as ReviewPlanItem),
        );
      return selected;
    },
  });
}

export function prepareApprovedPlans({
  stage,
  profile,
  preparationItems,
  selectedPreparationKeys,
  consideredSensitiveValues,
  approvedSensitiveValues,
}: {
  stage: Stage;
  profile: Profile;
  preparationItems: readonly PreparationItem[];
  selectedPreparationKeys: ReadonlySet<string>;
  consideredSensitiveValues: Map<string, string>;
  approvedSensitiveValues: Map<string, string>;
}) {
  if (stage === "preparation-review") {
    for (const item of preparationItems) {
      if (!item.sensitive || item.plan.command !== "SELECT_OPTION_TO_REVEAL")
        continue;
      const key = item.plan.profileFieldKey;
      const value = localProfileValue(profile, key);
      if (value === undefined) continue;
      consideredSensitiveValues.set(key, value);
      if (item.runnable && selectedPreparationKeys.has(key))
        approvedSensitiveValues.set(key, value);
    }
  }
  const isApprovedPreparation = (item: PreparationItem) =>
    item.runnable &&
    (!item.sensitive ||
      (item.plan.command === "SELECT_OPTION_TO_REVEAL" &&
        sensitiveValueApproved(
          approvedSensitiveValues,
          profile,
          item.plan.profileFieldKey,
        )));
  const runnablePlans = preparationItems
    .filter(isApprovedPreparation)
    .map((item) => ({ ...item, approved: true }));
  return { runnablePlans, isApprovedPreparation };
}

export function preparationExceptionTitle(
  result: Exclude<PreparationExecutionResult, { status: "completed" }>,
  runnablePlans: readonly PreparationItem[],
  snapshot: ReturnType<typeof collectPreparationSnapshot>,
): string {
  const failedPlan =
    result.status === "failed" && result.failedActionCandidateId
      ? runnablePlans.find(
          ({ plan }) =>
            plan.actionCandidateId === result.failedActionCandidateId,
        )?.plan
      : undefined;
  return result.status === "failed"
    ? `${preparationFailureMessage(result.reason)}${
        failedPlan ? ` (${actionLabel(failedPlan, snapshot)})` : ""
      }`
    : "준비 동작을 안전하게 완료하지 못했습니다";
}
