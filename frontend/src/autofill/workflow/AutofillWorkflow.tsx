import { useWriteProgress } from "./use-write-progress";
import { useOperatedFields } from "./use-operated-fields";
import { resultFieldOptions, resultFieldState } from "./result-field-state";
import {
  retainedDriverCandidates,
  retainedDriverReviewResults,
} from "./retained-drivers";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFieldPresentation } from "../write/field-presentation";
import { progressCategory, type WorkflowActivity } from "./progress-model";
import type { CandidateRegistry } from "../dom/candidate-registry";
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
  resolveProfileFieldValue,
  type ReviewPlanItem,
} from "../review/review-plan";
import {
  executeApprovedWritesAfterPageSettles,
  type ApprovedWriteResult,
} from "../write/executor";
import { WorkflowScreens } from "./WorkflowScreens";
import {
  createAnalyzeFields,
  type DeferredDriverFailures,
  type CompletedGenericStateDriver,
} from "./workflow-analysis";
import { createWriteRevealedFields } from "./revealed-fields";
import { createReviewActions, sensitiveValueApproved } from "./review-actions";
import { executionItemsForAction } from "./calendar-routing";
import {
  actionLabel,
  adapterProfileValue,
  localProfileValue,
  preparationItem,
  reviewProfileFieldKey,
  safeErrorTitle,
  type PreparationItem,
  type Stage,
  pageHost,
  runtimeAddressSearch,
  type WorkflowProps,
} from "./workflow-model";

export { localItemCount, shouldRunRevealPlan } from "./workflow-model";

export function AutofillWorkflow({
  exitInToolbar = false,
  followFields = false,
  apiClient,
  repository,
  pageDocument,
  onExit,
  addressSearch = runtimeAddressSearch,
}: WorkflowProps) {
  const adapter = getWorkflowAdapter(pageHost(pageDocument));
  const presentation = useMemo(
    () => createFieldPresentation(pageDocument),
    [pageDocument],
  );
  const [currentCategory, setCurrentCategory] = useState<string>();
  const [activity, setActivity] = useState<WorkflowActivity>("matching");
  const { operated, operatedCategories, recordOperation } =
    useOperatedFields(pageDocument);
  const { progressTracker, progress, onWriteResult } = useWriteProgress(
    pageDocument,
    () => mounted.current && !addressRun.current.controller.signal.aborted,
    recordOperation,
  );
  const presentField = async (
    registry: CandidateRegistry,
    item: ReviewPlanItem,
  ) => {
    if (!mounted.current || addressRun.current.controller.signal.aborted)
      return;
    setCurrentCategory(progressCategory(item));
    if (!followFields) return;
    presentation.show(registry, item.candidateId);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };
  const addressRun = useRef<{
    controller: AbortController;
    button?: Element;
    task?: Promise<AddressResult>;
  }>({ controller: new AbortController() });
  const [addressResult, setAddressResult] = useState<AddressResult>();
  const executionPending = useRef(false);
  const writeController = useRef(new AbortController());
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
  const deferredDriverFailures = useRef<DeferredDriverFailures>(new WeakMap());
  const [revealedPreparationKeys, setRevealedPreparationKeys] = useState<
    ReadonlySet<string>
  >(new Set());
  const [selectedPreparationKeys, setSelectedPreparationKeys] = useState<
    ReadonlySet<string>
  >(new Set());
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
    onActivity: setActivity,
    onWriteResult,
    onAddressOperation: (element) => recordOperation(element, "연락처와 주소"),
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
    deferredDriverFailures,
    setAddressResult,
    setExceptionTitle,
    setStage,
    setFieldsSnapshot,
    setReviewItems,
    setPartial,
    setWarnings,
    setResults,
    presentField,
  });

  useEffect(() => () => presentation.clear(), [presentation]);
  useEffect(() => {
    if (stage !== "writing") {
      presentation.clear();
      setCurrentCategory(undefined);
    }
  }, [stage, presentation]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      writeController.current.abort();
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
          setActivity("preparing");
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
            sensitiveValueApproved(
              approvedSensitiveValues.current,
              profile,
              item.plan.profileFieldKey,
            )));
      const runnablePlans = preparationItems
        .filter(isApprovedPreparation)
        .map((item) => ({ ...item, approved: true }));

      setStage("analyzing");
      setActivity("preparing");
      if (runnablePlans.length === 0) {
        const addedRowsToEmptyForm = adapter.hasFreshRows(runnablePlans);
        await analyzeFields(profile, addedRowsToEmptyForm);
        return;
      }
      const preparationOptions = (
        snapshot: ReturnType<typeof collectPreparationSnapshot>,
      ): Omit<PreparationExecutionOptions, "approvedPlans"> => ({
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
              !sensitiveValueApproved(
                approvedSensitiveValues.current,
                profile,
                selection.profileFieldKey,
              )
            ) {
              return { code: "PROFILE_NOT_SELECTED" as const, count: 0 };
            }
            const controls = [
              ...pageDocument.querySelectorAll<
                HTMLInputElement | HTMLSelectElement
              >("input[type='radio'], select"),
            ].filter(
              (element) =>
                element.name === selection.domName ||
                element.name.startsWith(`${selection.domName}_`),
            );
            const state = (element: HTMLInputElement | HTMLSelectElement) =>
              element instanceof HTMLInputElement
                ? element.checked
                : element.selectedIndex;
            const before = new Map(
              controls.map((element) => [element, state(element)]),
            );
            const diagnostic = adapter.selectReveal(
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
            controls
              .filter((element) => state(element) !== before.get(element))
              .forEach((element) =>
                recordOperation(
                  element,
                  progressCategory({
                    profileFieldKey: selection.profileFieldKey,
                  } as ReviewPlanItem),
                ),
              );
            return diagnostic;
          }),
        );
        // Analyze that newly collected DOM once, but only execute selections:
        // repeating add plans here could create duplicate rows.
        const followUpSnapshot = collectPreparationSnapshot(pageDocument);
        setActivity("matching");
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
            setActivity("preparing");
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
    onActivity: setActivity,
    onWriteResult,
    adapter,
    apiClient,
    pageDocument,
    setWorkflowDiagnostics,
    presentField: async (registry, item) => {
      setStage("writing");
      await presentField(registry, item);
    },
    signal: addressRun.current.controller.signal,
  });

  const { toggleReviewItem, revealSensitiveItem } =
    createReviewActions(setReviewItems);

  const executeWrites = async (
    action: "ordinary" | "calendar" = "ordinary",
  ) => {
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
      const executableReviewItems = executionItemsForAction(
        reviewItems.filter(
          (item) => !retainedCandidateIds.has(item.candidateId),
        ),
        action,
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
      writeController.current.abort();
      writeController.current = new AbortController();
      const approvedProfile = JSON.stringify(profile);
      const nextResults = await executeApprovedWritesAfterPageSettles({
        onResult: onWriteResult,
        beforeWrite: (item) => presentField(fieldsSnapshot.registry, item),
        items: executableReviewItems,
        approvedCandidateIds,
        registry: fieldsSnapshot.registry,
        calendarOnly: action === "calendar",
        ...(analysisSummary?.mode === "GENERIC" && apiClient.decideInteractions
          ? {
              interactionDecisionProvider:
                apiClient.decideInteractions.bind(apiClient),
            }
          : {}),
        assertCurrent: () =>
          mounted.current && !writeController.current.signal.aborted,
        signal: writeController.current.signal,
        document: pageDocument,
        beforeMutation: async () =>
          mounted.current &&
          JSON.stringify(await repository.load()) === approvedProfile,
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
      progress={progress}
      activity={activity}
      progressStateFor={progressTracker.progressStateFor}
      progressIdFor={(id) =>
        fieldsSnapshot
          ? progressTracker.progressIdFor(id, fieldsSnapshot.registry)
          : undefined
      }
      wasWritten={(id) =>
        !!fieldsSnapshot &&
        progressTracker.wasWritten(id, fieldsSnapshot.registry)
      }
      fieldStateFor={(id) =>
        resultFieldState(fieldsSnapshot?.registry, pageDocument, id)
      }
      profile={profile}
      optionsFor={(id) => resultFieldOptions(fieldsSnapshot?.registry, id)}
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
      executeWrites={() => executeWrites("ordinary")}
      executeCalendarWrites={() => executeWrites("calendar")}
      results={results}
      analysisSummary={analysisSummary}
      addressResult={addressResult}
      adapter={adapter}
      workflowDiagnostics={workflowDiagnostics}
      exceptionTitle={exceptionTitle}
      onExit={onExit}
      exitInToolbar={exitInToolbar}
      currentCategory={currentCategory}
      operatedCategories={operatedCategories}
      onLocateSection={(candidateIds, category) =>
        !!fieldsSnapshot &&
        presentation.showSection(
          fieldsSnapshot.registry,
          candidateIds,
          category ? [...(operated.get(category) ?? [])] : [],
        )
      }
      onLocate={(candidateId) =>
        !!fieldsSnapshot &&
        presentation.show(fieldsSnapshot.registry, candidateId)
      }
    />
  );
}
