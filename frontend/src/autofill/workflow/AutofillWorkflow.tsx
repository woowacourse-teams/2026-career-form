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
import { normalizeDisplayName } from "../write/display-name";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import { WorkflowScreens } from "./WorkflowScreens";
import {
  createAnalyzeFields,
  type CompletedGenericStateDriver,
} from "./workflow-analysis";
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

function retainedDriverCandidates(
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

function retainedDriverReviewResults(
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
  const executionPending = useRef(false);
  const mounted = useRef(true);
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
  const completedGenericStateDrivers = useRef<
    ReadonlyMap<string, CompletedGenericStateDriver>
  >(new Map());
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
  const [analysisSummary, setAnalysisSummary] = useState<{
    mode: "ADAPTER" | "GENERIC";
    durationMs: number;
    fieldCount: number;
    matchedCount: number;
  }>();
  const [workflowDiagnostics, setWorkflowDiagnostics] = useState<
    WorkflowDiagnostic[]
  >([]);

  const analyzeFields = createAnalyzeFields({
    onAnalysis: setAnalysisSummary,
    adapter,
    addressRun,
    addressSearch,
    apiClient,
    pageDocument,
    repository,
    approvedSensitiveValues,
    consideredSensitiveValues,
    completedDriverKeys,
    completedGenericStateDrivers,
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
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
    if (!profile || !preparationSnapshot || executionPending.current) return;
    executionPending.current = true;
    try {
      if (stage === "preparation-review") {
        for (const item of preparationItems) {
          if (
            !item.sensitive ||
            item.plan.command !== "SELECT_OPTION_TO_REVEAL"
          )
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
            if (
              adapterAllowsSelection === true &&
              lookup.handle.element.checked
            )
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
        if (mounted.current) {
          setExceptionTitle(safeErrorTitle(error));
          setStage("exception");
        }
      }
    } catch (error) {
      if (mounted.current) {
        setExceptionTitle(safeErrorTitle(error));
        setStage("exception");
      }
    } finally {
      executionPending.current = false;
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
    if (!fieldsSnapshot || executionPending.current) return;
    executionPending.current = true;
    try {
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
      const retainedDrivers = retainedDriverReviewResults(
        retainedDriverCandidates(
          reviewItems,
          fieldsSnapshot.registry,
          completedGenericStateDrivers.current,
        ),
        completedGenericStateDrivers.current,
      );
      if (
        retainedDrivers.unmatched ||
        retainedDrivers.results.some((result) => result.status === "skipped")
      ) {
        if (retainedDrivers.unmatched) {
          setWarnings((current) => [
            ...current,
            "자동으로 적용한 조건부 선택을 재분석에서 확인하지 못했습니다. 직접 확인해 주세요.",
          ]);
        }
        setResults(retainedDrivers.results);
        setStage("result");
        return;
      }
      const retainedCandidateIds = new Set(
        retainedDrivers.results.map((result) => result.candidateId),
      );
      const executableReviewItems = reviewItems.filter(
        (item) => !retainedCandidateIds.has(item.candidateId),
      );
      const approvedCandidateIds = new Set(
        executableReviewItems
          .filter((item) => item.selected && !item.disabled)
          .map((item) => item.candidateId),
      );
      if (
        profile &&
        JSON.stringify(await repository.load()) !== JSON.stringify(profile)
      ) {
        setExceptionTitle(
          "확인 후 프로필이 변경되었습니다. 다시 시작해 주세요",
        );
        setStage("exception");
        return;
      }
      setStage("writing");
      const nextResults = await executeApprovedWritesAfterPageSettles({
        items: executableReviewItems,
        approvedCandidateIds,
        registry: fieldsSnapshot.registry,
      });
      if (!mounted.current) return;
      setResults([...retainedDrivers.results, ...nextResults]);
      setStage("result");
    } catch (error) {
      if (mounted.current) {
        setExceptionTitle(safeErrorTitle(error));
        setStage("exception");
      }
    } finally {
      executionPending.current = false;
    }
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
      analysisSummary={analysisSummary}
      addressResult={addressResult}
      adapter={adapter}
      workflowDiagnostics={workflowDiagnostics}
      exceptionTitle={exceptionTitle}
      onExit={onExit}
    />
  );
}
