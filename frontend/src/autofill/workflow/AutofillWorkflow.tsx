import { greetingBasicControls } from "../adapters/greeting/fingerprint";
import { resolveDocumentCompany } from "../adapters/company";
import {
  createPreparationOptions,
  prepareApprovedPlans,
  preparationExceptionTitle,
} from "./preparation-options";
import { useWriteProgress } from "./use-write-progress";
import { useOperatedFields } from "./use-operated-fields";
import { resultFieldOptions, resultFieldState } from "./result-field-state";
import {
  captureGreetingResultTargets,
  recollectGreetingResultRegistry,
} from "./greeting-result-registry";
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
import { executeApprovedPreparationPlans } from "../preparation/executor";
import { preparationFailureMessage } from "../preparation/failure-message";
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
  type GreetingStateDriverReceipt,
  type GenericSearchFollowUp,
} from "./workflow-analysis";
import { createWriteRevealedFields } from "./revealed-fields";
import { createReviewActions, sensitiveValueApproved } from "./review-actions";
import {
  createSearchFollowUpRecorder,
  takeWrittenSearchFollowUp,
} from "./search-follow-up-state";
import { completedSearchFollowUpsRefIsCurrent } from "./search-follow-up-analysis";
import { collectRevealDiagnostics } from "./reveal-diagnostics";
import { approvedReviewExecution } from "./workflow-write-items";
import {
  localProfileValue,
  preparationItem,
  reviewProfileFieldKey,
  safeErrorTitle,
  type PreparationItem,
  type Stage,
  runtimeAddressSearch,
  type WorkflowProps,
} from "./workflow-model";
import { prepareMixedSectionRows } from "./mixed-section-preparation";

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
  const companyId = resolveDocumentCompany(pageDocument);
  const adapter = getWorkflowAdapter(pageDocument);
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
  const freshDefaultControls = useRef(new WeakSet<Element>());
  const completedDriverKeys = useRef<ReadonlySet<string>>(new Set());
  const completedGenericStateDrivers = useRef<
    ReadonlyMap<string, CompletedGenericStateDriver>
  >(new Map());
  const completedGreetingStateDrivers = useRef<
    Map<string, GreetingStateDriverReceipt>
  >(new Map());
  const searchFollowUp = useRef<GenericSearchFollowUp | undefined>(undefined);
  const completedSearchFollowUps = useRef<readonly GenericSearchFollowUp[]>([]);
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
  const [resultRegistry, setResultRegistry] = useState<CandidateRegistry>();
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

  const onSearchFollowUp = createSearchFollowUpRecorder(
    pageDocument,
    searchFollowUp,
  );

  const analyzeFields: ReturnType<typeof createAnalyzeFields> = (...args) =>
    createAnalyzeFields({
      onActivity: setActivity,
      onWriteResult,
      onSearchFollowUp,
      searchFollowUp,
      completedSearchFollowUps,
      onAddressOperation: (element) =>
        recordOperation(element, "연락처와 주소"),
      onAnalysis: setAnalysisSummary,
      adapter: getWorkflowAdapter(pageDocument),
      addressRun,
      addressSearch,
      apiClient,
      pageDocument,
      repository,
      approvedSensitiveValues,
      consideredSensitiveValues,
      freshDefaultControls,
      completedDriverKeys,
      completedGenericStateDrivers,
      completedGreetingStateDrivers,
      deferredDriverGroups,
      deferredDriverFailures,
      setAddressResult,
      setExceptionTitle,
      setStage,
      setFieldsSnapshot,
      setResultRegistry,
      rebindResultProgress: (items, originalRegistry, currentRegistry) => {
        items.forEach((item) =>
          progressTracker.rebindWritten(
            item,
            originalRegistry,
            currentRegistry,
          ),
        );
      },
      setReviewItems,
      setPartial,
      setWarnings,
      setResults,
      presentField,
    })(...args);

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
        completedGreetingStateDrivers.current.clear();
        const snapshot = collectPreparationSnapshot(pageDocument);
        const analysis = await apiClient.analyzePreparation(snapshot.request);
        if (
          companyId === "generic" &&
          analysis.mode === "ADAPTER" &&
          greetingBasicControls(pageDocument)
        )
          throw new Error("Unverified Greeting page structure");
        if (companyId === "greeting" && analysis.mode !== "ADAPTER")
          throw new Error("Unexpected generic response for registered adapter");
        const adapter = getWorkflowAdapter(pageDocument);

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
          await prepareMixedSectionRows({
            document: pageDocument,
            profile: loadedProfile,
            signal: run.controller.signal,
            recordOperation,
          });
          if (!active) return;
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
      const { runnablePlans, isApprovedPreparation } = prepareApprovedPlans({
        stage,
        profile,
        preparationItems,
        selectedPreparationKeys,
        consideredSensitiveValues: consideredSensitiveValues.current,
        approvedSensitiveValues: approvedSensitiveValues.current,
      });

      setStage("analyzing");
      setActivity("preparing");
      if (runnablePlans.length === 0) {
        const addedRowsToEmptyForm = adapter.hasFreshRows(runnablePlans);
        await analyzeFields(profile, addedRowsToEmptyForm);
        return;
      }
      const preparationOptions = createPreparationOptions({
        adapter,
        pageDocument,
        profile,
        repository,
        freshDefaultControls,
        writeController,
        mounted,
        recordOperation,
      });
      const result = await executeApprovedPreparationPlans({
        approvedPlans: runnablePlans,
        ...preparationOptions(preparationSnapshot),
      });

      if (result.status !== "completed") {
        setExceptionTitle(
          preparationExceptionTitle(result, runnablePlans, preparationSnapshot),
        );
        setStage("exception");
        return;
      }
      try {
        setStage("analyzing");
        const addedRowsToEmptyForm = adapter.hasFreshRows(runnablePlans);
        setWorkflowDiagnostics(
          collectRevealDiagnostics({
            adapter,
            document: pageDocument,
            profile,
            approvedSensitiveValues: approvedSensitiveValues.current,
            recordOperation,
          }),
        );
        await prepareMixedSectionRows({
          document: pageDocument,
          profile,
          signal: writeController.current.signal,
          recordOperation,
        });
        // Newly created school rows can reveal their own major add action.
        // Only an adapter-opted-in action may run here, with its live row count.
        const followUpSnapshot = collectPreparationSnapshot(pageDocument);
        setActivity("matching");
        const followUpAnalysis = await apiClient.analyzePreparation(
          followUpSnapshot.request,
        );
        if (
          followUpAnalysis.analysisStatus === "BLOCKED" ||
          (companyId === "greeting" && followUpAnalysis.mode !== "ADAPTER")
        )
          throw new Error("Unexpected adapter response");

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
        const followUpPlans = followUpAnalysis.preparationPlans
          .filter((plan) => {
            if (plan.command === "SELECT_OPTION_TO_REVEAL") return true;
            if (plan.command !== "ADD_REPEATABLE_GROUP") return false;
            const action = followUpSnapshot.registry.lookupAction(
              plan.actionCandidateId,
            );
            return (
              action.status === "ready" &&
              adapter.followUpRepeatableAction?.(
                action.handle.candidate.domId,
              ) === true
            );
          })
          .map((plan) => ({
            ...preparationItem(plan, followUpSnapshot, profile, adapter),
            approved: true,
          }))
          .filter(isApprovedPreparation)
          .filter(
            (item) =>
              item.plan.command !== "ADD_REPEATABLE_GROUP" ||
              (item.requiredAdditions ?? 0) > 0,
          );
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
    setResultRegistry(undefined);
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
      const { executableReviewItems, approvedCandidateIds } =
        approvedReviewExecution(reviewItems, retainedCandidateIds, action);
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
      if (
        !completedSearchFollowUpsRefIsCurrent(
          completedSearchFollowUps,
          profile!,
          pageDocument,
        )
      ) {
        setExceptionTitle("검색 후 입력 항목이 변경되어 다시 확인해야 합니다");
        setStage("exception");
        return;
      }
      setStage("writing");
      writeController.current.abort();
      writeController.current = new AbortController();
      const approvedProfile = JSON.stringify(profile);
      const greetingTargets =
        companyId === "greeting"
          ? captureGreetingResultTargets(fieldsSnapshot.registry, reviewItems)
          : undefined;
      let settledGreetingRegistry: CandidateRegistry | undefined;
      const nextResults = await executeApprovedWritesAfterPageSettles({
        ...(greetingTargets
          ? {
              settledRegistry: () => {
                settledGreetingRegistry = recollectGreetingResultRegistry(
                  pageDocument,
                  greetingTargets,
                  reviewItems,
                );
                return settledGreetingRegistry;
              },
            }
          : {}),
        onResult: onWriteResult,
        beforeWrite: (item) => presentField(fieldsSnapshot.registry, item),
        onSearchFollowUp: (item, controls) =>
          onSearchFollowUp(item, controls, fieldsSnapshot.registry),
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
          JSON.stringify(await repository.load()) === approvedProfile &&
          completedSearchFollowUpsRefIsCurrent(
            completedSearchFollowUps,
            profile!,
            pageDocument,
          ),
      });
      if (!mounted.current) return;
      if (settledGreetingRegistry) {
        [...retainedDrivers.results, ...nextResults].forEach((result) => {
          if (result.status !== "written") return;
          const item = reviewItems.find(
            (candidate) => candidate.candidateId === result.candidateId,
          );
          if (item)
            progressTracker.rebindWritten(
              item,
              fieldsSnapshot.registry,
              settledGreetingRegistry!,
            );
        });
        setResultRegistry(settledGreetingRegistry);
      }
      const pendingFollowUp = takeWrittenSearchFollowUp(
        searchFollowUp,
        nextResults,
      );
      if (pendingFollowUp) {
        if (
          profile &&
          JSON.stringify(await repository.load()) !== JSON.stringify(profile)
        ) {
          setExceptionTitle(
            "검색 후 프로필이 변경되었습니다. 다시 시작해 주세요",
          );
          setStage("exception");
          return;
        }
        if (!writeController.current.signal.aborted)
          await analyzeFields(
            profile!,
            false,
            completedDriverKeys.current,
            deferredDriverGroups.current,
            0,
            { reviewOnly: true, searchFollowUp: pendingFollowUp },
          );
        return;
      }
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

  const visibleRegistry =
    stage === "result" && companyId === "greeting"
      ? (resultRegistry ?? fieldsSnapshot?.registry)
      : fieldsSnapshot?.registry;

  return (
    <WorkflowScreens
      progress={progress}
      activity={activity}
      progressStateFor={progressTracker.progressStateFor}
      progressIdFor={(id) =>
        visibleRegistry
          ? progressTracker.progressIdFor(id, visibleRegistry)
          : undefined
      }
      wasWritten={(id) =>
        !!visibleRegistry && progressTracker.wasWritten(id, visibleRegistry)
      }
      fieldStateFor={(id) =>
        resultFieldState(visibleRegistry, pageDocument, id)
      }
      profile={profile}
      optionsFor={(id) => resultFieldOptions(visibleRegistry, id)}
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
        !!visibleRegistry &&
        presentation.showSection(
          visibleRegistry,
          candidateIds,
          category ? [...(operated.get(category) ?? [])] : [],
        )
      }
      onLocate={(candidateId) =>
        !!visibleRegistry && presentation.show(visibleRegistry, candidateId)
      }
    />
  );
}
