import { useEffect, useRef, useState } from "react";
import type { AddressResult } from "../address/types";
import {
  getWorkflowAdapter,
  type WorkflowDiagnostic,
} from "../adapters/workflow";
import type { PreparationPlan } from "../api/types";
import type { Profile } from "../../profile/model";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
  type CollectedSnapshot,
} from "../dom/collect";
import {
  executeApprovedPreparationPlans,
  type PreparationExecutionOptions,
} from "../preparation/executor";
import { preparationFailureMessage } from "../preparation/failure-message";
import { selectNativeProfileOption } from "../preparation/select-profile-option";
import { requiresSensitiveConfirmation } from "../profile/sensitive-confirmation";
import { waitForExpectedFields } from "../preparation/wait-for-fields";
import {
  buildReviewPlan,
  revealSensitiveReviewItem,
  resolveProfileFieldValue,
  type ReviewPlanItem,
} from "../review/review-plan";
import {
  executeApprovedWrites,
  executeApprovedWritesAfterPageSettles,
  type ApprovedWriteResult,
} from "../write/executor";
import { WorkflowScreens } from "./WorkflowScreens";
import { createAnalyzeFields } from "./workflow-analysis";
import { createWriteRevealedFields } from "./revealed-fields";
import { createReviewActions } from "./review-actions";
import {
  actionLabel,
  adapterProfileValue,
  localProfileValue,
  preparationItem,
  reviewProfileFieldKey,
  safeErrorTitle,
  stateDriverKey,
  type PreparationItem,
  type Stage,
  pageHost,
  runtimeAddressSearch,
  type WorkflowProps,
} from "./workflow-model";

export { localItemCount, shouldRunRevealPlan } from "./workflow-model";

export function AutofillWorkflow({
  apiClient,
  repository,
  pageDocument,
  onExit,
  addressSearch = runtimeAddressSearch,
}: WorkflowProps) {
  const adapter = getWorkflowAdapter(pageHost(pageDocument));
  const addressRun = useRef<{
    controller: AbortController;
    button?: Element;
    task?: Promise<AddressResult>;
  }>({ controller: new AbortController() });
  const [addressResult, setAddressResult] = useState<AddressResult>();
  const [stage, setStage] = useState<Stage>("analyzing");
  const [profile, setProfile] = useState<Profile>();
  const [preparationSnapshot, setPreparationSnapshot] =
    useState<ReturnType<typeof collectPreparationSnapshot>>();
  const [preparationItems, setPreparationItems] = useState<PreparationItem[]>(
    [],
  );
  const [preparationExecutionPending, setPreparationExecutionPending] =
    useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewPlanItem[]>([]);
  const approvedSensitiveValues = useRef(new Map<string, string>());
  const consideredSensitiveValues = useRef(new Map<string, string>());
  const completedDriverKeys = useRef<ReadonlySet<string>>(new Set());
  const deferredDriverGroups = useRef<ReadonlySet<Element>>(new Set());
  const [revealedPreparationKeys, setRevealedPreparationKeys] = useState<
    ReadonlySet<string>
  >(new Set());
  const [selectedPreparationKeys, setSelectedPreparationKeys] = useState<
    ReadonlySet<string>
  >(new Set());
  const sensitiveValueApproved = (loaded: Profile, key: string): boolean => {
    const value = localProfileValue(loaded, key);
    return (
      value !== undefined && approvedSensitiveValues.current.get(key) === value
    );
  };
  const [fieldsSnapshot, setFieldsSnapshot] =
    useState<
      CollectedSnapshot<ReturnType<typeof collectFieldsSnapshot>["request"]>
    >();
  const [partial, setPartial] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [exceptionTitle, setExceptionTitle] =
    useState("분석을 완료하지 못했습니다");
  const [results, setResults] = useState<ApprovedWriteResult[]>([]);
  const [workflowDiagnostics, setWorkflowDiagnostics] = useState<
    WorkflowDiagnostic[]
  >([]);

  const analyzeFields = createAnalyzeFields({
    adapter,
    addressRun,
    addressSearch,
    apiClient,
    pageDocument,
    repository,
    approvedSensitiveValues,
    consideredSensitiveValues,
    completedDriverKeys,
    deferredDriverGroups,
    setAddressResult,
    setExceptionTitle,
    setStage,
    setFieldsSnapshot,
    setReviewItems,
    setPartial,
    setWarnings,
    setResults,
  });

  useEffect(() => {
    let active = true;
    const run: {
      controller: AbortController;
      button?: Element;
      task?: Promise<AddressResult>;
    } = { controller: new AbortController() };
    addressRun.current = run;
    const start = async () => {
      try {
        const loadedProfile = await repository.load();
        if (!active) return;
        setProfile(loadedProfile);
        const snapshot = collectPreparationSnapshot(pageDocument);

        const analysis = await apiClient.analyzePreparation(snapshot.request);

        if (!active) return;
        if (analysis.analysisStatus === "BLOCKED") {
          await analyzeFields(loadedProfile);
          return;
        }
        const searchPlans = analysis.preparationPlans.filter(
          (plan) => plan.command === "SEARCH_ADDRESS",
        );
        if (
          analysis.mode === "ADAPTER" &&
          searchPlans.length === 1 &&
          adapter.runAddress
        ) {
          const action = snapshot.registry.lookupAction(
            searchPlans[0].actionCandidateId,
          );
          if (
            action.status === "ready" ||
            (action.status === "blocked" && action.reason === "readonly")
          )
            run.button = action.handle.element;
        }
        const educationPlans = adapter.educationPreparationActionId
          ? analysis.preparationPlans.filter((plan) => {
              if (plan.command !== "ADD_REPEATABLE_GROUP") return false;
              const action = snapshot.registry.lookupAction(
                plan.actionCandidateId,
              );
              return (
                action.status === "ready" &&
                action.handle.candidate.domId ===
                  adapter.educationPreparationActionId
              );
            })
          : [];
        if (
          educationPlans.length > 0 &&
          adapter.prepareEducation &&
          analysis.mode === "ADAPTER"
        ) {
          if (
            educationPlans.length !== 1 ||
            !(await adapter.prepareEducation(
              pageDocument,
              loadedProfile,
              run.controller.signal,
            ))
          ) {
            if (!active) return;
            setExceptionTitle(
              "학력 종류와 입력 행을 안전하게 준비하지 못했습니다",
            );
            setStage("exception");
            return;
          }
        }
        if (!active) return;
        const preparationPlans = analysis.preparationPlans.filter(
          (plan) =>
            plan.command !== "SEARCH_ADDRESS" && !educationPlans.includes(plan),
        );
        if (preparationPlans.length === 0) {
          await analyzeFields(loadedProfile);
          return;
        }
        setPreparationSnapshot(snapshot);
        const items = preparationPlans.map((plan) =>
          preparationItem(plan, snapshot, loadedProfile, adapter),
        );
        setPreparationItems(items);
        setWarnings(analysis.warningCodes ?? []);
        if (items.some((item) => item.runnable && item.sensitive)) {
          setStage("preparation-review");
        } else {
          setPreparationExecutionPending(true);
        }
      } catch (error) {
        if (!active) return;
        setExceptionTitle(safeErrorTitle(error));
        setStage("exception");
      }
    };
    void start();
    return () => {
      active = false;
      run.controller.abort();
    };
  }, [apiClient, pageDocument, repository]);

  const executePreparation = async () => {
    if (!profile || !preparationSnapshot) return;
    if (stage === "preparation-review") {
      for (const item of preparationItems) {
        if (!item.sensitive || item.plan.command !== "SELECT_OPTION_TO_REVEAL")
          continue;
        const key = item.plan.profileFieldKey;
        const value = localProfileValue(profile, key);
        if (value === undefined) continue;
        consideredSensitiveValues.current.set(key, value);
        if (item.runnable && selectedPreparationKeys.has(key))
          approvedSensitiveValues.current.set(key, value);
      }
    }
    const isApprovedPreparation = (item: PreparationItem) =>
      item.runnable &&
      (!item.sensitive ||
        (item.plan.command === "SELECT_OPTION_TO_REVEAL" &&
          sensitiveValueApproved(profile, item.plan.profileFieldKey)));
    const runnablePlans = preparationItems
      .filter(isApprovedPreparation)
      .map((item) => ({ ...item, approved: true }));

    setStage("analyzing");
    if (runnablePlans.length === 0) {
      const addedRowsToEmptyForm = adapter.hasFreshRows(runnablePlans);
      await analyzeFields(profile, addedRowsToEmptyForm);
      return;
    }
    const preparationOptions = (
      snapshot: ReturnType<typeof collectPreparationSnapshot>,
    ): Omit<PreparationExecutionOptions, "approvedPlans"> => ({
      initialSnapshot: {
        registry: snapshot.registry,
        isTargetSectionVisible: (targetSectionId) =>
          snapshot.isSectionVisible(targetSectionId),
        countRepeatableGroups: (plan) =>
          snapshot.countRepeatableGroups(plan.actionCandidateId),
      },
      refreshSnapshot: async () => {
        const refreshed = collectPreparationSnapshot(pageDocument);
        return {
          registry: refreshed.registry,
          isTargetSectionVisible: (targetSectionId) =>
            refreshed.isSectionVisible(targetSectionId),
          countRepeatableGroups: (plan) =>
            refreshed.countRepeatableGroups(plan.actionCandidateId),
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
        return selectNativeProfileOption(
          lookup.handle.element,
          normalizedValue,
          adapterAllowsSelection,
        );
      },
    });
    const result = await executeApprovedPreparationPlans({
      approvedPlans: runnablePlans,
      ...preparationOptions(preparationSnapshot),
    });

    if (result.status !== "completed") {
      const failedPlan =
        result.status === "failed" && result.failedActionCandidateId
          ? runnablePlans.find(
              ({ plan }) =>
                plan.actionCandidateId === result.failedActionCandidateId,
            )?.plan
          : undefined;
      setExceptionTitle(
        result.status === "failed"
          ? `${preparationFailureMessage(result.reason)}${
              failedPlan
                ? ` (${actionLabel(failedPlan, preparationSnapshot)})`
                : ""
            }`
          : "준비 동작을 안전하게 완료하지 못했습니다",
      );
      setStage("exception");
      return;
    }
    try {
      setStage("analyzing");
      const addedRowsToEmptyForm = adapter.hasFreshRows(runnablePlans);
      setWorkflowDiagnostics(
        adapter.revealSelections.map((selection) => {
          const resolved = resolveProfileFieldValue(
            profile,
            selection.profileFieldKey,
            selection.itemIndex,
          );
          if (
            requiresSensitiveConfirmation(
              selection.profileFieldKey,
              resolved.sensitive,
            ) &&
            !sensitiveValueApproved(profile, selection.profileFieldKey)
          ) {
            return { code: "PROFILE_NOT_SELECTED" as const, count: 0 };
          }
          return adapter.selectReveal(
            pageDocument,
            selection,
            resolved.status === "resolved"
              ? adapterProfileValue(
                  adapter,
                  selection.profileFieldKey,
                  resolved.value,
                )
              : undefined,
          );
        }),
      );
      // Analyze that newly collected DOM once, but only execute selections:
      // repeating add plans here could create duplicate rows.
      const followUpSnapshot = collectPreparationSnapshot(pageDocument);
      const followUpAnalysis = await apiClient.analyzePreparation(
        followUpSnapshot.request,
      );

      if (adapter.diagnosticsTitle) {
        setWorkflowDiagnostics((previous) => [
          ...previous,
          {
            code: "FOLLOW_UP_PLANS",
            count: followUpAnalysis.preparationPlans.filter(
              (plan) => plan.command === "SELECT_OPTION_TO_REVEAL",
            ).length,
          },
        ]);
      }
      if (followUpAnalysis.analysisStatus !== "BLOCKED") {
        const followUpPlans = followUpAnalysis.preparationPlans
          .filter(
            (
              plan,
            ): plan is Extract<
              PreparationPlan,
              { command: "SELECT_OPTION_TO_REVEAL" }
            > => plan.command === "SELECT_OPTION_TO_REVEAL",
          )
          .map((plan) => ({
            ...preparationItem(plan, followUpSnapshot, profile, adapter),
            approved: true,
          }))
          .filter(isApprovedPreparation);
        if (followUpPlans.length > 0) {
          const followUpResult = await executeApprovedPreparationPlans({
            approvedPlans: followUpPlans,
            ...preparationOptions(followUpSnapshot),
          });

          if (followUpResult.status !== "completed") {
            setExceptionTitle(
              followUpResult.status === "failed"
                ? preparationFailureMessage(followUpResult.reason)
                : "준비 동작을 안전하게 완료하지 못했습니다",
            );
            setStage("exception");
            return;
          }
          await writeRevealedFields(profile, followUpPlans);
        }
      }
      await analyzeFields(profile, addedRowsToEmptyForm);
    } catch (error) {
      setExceptionTitle(safeErrorTitle(error));
      setStage("exception");
    }
  };

  const writeRevealedFields = createWriteRevealedFields({
    adapter,
    apiClient,
    pageDocument,
    setWorkflowDiagnostics,
  });

  const { toggleReviewItem, revealSensitiveItem } =
    createReviewActions(setReviewItems);

  const executeWrites = async () => {
    if (!fieldsSnapshot) return;
    if (profile && reviewItems.some((item) => item.status === "sensitive")) {
      for (const item of reviewItems) {
        const key = reviewProfileFieldKey(item);
        if (item.status !== "sensitive" || !key) continue;
        const value = localProfileValue(profile, key);
        if (value === undefined) continue;
        consideredSensitiveValues.current.set(key, value);
        if (item.selected && !item.disabled && item.revealed)
          approvedSensitiveValues.current.set(key, value);
        else approvedSensitiveValues.current.delete(key);
      }
      setStage("analyzing");
      await analyzeFields(profile);
      return;
    }
    const approvedCandidateIds = new Set(
      reviewItems
        .filter((item) => item.selected && !item.disabled)
        .map((item) => item.candidateId),
    );
    setResults(
      await executeApprovedWritesAfterPageSettles({
        items: reviewItems,
        approvedCandidateIds,
        registry: fieldsSnapshot.registry,
      }),
    );
    setStage("result");
  };

  useEffect(() => {
    if (!preparationExecutionPending) return;
    setPreparationExecutionPending(false);
    void executePreparation();
  }, [preparationExecutionPending]);

  return (
    <WorkflowScreens
      stage={stage}
      preparationItems={preparationItems}
      warnings={warnings}
      revealedPreparationKeys={revealedPreparationKeys}
      selectedPreparationKeys={selectedPreparationKeys}
      setRevealedPreparationKeys={setRevealedPreparationKeys}
      setSelectedPreparationKeys={setSelectedPreparationKeys}
      executePreparation={executePreparation}
      reviewItems={reviewItems}
      partial={partial}
      toggleReviewItem={toggleReviewItem}
      revealSensitiveItem={revealSensitiveItem}
      executeWrites={executeWrites}
      results={results}
      addressResult={addressResult}
      adapter={adapter}
      workflowDiagnostics={workflowDiagnostics}
      exceptionTitle={exceptionTitle}
      onExit={onExit}
    />
  );
}
