import {
  debugReviewDecisions,
  debugRuntimeSkip,
  debugStageCounts,
} from "../debug/structural-diagnostics";
import { prepareNativeMajorsAfterSchool } from "./native-major-preparation";
import { reportNativeMajorsOfFailedSchools } from "./native-major-unavailable";
import { hplaceUnverifiedRows } from "../adapters/hplace/unverified-structure";
import {
  createNativeDependentState,
  nativeDependentRows,
  rememberNativeDependents,
  ROW_DRIVER_REASON,
  ROW_SEARCH_REASON,
} from "./native-dependent-rows";
import { nativePolicyRequired } from "./execution-policy";
import { nativeForm, nativeOwnership } from "../policy/native-form-collection";
import { getWriteAdapter } from "../adapters/write";
import { runtimeRules } from "../policy/runtime-rules";
import { dismissCompletedAutocomplete } from "../interaction/autocomplete-completion";
import { driverContinuationGuard } from "./driver-continuation";
import { startLocalTiming } from "../debug/local-timing";
import { executionPolicy, installExecutionPolicy } from "./execution-policy";
import { activeModal } from "../interaction/search-surface-dom";
import { localWorkflowLog } from "../debug/local-workflow";
import { captureComponentWriteRegistry } from "./static-fields-session";
import { hasComponentFieldCandidates } from "../policy/components/fingerprint";
import { observeQuality } from "../quality/safe-observation";
import {
  resolveDocumentCompany,
  isUnsupportedHplace,
} from "../adapters/company";
import type { CandidateRegistry } from "../dom/candidate-registry";
import { componentGpaSafe } from "../policy/components/gpa";
import { resultFieldState } from "./result-field-state";
import { matchesResultValue } from "./result-value-match";
import {
  rebindCatalogSelection,
  retainedCatalogSelection,
} from "../profile/catalog-receipt";
import {
  captureComponentResultTargets,
  collectComponentResultResolver,
  recollectComponentResultRegistry,
} from "./component-result-registry";
import type { WorkflowAnalysisContext } from "./workflow-analysis-types";
export type {
  CompletedGenericStateDriver,
  DeferredDriverFailures,
  ComponentStateDriverReceipt,
  GenericSearchFollowUp,
} from "./workflow-analysis-types";
import {
  retainedDriverCandidates,
  retainedDriverReviewResults,
} from "./retained-drivers";
import { collectFieldsSnapshotWithDropdowns } from "../dom/collect";
import {
  applyGenericStructureAnalysis,
  applyGenericStructureReview,
} from "../generic/structure-context";
import {
  analyzeGenericFields,
  applyGenericGrade,
  genericGradeFor,
  createGenericAnalysisCache,
  type GenericAnalysisCache,
  type GenericAnalysisResult,
} from "../generic/generic-analysis";
import { debugAnalysis, debugReviewPlan } from "../debug/autofill-debug";
import {
  buildReviewPlan,
  resolveProfileFieldValue,
  type ReviewPlanItem,
} from "../review/review-plan";
import {
  executeApprovedWrites,
  executeApprovedWritesAfterPageSettles,
  type ApprovedWriteResult,
} from "../write/executor";
import type { Profile, RepeatedProfileCategoryId } from "../../profile/model";
import type { WriteFailureCode } from "../write/failure";
import {
  currentSearchFollowUps,
  missingFollowUpGrade,
  rebindSearchFollowUps,
  searchFollowUpIsCurrent,
  type SearchFollowUpAnalysisOptions,
} from "./search-follow-up-analysis";
import { takeWrittenSearchFollowUp } from "./search-follow-up-state";
import { runAddressAnalysis } from "./address-analysis";
import { belongsToFailedGroup } from "./workflow-write-items";

import {
  isGenericStateDriver,
  genericControlledRegions,
  waitForGenericEffect,
} from "./generic-follow-up";
import {
  adapterProfileValue,
  addressValue,
  reviewProfileFieldKey,
  stateDriverKey,
} from "./workflow-model";

function componentReceiptIdentity(item: ReviewPlanItem): string {
  return JSON.stringify([
    item.profileFieldKey,
    item.profileEntryId,
    item.itemIndex,
    item.profileValue,
    item.analysis?.mappingStatus,
    item.analysis?.valueBinding,
    item.analysis?.writePlan,
  ]);
}

const OPTION_UNMATCHED_REASON =
  "지원서 선택지에서 프로필 값과 일치하는 항목을 찾지 못해 이 항목만 건너뛰었습니다. 프로필 값을 확인해 주세요.";
const GENERIC_DEFERRED_REASON =
  "조건부 선택을 적용하지 못해 이 선택과 연결된 입력란을 건너뛰었습니다.";

function deferredDriverReason(
  code: WriteFailureCode | undefined,
  generic: boolean,
  fallback: string,
): string {
  if (code === "OPTION_UNMATCHED") return OPTION_UNMATCHED_REASON;
  return generic ? GENERIC_DEFERRED_REASON : fallback;
}

/** Section results of one workflow run, keyed by its run object. */
const genericAnalysisCaches = new WeakMap<object, GenericAnalysisCache>();

export function createAnalyzeFields({
  onAnalysis,
  onGenericGrades,
  adapter,
  addressRun,
  addressSearch,
  apiClient,
  analyzeFieldsSnapshot,
  collectFields = collectFieldsSnapshotWithDropdowns,
  genericStructure,
  refreshFieldsAfterPass,
  pageDocument,
  repository,
  freshDefaultControls,
  completedDriverKeys,
  completedGenericStateDrivers,
  completedComponentStateDrivers = { current: new Map() },
  deferredDriverGroups,
  deferredDriverFailures = { current: new WeakMap() },
  setAddressResult,
  setExceptionTitle,
  setStage,
  setFieldsSnapshot,
  setResultRegistry,
  rebindResultProgress,
  setReviewItems,
  setPartial,
  setWarnings,
  setResults,
  presentField: originalPresentField,
  onWriteResult,
  onSearchFollowUp,
  searchFollowUp,
  completedSearchFollowUps,
  onActivity,
  onAddressOperation,
}: WorkflowAnalysisContext) {
  const presentField = originalPresentField
    ? async (
        ...args: Parameters<
          NonNullable<WorkflowAnalysisContext["presentField"]>
        >
      ) => {
        const finish = startLocalTiming("presentation");
        try {
          await originalPresentField(...args);
        } finally {
          finish();
        }
      }
    : undefined;
  let analysisGeneration = 0;
  const companyId = resolveDocumentCompany(pageDocument);
  const nativeDigest = nativePolicyRequired(pageDocument)
    ? JSON.stringify(executionPolicy(pageDocument)?.browserPolicy)
    : undefined;
  const rejectChangedHplaceContext = () => {
    const currentCompany = resolveDocumentCompany(pageDocument);
    if (
      nativeDigest !== undefined &&
      JSON.stringify(executionPolicy(pageDocument)?.browserPolicy) !==
        nativeDigest
    ) {
      setExceptionTitle(
        "페이지 실행 정책이 변경되었습니다. 다시 시작해 주세요",
      );
      setStage("exception");
      return true;
    }
    if (
      currentCompany === companyId ||
      (companyId !== "hplace" && currentCompany !== "hplace")
    )
      return false;
    setExceptionTitle("페이지 실행 방식이 변경되었습니다. 다시 시작해 주세요");
    setStage("exception");
    return true;
  };
  const analyzeFields = async (
    loadedProfile: Profile,
    ignoreFreshRowDefaults = false,
    completedStateDriverKeys: ReadonlySet<string> = completedDriverKeys.current,
    failedGroups: ReadonlySet<Element> = deferredDriverGroups.current,
    genericPass = 0,
    options: SearchFollowUpAnalysisOptions = {},
  ) => {
    if (isUnsupportedHplace(pageDocument)) {
      setStage("unsupported");
      return;
    }
    if (rejectChangedHplaceContext()) return;
    const currentAnalysisGeneration = ++analysisGeneration;
    completedDriverKeys.current = completedStateDriverKeys;
    deferredDriverGroups.current = failedGroups;
    const run = addressRun.current;
    const snapshotUrl = pageDocument.URL;
    if (run.controller.signal.aborted) return;
    const reviewFollowUps = options.reviewOnly
      ? currentSearchFollowUps(completedSearchFollowUps, options.searchFollowUp)
      : [];
    if (
      options.reviewOnly &&
      (!options.searchFollowUp ||
        !reviewFollowUps.length ||
        !reviewFollowUps.every((followUp) =>
          searchFollowUpIsCurrent(followUp, loadedProfile, pageDocument),
        ))
    ) {
      setExceptionTitle("검색 후 입력 항목이 변경되어 다시 확인해야 합니다");
      setStage("exception");
      return;
    }
    setStage("analyzing");
    setResultRegistry?.(undefined);
    onActivity?.("matching");
    const snapshot = await collectFields(pageDocument, run.controller.signal);
    if (
      run.controller.signal.aborted ||
      currentAnalysisGeneration !== analysisGeneration
    )
      return;
    if (isUnsupportedHplace(pageDocument)) {
      setStage("unsupported");
      return;
    }

    if (rejectChangedHplaceContext()) return;
    const analysisStarted = performance.now();
    // Share the budget across factories in this workflow run. Hplace basic
    // fields batch together; unexpected dependency chains must fail closed.
    const native = nativeForm(pageDocument);
    // The last allowed request only reports; it never runs drivers (K17 ≤ 8).
    let nativeFinalPass = false;
    if (native) {
      const progress = JSON.stringify([...completedStateDriverKeys].sort());
      const limit = native.sections.some(
        (s) =>
          s.enabled &&
          s.rows &&
          snapshot.request.sections.some((actual) => actual.sectionId === s.id),
      )
        ? native.maxFieldsRequests
        : Math.min(3, native.maxFieldsRequests);
      const exhausted = (run.nativeFieldsRequests ?? 0) >= limit;
      if (exhausted || run.nativeProgress === progress) {
        if (!exhausted)
          debugRuntimeSkip(
            "native-analysis",
            "analysis-limit",
            "no-progress",
            "collect",
          );
        setExceptionTitle(
          "입력 분석의 진전을 확인할 수 없습니다. 남은 항목을 직접 확인해 주세요",
        );
        setStage("exception");
        return;
      }
      run.nativeFieldsRequests = (run.nativeFieldsRequests ?? 0) + 1;
      run.nativeProgress = progress;
      nativeFinalPass = run.nativeFieldsRequests >= limit;
    }
    if (companyId === "hplace") {
      if ((run.hplaceFieldsRequests ?? 0) >= 3) {
        setExceptionTitle(
          "에이치닷 입력 분석 한도에 도달했습니다. 남은 항목을 직접 확인해 주세요",
        );
        setStage("exception");
        return;
      }
      run.hplaceFieldsRequests = (run.hplaceFieldsRequests ?? 0) + 1;
    }
    const finishQualitySnapshot = startLocalTiming("quality-snapshot");
    observeQuality(() =>
      apiClient.quality?.snapshot(
        snapshot.request.snapshotId,
        snapshot.registry,
        snapshot.request.sections
          .flatMap((section) => [
            ...section.fields,
            ...(section.items ?? []).flatMap((item) => item.fields),
          ])
          .map((field) => field.candidateId),
      ),
    );
    finishQualitySnapshot();
    const finishMapping = startLocalTiming("mapping-rebind");
    let genericResult: GenericAnalysisResult | undefined;
    if (
      companyId === "generic" &&
      apiClient.classifySections &&
      apiClient.analyzeGenericFields
    ) {
      const cache =
        genericAnalysisCaches.get(run) ?? createGenericAnalysisCache();
      genericAnalysisCaches.set(run, cache);
      genericResult = await analyzeGenericFields(
        snapshot,
        pageDocument,
        {
          classifySections: apiClient.classifySections.bind(apiClient),
          analyzeGenericFields: apiClient.analyzeGenericFields.bind(apiClient),
        },
        loadedProfile,
        cache,
      );
    }
    let analysis =
      genericResult?.analysis ??
      (await (analyzeFieldsSnapshot
        ? analyzeFieldsSnapshot(snapshot)
        : apiClient.analyzeFields(snapshot.request)));
    if (genericResult && genericStructure)
      analysis = applyGenericStructureAnalysis(
        analysis,
        snapshot,
        genericStructure,
      );
    finishMapping();
    const finishAnalysisLog = startLocalTiming("analysis-log");
    debugAnalysis(snapshot, analysis);
    finishAnalysisLog();
    if (
      run.controller.signal.aborted ||
      currentAnalysisGeneration !== analysisGeneration
    )
      return;
    if (isUnsupportedHplace(pageDocument)) {
      setStage("unsupported");
      return;
    }
    if (
      options.reviewOnly &&
      JSON.stringify(await repository.load()) !== JSON.stringify(loadedProfile)
    ) {
      setExceptionTitle("확인 중 프로필이 변경되었습니다. 다시 시작해 주세요");
      setStage("exception");
      return;
    }
    if (rejectChangedHplaceContext()) return;
    if (pageDocument.URL !== snapshotUrl) {
      setExceptionTitle(
        "분석 후 지원서 페이지가 변경되었습니다. 다시 시작해 주세요",
      );
      setStage("exception");
      return;
    }
    if (
      companyId === "generic" &&
      analysis.mode === "ADAPTER" &&
      hasComponentFieldCandidates(
        snapshot.request.sections.flatMap((section) => [
          ...section.fields,
          ...(section.items ?? []).flatMap((item) => item.fields),
        ]),
        snapshot.request.site,
      )
    ) {
      setExceptionTitle("페이지 구조를 확인할 수 없습니다. 다시 시작해 주세요");
      setStage("exception");
      return;
    }
    if (
      (executionPolicy(pageDocument)?.componentPolicy?.workflow
        .requireVerifiedMapping ||
        resolveDocumentCompany(pageDocument) === "hplace" ||
        nativePolicyRequired(pageDocument)) &&
      (analysis.mode !== "ADAPTER" ||
        analysis.fields.some(
          (field) => field.mappingStatus !== "ADAPTER_VERIFIED",
        ))
    ) {
      setExceptionTitle(
        "페이지 실행 방식이 변경되었습니다. 다시 시작해 주세요",
      );
      setStage("exception");
      return;
    }
    onAnalysis?.({
      mode: analysis.mode,
      durationMs: Math.round(performance.now() - analysisStarted),
      fieldCount: snapshot.request.sections.reduce(
        (count, section) =>
          count +
          section.fields.length +
          (section.items ?? []).reduce(
            (total, item) => total + item.fields.length,
            0,
          ),
        0,
      ),
      matchedCount: analysis.fields.filter(
        (field) => field.matchType === "MATCH",
      ).length,
    });
    if (
      [...failedGroups].some(
        (group) => !group.isConnected || group.ownerDocument !== pageDocument,
      )
    ) {
      setExceptionTitle("입력 보류 중 지원서 구조가 변경되었습니다");
      setStage("exception");
      return;
    }

    if (analysis.analysisStatus === "BLOCKED") {
      setExceptionTitle("이 페이지에서는 자동 기입을 진행할 수 없습니다");
      setStage("exception");
      return;
    }

    if (
      nativeDigest !== undefined &&
      JSON.stringify(analysis.executionPolicy?.browserPolicy) !== nativeDigest
    ) {
      setExceptionTitle(
        "페이지 실행 정책이 변경되었습니다. 다시 시작해 주세요",
      );
      setStage("exception");
      return;
    }
    // Generic field analysis has no site engine. Keep the separately loaded
    // provider contract without retaining the previous site's mapping engine.
    const providerPolicy =
      analysis.executionPolicy?.providerPolicy ??
      executionPolicy(pageDocument)?.providerPolicy;
    installExecutionPolicy(
      pageDocument,
      analysis.executionPolicy
        ? { ...analysis.executionPolicy, providerPolicy }
        : providerPolicy
          ? {
              version: 1,
              searches: [],
              failureScopes: [],
              address: null,
              providerPolicy,
            }
          : undefined,
    );

    // The section flow writes nothing before the user approves the review.
    const addressAnalysis = genericResult
      ? analysis
      : await runAddressAnalysis({
          analysis,
          snapshot,
          adapter,
          run,
          pageDocument,
          profile: loadedProfile,
          repository,
          addressSearch,
          onActivity,
          onAddressOperation,
          onWriteResult,
          setAddressResult,
        });
    if (!addressAnalysis) return;
    analysis = addressAnalysis;

    const refreshAfterWrites = async (): Promise<boolean> => {
      if (
        !refreshFieldsAfterPass ||
        options.reviewOnly ||
        (!executionPolicy(pageDocument)?.browserPolicy?.refreshAfterPass &&
          !executionPolicy(pageDocument)?.componentPolicy?.workflow
            .refreshAfterPass)
      )
        return false;
      const next = await collectFields(pageDocument, run.controller.signal);
      if (
        run.controller.signal.aborted ||
        currentAnalysisGeneration !== analysisGeneration
      )
        return true;
      const latestProfile = await repository.load();
      if (
        run.controller.signal.aborted ||
        currentAnalysisGeneration !== analysisGeneration
      )
        return true;
      if (
        pageDocument.URL !== snapshotUrl ||
        JSON.stringify(latestProfile) !== JSON.stringify(loadedProfile)
      ) {
        setExceptionTitle(
          "입력 중 페이지 또는 프로필이 변경되었습니다. 다시 시작해 주세요",
        );
        setStage("exception");
        return true;
      }
      const refreshed = await refreshFieldsAfterPass(
        next,
        (handle, previous) => {
          if (
            [...failedGroups].some((group) =>
              [...handle.elements, ...(handle.customElements ?? [])].some(
                (element) => group.contains(element),
              ),
            )
          )
            return false;
          if (previous?.matchType === "MATCH") {
            const key =
              previous.valueBinding?.profileFieldKey ??
              previous.profileFieldKey;
            if (
              key &&
              resolveProfileFieldValue(loadedProfile, key, handle.itemIndex)
                .status === "missing"
            )
              return false;
          }
          return true;
        },
      );
      if (
        run.controller.signal.aborted ||
        currentAnalysisGeneration !== analysisGeneration
      )
        return true;
      if (!refreshed) return false;
      await analyzeFields(
        loadedProfile,
        ignoreFreshRowDefaults,
        completedStateDriverKeys,
        failedGroups,
        genericPass,
      );
      return true;
    };

    // Share reads only while preparing this plan synchronously. The cache is
    // released before UI callbacks, awaits and every actual write.
    const plan = snapshot.registry.withReadCache(() => {
      const finishDefaults = startLocalTiming("default-checks");
      const ignoreCurrentValueCandidateIds = new Set(
        ignoreFreshRowDefaults
          ? analysis.fields.flatMap((field) => {
              const lookup = snapshot.registry.lookupField(field.candidateId);
              return (lookup.status === "ready" ||
                lookup.status === "blocked") &&
                adapter.isFreshRowDefault(lookup.handle.candidate.domName)
                ? [field.candidateId]
                : [];
            })
          : [],
      );
      if (analysis.mode === "ADAPTER") {
        for (const field of analysis.fields) {
          if (field.matchType !== "MATCH") continue;
          const lookup = snapshot.registry.lookupField(field.candidateId);
          if (
            lookup.status === "ready" &&
            adapter.prefersProfileValue?.(lookup.handle, field)
          )
            ignoreCurrentValueCandidateIds.add(field.candidateId);
        }
      }
      const freshDefaultCandidateIds = new Set(
        analysis.fields.flatMap((field) => {
          const lookup = snapshot.registry.lookupField(field.candidateId);
          return lookup.status === "ready" &&
            lookup.handle.customElements?.some((element) =>
              freshDefaultControls.current.has(element),
            )
            ? [field.candidateId]
            : [];
        }),
      );
      finishDefaults();
      const finishPlan = startLocalTiming("review-plan");
      const preparedPlan = buildReviewPlan({
        analysis,
        profile: loadedProfile,
        registry: snapshot.registry,
        ignoreCurrentValueCandidateIds,
        freshDefaultCandidateIds,
        normalizeDirectValue: (key, value) =>
          adapterProfileValue(adapter, key, value),
      });
      finishPlan();
      return preparedPlan;
    });
    if (run.nativeMajors?.unavailable.length)
      plan.items.push(...run.nativeMajors.unavailable);
    // Step-1 legacy fields present but structurally unverified (AGENTS.md).
    // The page may resolve as "hplace" or as the native "policy" engine; the
    // helper itself requires the Hplace fingerprint and the writeResume path.
    if (analysis.mode !== "GENERIC")
      plan.items.push(
        ...hplaceUnverifiedRows(pageDocument, snapshot.request, loadedProfile),
      );
    // Dependents a native driver withheld and this pass did not collect.
    if (native && analysis.mode !== "GENERIC" && run.nativeDependents)
      plan.items.push(
        ...nativeDependentRows(
          run.nativeDependents,
          snapshot.request,
          snapshot.registry,
          loadedProfile,
        ),
      );
    const finishReviewLog = startLocalTiming("review-log");
    debugReviewPlan(plan);
    finishReviewLog();
    observeQuality(() =>
      apiClient.quality?.review(snapshot.request.snapshotId, plan.items),
    );
    if (plan.status === "blocked") {
      debugReviewDecisions(plan, snapshot.registry);
      setExceptionTitle("이 페이지에서는 자동 기입을 진행할 수 없습니다");
      setStage("exception");
      return;
    }
    const completedSearchItems = options.reviewOnly
      ? rebindSearchFollowUps(
          reviewFollowUps,
          plan.items,
          snapshot,
          completedSearchFollowUps,
        )
      : undefined;
    if (options.reviewOnly && !completedSearchItems) {
      setExceptionTitle(
        "검색으로 채운 항목을 새 분석 결과에 다시 연결하지 못했습니다",
      );
      setStage("exception");
      return;
    }
    const completedSearchCandidateIds = new Set(
      completedSearchItems?.map((item) => item.candidateId),
    );
    if (genericResult)
      onGenericGrades?.(genericResult.grades, genericResult.sections);
    setFieldsSnapshot(snapshot);
    setPartial(plan.status === "partial");
    const analysisWarnings: string[] = [...(analysis.warningCodes ?? [])];
    if (
      options.reviewOnly &&
      reviewFollowUps.some((followUp) =>
        missingFollowUpGrade(followUp, loadedProfile, plan.items, snapshot),
      )
    ) {
      analysisWarnings.push("검색 후 드러난 급수 항목은 직접 확인해 주세요.");
    }
    setWarnings(analysisWarnings);
    if (plan.items.length === 0) {
      debugReviewDecisions(plan, snapshot.registry);
      if (await refreshAfterWrites()) return;
      setReviewItems([]);
      setResults([]);
      if (options.reviewOnly) {
        setStage("review");
        return;
      }
      if (
        analysis.mode === "GENERIC" &&
        completedGenericStateDrivers.current.size > 0
      ) {
        setWarnings((current) => [
          ...current,
          "자동으로 적용한 조건부 선택을 재분석에서 확인하지 못했습니다. 직접 확인해 주세요.",
        ]);
      }
      setStage("result");
      return;
    }
    const finishAutomaticItems = startLocalTiming("automatic-items");
    const planItems = genericResult
      ? plan.items.map((item) => {
          const graded = applyGenericGrade(
            item,
            genericGradeFor(genericResult, item.candidateId),
          );
          return genericStructure
            ? applyGenericStructureReview(graded, snapshot, genericStructure)
            : graded;
        })
      : plan.items;
    const automaticItems = snapshot.registry.withReadCache(() =>
      planItems.map((item) => {
        if (options.reviewOnly) {
          return completedSearchCandidateIds.has(item.candidateId)
            ? {
                ...item,
                selected: false,
                disabled: true,
                reason:
                  "검색 결과가 같은 행에 유지되어 다시 검색하지 않습니다.",
              }
            : { ...item, selected: false };
        }
        if (genericResult) return item;
        if (
          item.analysis?.writePlan?.command === "SELECT_DATE" &&
          item.status === "available" &&
          !item.disabled
        )
          return { ...item, selected: true };
        const automatic =
          item.status === "needs-review" && !item.disabled
            ? { ...item, selected: true }
            : item;
        const lookup = snapshot.registry.lookupField(item.candidateId);
        return lookup.status === "ready" &&
          adapter.canWriteProfileOption?.(lookup.handle, automatic) === false
          ? { ...automatic, selected: false }
          : automatic;
      }),
    );
    // Diagnostics describe the items that will actually execute, after adapter
    // promotion and explicit review/option gates have decided their selection.
    debugReviewDecisions({ ...plan, items: automaticItems }, snapshot.registry);
    finishAutomaticItems();
    setReviewItems(automaticItems);
    if (options.reviewOnly || genericResult) {
      setStage("review");
      return;
    }
    const retained =
      analysis.mode === "GENERIC"
        ? retainedDriverReviewResults(
            retainedDriverCandidates(
              automaticItems,
              snapshot.registry,
              completedGenericStateDrivers.current,
            ),
            completedGenericStateDrivers.current,
          )
        : { results: [], unmatched: false };
    const retainedDriverResults = retained.results;
    const retainedDriverVerificationFailed =
      retained.unmatched ||
      retainedDriverResults.some((result) => result.status === "skipped");
    if (retained.unmatched) {
      setWarnings((current) => [
        ...current,
        "자동으로 적용한 조건부 선택을 재분석에서 확인하지 못했습니다. 직접 확인해 주세요.",
      ]);
    }
    if (retainedDriverVerificationFailed) {
      setResults(retainedDriverResults);
      setStage("result");
      return;
    }
    if (
      runtimeRules(pageDocument)?.components?.workflow.enforceUniqueEmail &&
      automaticItems.filter(
        (item) =>
          item.analysis?.valueBinding?.type === "DIRECT" &&
          item.analysis.valueBinding.profileFieldKey ===
            executionPolicy(pageDocument)?.componentPolicy?.workflow
              .emailProfileKey,
      ).length > 1
    ) {
      setExceptionTitle("이메일 입력 대상을 하나로 확인하지 못했습니다");
      setStage("exception");
      return;
    }
    const deferredResultFor = (item: ReviewPlanItem): ApprovedWriteResult => {
      const lookup = snapshot.registry.lookupField(item.candidateId);
      const handle =
        lookup.status === "ready" || lookup.status === "blocked"
          ? lookup.handle
          : undefined;
      const source = handle?.elements[0] ?? handle?.customElements?.[0];
      const failure = source
        ? deferredDriverFailures.current.get(source)
        : undefined;
      const key =
        handle &&
        stateDriverKey(
          item,
          handle.candidate.domName ?? handle.candidate.domId,
          handle.itemIndex,
        );
      const ownFailure = failure && failure.key === key ? failure : undefined;
      // A dependent withheld by a non-search native driver names that cause.
      const byDriver =
        !ownFailure &&
        !!source &&
        !!run.nativeDependents?.driverDeferred.has(source);
      return {
        candidateId: item.candidateId,
        status: "skipped",
        reason: deferredDriverReason(
          ownFailure?.code,
          analysis.mode === "GENERIC",
          byDriver ? ROW_DRIVER_REASON : ROW_SEARCH_REASON,
        ),
        failureCode:
          ownFailure?.code ??
          (byDriver ? "ROW_DRIVER_UNCONFIRMED" : "ROW_SEARCH_UNCONFIRMED"),
      };
    };
    const finishDriverDiscovery = startLocalTiming("driver-discovery");
    const stateDriverItems = snapshot.registry.withReadCache(() =>
      automaticItems.flatMap((item) => {
        const lookup = snapshot.registry.lookupField(item.candidateId);
        if (lookup.status !== "ready" && lookup.status !== "blocked") return [];
        const domName =
          lookup.handle.candidate.domName ?? lookup.handle.candidate.domId;
        const stage =
          adapter.stateDriverStage?.(item, lookup.handle) ??
          (adapter.isStateDriver(item, domName) ||
          (analysis.mode === "GENERIC" &&
            isGenericStateDriver(item, lookup.handle))
            ? 1
            : undefined);
        const key = stateDriverKey(item, domName, lookup.handle.itemIndex);
        return belongsToFailedGroup(item, snapshot, failedGroups) ||
          !item.selected ||
          item.disabled ||
          stage === undefined ||
          completedStateDriverKeys.has(key)
          ? []
          : [
              {
                item,
                handle: lookup.handle,
                domName,
                stage,
                key,
                captured: executionPolicy(pageDocument)?.componentPolicy
                  ?.workflow.captureDriverResults
                  ? captureComponentResultTargets(snapshot.registry, [item])
                  : undefined,
                genericTargets:
                  analysis.mode === "GENERIC"
                    ? genericControlledRegions(lookup.handle)
                    : [],
              },
            ];
      }),
    );
    finishDriverDiscovery();
    if (nativeFinalPass && stateDriverItems.length > 0) {
      // Report-only end: no driver and no ordinary write runs on this request.
      const pendingStage = Math.min(
        ...stateDriverItems.map((driver) => driver.stage),
      );
      debugStageCounts(
        "drivers",
        stateDriverItems.filter((driver) => driver.stage === pendingStage)
          .length,
        0,
      );
      debugRuntimeSkip(
        "native-analysis",
        "analysis-limit",
        "budget",
        "collect",
      );
      setResults(
        snapshot.registry.withReadCache(() =>
          automaticItems.flatMap((item): ApprovedWriteResult[] => {
            if (belongsToFailedGroup(item, snapshot, failedGroups))
              return [deferredResultFor(item)];
            const lookup = snapshot.registry.lookupField(item.candidateId);
            if (
              (lookup.status === "ready" || lookup.status === "blocked") &&
              completedStateDriverKeys.has(
                stateDriverKey(
                  item,
                  lookup.handle.candidate.domName ??
                    lookup.handle.candidate.domId,
                  lookup.handle.itemIndex,
                ),
              )
            )
              return [{ candidateId: item.candidateId, status: "written" }];
            if (
              item.disabled ||
              !(item.selected || item.status === "needs-review")
            )
              return [];
            return [
              {
                candidateId: item.candidateId,
                status: "skipped",
                outcome: "needs-verification",
                reason: "입력 분석 한도에 도달해 자동으로 입력하지 않았습니다.",
                failureCode: "DRIVER_LIMIT_REACHED",
              },
            ];
          }),
        ),
      );
      setStage("result");
      return;
    }
    if (stateDriverItems.length > 0) {
      if (analysis.mode === "GENERIC" && genericPass >= 3) {
        setWarnings([
          "조건부 입력 분석 한도에 도달했습니다. 남은 항목을 직접 확인해 주세요.",
        ]);
        setStage("review");
        return;
      }
      const nextStage = Math.min(
        ...stateDriverItems.map((driver) => driver.stage),
      );
      const sameStageDrivers = stateDriverItems.filter(
        (driver) => driver.stage === nextStage,
      );
      // Reuse the stage while its next target still has the reviewed structure.
      // A replaced control or changed options returns to the normal analysis pass.
      const currentStateDriverItems = [...sameStageDrivers];
      startLocalTiming("driver-batch", {
        count: currentStateDriverItems.length,
        stage: nextStage,
        version: 2,
      })();
      const continuationGuards = new Map(
        currentStateDriverItems.map((driver) => [
          driver.item.candidateId,
          driverContinuationGuard(driver.handle),
        ]),
      );
      const rememberComponentWrite = (
        driver: (typeof currentStateDriverItems)[number],
      ) => {
        if (!driver.captured) return;
        completedComponentStateDrivers.current.set(driver.key, {
          originalItem: driver.item,
          sourceRegistry: snapshot.registry,
          captured: driver.captured,
          identity: componentReceiptIdentity(driver.item),
        });
      };
      const failureCodes = new Map<string, WriteFailureCode>();
      const logDriverPhase = (
        phase: string,
        successful?: readonly boolean[],
      ) => {
        currentStateDriverItems.forEach(({ item, handle, stage }, index) => {
          const lookup = snapshot.registry.lookupField(item.candidateId);
          localWorkflowLog(phase, {
            companyId,
            snapshotId: snapshot.request.snapshotId,
            candidateId: item.candidateId,
            fieldLabel: item.fieldLabel,
            command: item.analysis?.writePlan?.command,
            stage,
            successful: successful?.[index],
            failureCode: failureCodes.get(item.candidateId),
            lookup: lookup.status,
            blockReason:
              lookup.status === "blocked" ? lookup.reason : undefined,
            connected: [
              ...handle.elements,
              ...(handle.customElements ?? []),
            ].every((element) => element.isConnected),
          });
        });
      };
      logDriverPhase("drivers-start");
      const plannedDrivers = currentStateDriverItems.length;
      const stateSelectionResults: ApprovedWriteResult[] = [];
      const reportFor = (item: ReviewPlanItem) => (code: WriteFailureCode) => {
        if (!run.controller.signal.aborted)
          failureCodes.set(item.candidateId, code);
        localWorkflowLog("driver-failure-code", {
          companyId,
          snapshotId: snapshot.request.snapshotId,
          candidateId: item.candidateId,
          fieldLabel: item.fieldLabel,
          failureCode: code,
        });
      };
      const deferFailedGroups = async (
        successful: readonly boolean[],
        writesVerified = false,
        genericFailures = false,
      ) => {
        if (run.controller.signal.aborted) return true;
        const currentProfile = await repository.load();
        if (run.controller.signal.aborted) return true;
        if (
          pageDocument.URL !== snapshotUrl ||
          JSON.stringify(currentProfile) !== JSON.stringify(loadedProfile)
        ) {
          setExceptionTitle(
            "입력 중 페이지 또는 프로필이 변경되었습니다. 다시 시작해 주세요",
          );
          setStage("exception");
          return true;
        }
        try {
          if (activeModal(pageDocument)) {
            setExceptionTitle("열린 팝업을 닫은 뒤 다시 시작해 주세요");
            setStage("exception");
            return true;
          }
        } catch {
          setExceptionTitle(
            "열린 팝업 상태를 확인하지 못했습니다. 팝업을 닫고 다시 시작해 주세요",
          );
          setStage("exception");
          return true;
        }
        const nextGroups = new Set(failedGroups);
        const nextCompleted = new Set(completedStateDriverKeys);
        // Native drivers whose own value is verified though a dependent did
        // not settle: written, with only the dependents deferred.
        const verifiedDrivers = new Set<number>();
        const nativeDependents =
          native && analysis.mode !== "GENERIC"
            ? (run.nativeDependents ??= createNativeDependentState())
            : undefined;
        for (const [index, driver] of currentStateDriverItems.entries()) {
          if (successful[index]) {
            nextCompleted.add(driver.key);
            continue;
          }
          if (genericFailures || analysis.mode === "GENERIC") {
            // A generic driver defers its own controls and the region it controls.
            const scope = [
              ...driver.handle.elements,
              ...(driver.handle.customElements ?? []),
              ...driver.genericTargets,
            ];
            if (
              scope.length === 0 ||
              !scope.every(
                (element) =>
                  element.isConnected && element.ownerDocument === pageDocument,
              )
            )
              return false;
            scope.forEach((element) => nextGroups.add(element));
            continue;
          }
          const dependencies = adapter.stateDriverFailureTargets?.(
            driver.item,
            driver.handle,
          );
          if (
            dependencies?.length &&
            dependencies.every(
              (element) =>
                element.isConnected && element.ownerDocument === pageDocument,
            )
          ) {
            const own = new Set<Element>([
              ...driver.handle.elements,
              ...(driver.handle.customElements ?? []),
            ]);
            const nativeDriver =
              !!nativeDependents && driver.handle.owner === "native";
            const nonSearch =
              nativeDriver && !nativeOwnership(driver.handle)?.field.search;
            dependencies.forEach((element) => {
              nextGroups.add(element);
              if (nonSearch && !own.has(element))
                nativeDependents!.driverDeferred.add(element);
            });
            if (
              nonSearch &&
              writesVerified &&
              stateSelectionResults[index]?.status === "written" &&
              !dependencies.some((element) => own.has(element))
            )
              verifiedDrivers.add(index);
            nextCompleted.add(driver.key);
            continue;
          }
          const group = adapter.stateDriverFailureGroup?.(
            driver.item,
            driver.handle,
          );
          const targets = [
            ...driver.handle.elements,
            ...(driver.handle.customElements ?? []),
          ];
          // Company rules may defer dependencies; otherwise defer the failed field itself.
          const validGroup =
            group?.isConnected &&
            group.ownerDocument === pageDocument &&
            targets.every((element) => group.contains(element));
          if (validGroup) nextGroups.add(group!);
          else {
            if (
              !targets.length ||
              targets.some(
                (element) =>
                  !element.isConnected ||
                  element.ownerDocument !== pageDocument,
              )
            )
              return false;
            targets.forEach((element) => nextGroups.add(element));
          }
          nextCompleted.add(driver.key);
          localWorkflowLog("driver-deferred", {
            companyId,
            candidateId: driver.item.candidateId,
            fieldLabel: driver.item.fieldLabel,
            scope: validGroup ? "adapter-group" : "field",
          });
        }
        if (run.controller.signal.aborted) return true;
        if (nativeDependents)
          currentStateDriverItems.forEach((driver, index) => {
            if (driver.handle.owner === "native")
              rememberNativeDependents(
                nativeDependents,
                driver.handle,
                driver.item,
                !successful[index],
              );
          });
        currentStateDriverItems.forEach((driver, index) => {
          if (verifiedDrivers.has(index)) {
            onWriteResult?.(
              driver.item,
              { candidateId: driver.item.candidateId, status: "written" },
              snapshot.registry,
            );
            return;
          }
          const element =
            driver.handle.elements[0] ?? driver.handle.customElements?.[0];
          const failureCode =
            failureCodes.get(driver.item.candidateId) ??
            (analysis.mode === "GENERIC" ? undefined : "SEARCH_UNCONFIRMED");
          if (!successful[index] && element && failureCode)
            deferredDriverFailures.current.set(element, {
              key: driver.key,
              code: failureCode,
            });
          if (!successful[index])
            onWriteResult?.(
              driver.item,
              {
                candidateId: driver.item.candidateId,
                status: "skipped",
                reason: deferredDriverReason(
                  failureCode,
                  analysis.mode === "GENERIC",
                  "조건부 선택을 확인하지 못했습니다.",
                ),
                ...(failureCode ? { failureCode } : {}),
              },
              snapshot.registry,
            );
        });
        if (writesVerified) {
          currentStateDriverItems.forEach((driver, index) => {
            const { item } = driver;
            if (successful[index]) {
              rememberComponentWrite(driver);
              onWriteResult?.(
                item,
                { candidateId: item.candidateId, status: "written" },
                snapshot.registry,
              );
            }
          });
        }
        if (nativeForm(pageDocument)) {
          currentStateDriverItems.forEach(({ item, handle }, index) => {
            const name = handle.candidate.domName;
            if (successful[index] || !name?.startsWith("hplace")) return;
            debugRuntimeSkip(
              name,
              "driver-deferred",
              !writesVerified
                ? "driver-ready"
                : stateSelectionResults[index]?.status === "written"
                  ? "driver-settle"
                  : "driver-write",
              "write",
              failureCodes.get(item.candidateId) ?? "SEARCH_UNCONFIRMED",
            );
          });
          // A partially successful stage still prepares the majors of its
          // committed schools; failed schools report their extra majors.
          if (writesVerified && analysis.mode !== "GENERIC") {
            const majors = (run.nativeMajors ??= {
              attempted: new WeakSet(),
              unavailable: [],
            });
            await prepareNativeMajorsAfterSchool({
              document: pageDocument,
              profile: loadedProfile,
              handles: currentStateDriverItems
                .filter((_, index) => successful[index])
                .map((driver) => driver.handle),
              state: majors,
              apiClient,
              signal: run.controller.signal,
              beforeMutation: profileCurrent,
            });
            reportNativeMajorsOfFailedSchools({
              document: pageDocument,
              profile: loadedProfile,
              handles: currentStateDriverItems
                .filter((_, index) => !successful[index])
                .map((driver) => driver.handle),
              state: majors,
            });
          }
        }
        await analyzeFields(
          loadedProfile,
          ignoreFreshRowDefaults,
          nextCompleted,
          nextGroups,
          genericPass + (analysis.mode === "GENERIC" ? 1 : 0),
        );
        return true;
      };
      let profileChanged = false;
      const profileCurrent = async () => {
        const finishProfileCheck = startLocalTiming("profile-check");
        try {
          if (run.controller.signal.aborted) return false;
          const same =
            JSON.stringify(await repository.load()) ===
            JSON.stringify(loadedProfile);
          if (!same) profileChanged = true;
          return (
            same &&
            !run.controller.signal.aborted &&
            pageDocument.URL === snapshotUrl
          );
        } finally {
          finishProfileCheck();
        }
      };
      const driversReady = await Promise.all(
        currentStateDriverItems.map(
          ({ handle, item }) =>
            adapter.waitForStateDriverReady?.(
              pageDocument,
              handle,
              reportFor(item),
              {
                item,
                signal: run.controller.signal,
                beforeMutation: profileCurrent,
              },
            ) ?? true,
        ),
      );
      logDriverPhase("drivers-ready", driversReady);
      if (!driversReady.every(Boolean)) {
        if (nativeForm(pageDocument))
          debugStageCounts("drivers", plannedDrivers, 0);
        if (await deferFailedGroups(driversReady)) return;
        setExceptionTitle("조건부 선택 메뉴를 안전하게 준비하지 못했습니다");
        setStage("exception");
        return;
      }
      for (const { item, captured, stage } of currentStateDriverItems) {
        const lookup = snapshot.registry.lookupField(item.candidateId);
        if (
          stateSelectionResults.length > 0 &&
          (lookup.status !== "ready" ||
            !continuationGuards.get(item.candidateId)?.())
        ) {
          startLocalTiming("driver-recollect", {
            field: item.profileFieldKey ?? "",
            reason: lookup.status === "ready" ? "metadata" : lookup.status,
          })();
          currentStateDriverItems.splice(stateSelectionResults.length);
          break;
        }
        const eligible =
          lookup.status === "ready" &&
          item.selected &&
          !item.disabled &&
          item.status !== "unavailable" &&
          (item.analysis?.mappingStatus === "ADAPTER_VERIFIED" ||
            (analysis.mode === "GENERIC" &&
              item.analysis?.mappingStatus === "LLM_SUGGESTED")) &&
          item.analysis.interactionStatus === "READY";
        if (run.controller.signal.aborted) return;
        if (!(await profileCurrent())) {
          if (run.controller.signal.aborted) return;
          setExceptionTitle(
            pageDocument.URL !== snapshotUrl
              ? "분석 후 지원서 페이지가 변경되었습니다. 다시 시작해 주세요"
              : "분석 후 프로필이 변경되었습니다. 다시 시작해 주세요",
          );
          setStage("exception");
          return;
        }
        if (!eligible) {
          stateSelectionResults.push({
            candidateId: item.candidateId,
            status: "skipped",
            outcome: "needs-verification",
            code: "NOT_APPROVED",
            reason: "조건부 선택 항목을 자동으로 실행할 수 없습니다.",
          });
          continue;
        }
        if (presentField) {
          setStage("writing");
          await presentField(snapshot.registry, item);
          if (run.controller.signal.aborted) return;
          if (!(await profileCurrent())) {
            if (run.controller.signal.aborted) return;
            setExceptionTitle(
              pageDocument.URL !== snapshotUrl
                ? "분석 후 지원서 페이지가 변경되었습니다. 다시 시작해 주세요"
                : "분석 후 프로필이 변경되었습니다. 다시 시작해 주세요",
            );
            setStage("exception");
            return;
          }
        }
        if (
          stateSelectionResults.length > 0 &&
          (snapshot.registry.lookupField(item.candidateId).status !== "ready" ||
            !continuationGuards.get(item.candidateId)?.())
        ) {
          startLocalTiming("driver-recollect", {
            field: item.profileFieldKey ?? "",
            reason: "post-await-changed",
          })();
          currentStateDriverItems.splice(stateSelectionResults.length);
          break;
        }
        if (
          getWriteAdapter(pageDocument).completion?.(lookup.handle, item)
            ?.stage === stage
        ) {
          if (
            !captured ||
            !getWriteAdapter(pageDocument).completion?.(lookup.handle, item)
          ) {
            setExceptionTitle("입력 대상이 변경되었습니다. 다시 시작해 주세요");
            setStage("exception");
            return;
          }
          stateSelectionResults.push(
            ...(await executeApprovedWritesAfterPageSettles({
              items: [item],
              approvedCandidateIds: new Set([item.candidateId]),
              registry: snapshot.registry,
              document: pageDocument,
              signal: run.controller.signal,
              beforeMutation: profileCurrent,
              assertCurrent: () =>
                pageDocument.URL === snapshotUrl &&
                lookup.handle.isCurrentContext?.() !== false,
              settledRegistry: () =>
                recollectComponentResultRegistry(pageDocument, captured, [
                  item,
                ]),
            })),
          );
          if (run.controller.signal.aborted) return;
          if (profileChanged) {
            setExceptionTitle(
              "분석 후 프로필이 변경되었습니다. 다시 시작해 주세요",
            );
            setStage("exception");
            return;
          }
          continue;
        }
        const special = eligible
          ? await adapter.executeStateDriver?.(
              pageDocument,
              lookup.handle,
              item,
              run.controller.signal,
              reportFor(item),
              profileCurrent,
            )
          : undefined;
        if (profileChanged) {
          setExceptionTitle(
            "분석 후 프로필이 변경되었습니다. 다시 시작해 주세요",
          );
          setStage("exception");
          return;
        }
        stateSelectionResults.push(
          ...(special === undefined
            ? await (
                analysis.mode === "GENERIC"
                  ? executeApprovedWritesAfterPageSettles
                  : executeApprovedWrites
              )({
                items: [item],
                approvedCandidateIds: new Set([item.candidateId]),
                registry: snapshot.registry,
              })
            : special
              ? [{ candidateId: item.candidateId, status: "written" as const }]
              : [
                  {
                    candidateId: item.candidateId,
                    status: "skipped" as const,
                    outcome: "failed" as const,
                    code: "EXECUTION_FAILED" as const,
                    reason: "조건부 선택을 실행하지 못했습니다.",
                  },
                ]),
        );
        const result = stateSelectionResults.at(-1);
        localWorkflowLog("driver-executed", {
          companyId,
          snapshotId: snapshot.request.snapshotId,
          candidateId: item.candidateId,
          fieldLabel: item.fieldLabel,
          stage,
          command: item.analysis?.writePlan?.command,
          status: result?.status,
          code: result?.status === "skipped" ? result.code : undefined,
          failureCode: failureCodes.get(item.candidateId),
        });
        if (result?.status === "skipped" && result.failureCode)
          reportFor(item)(result.failureCode);
        if (result?.status !== "written") {
          if (nativeForm(pageDocument) && lookup.handle.owner === "native") {
            // Native drivers of one stage run as one batch. Only later drivers
            // whose controls the failed driver defers are dropped (no result).
            const deferred = new Set(
              adapter.stateDriverFailureTargets?.(item, lookup.handle) ??
                lookup.handle.elements,
            );
            for (
              let later = currentStateDriverItems.length - 1;
              later >= stateSelectionResults.length;
              later--
            ) {
              const { handle } = currentStateDriverItems[later];
              if (
                [...handle.elements, ...(handle.customElements ?? [])].some(
                  (element) => deferred.has(element),
                )
              )
                currentStateDriverItems.splice(later, 1);
            }
            continue;
          }
          currentStateDriverItems.splice(stateSelectionResults.length);
          break;
        }
      }
      if (nativeForm(pageDocument))
        debugStageCounts(
          "drivers",
          plannedDrivers,
          stateSelectionResults.length,
        );
      if (
        stateSelectionResults.every((result) => result.status === "written")
      ) {
        const settled = await Promise.all(
          currentStateDriverItems.map(({ handle, item, genericTargets }) =>
            analysis.mode === "GENERIC"
              ? waitForGenericEffect(genericTargets, run.controller.signal)
              : (adapter.settleStateDriver?.(
                  pageDocument,
                  handle,
                  reportFor(item),
                  {
                    item,
                    signal: run.controller.signal,
                    beforeMutation: profileCurrent,
                  },
                ) ?? true),
          ),
        );
        logDriverPhase("drivers-settled", settled);
        if (!settled.every(Boolean)) {
          if (analysis.mode === "GENERIC") {
            setResults(
              stateSelectionResults.map((result, index) =>
                settled[index]
                  ? result
                  : {
                      candidateId: result.candidateId,
                      status: "skipped" as const,
                      outcome: "needs-verification" as const,
                      code: "RETAINED_VALUE_UNCONFIRMED" as const,
                      reason:
                        "조건부 선택 뒤 표시된 입력란을 확인하지 못했습니다.",
                    },
              ),
            );
            setStage("result");
            return;
          }
          if (await deferFailedGroups(settled, true)) return;
          setExceptionTitle(
            "조건부 선택 뒤 입력란을 안전하게 준비하지 못했습니다",
          );
          setStage("exception");
          return;
        }
        currentStateDriverItems.forEach((driver) => {
          const { item } = driver;
          rememberComponentWrite(driver);
          onWriteResult?.(
            item,
            {
              candidateId: item.candidateId,
              status: "written",
            },
            snapshot.registry,
          );
        });
        if (native && analysis.mode !== "GENERIC")
          for (const { handle, item } of currentStateDriverItems)
            if (handle.owner === "native")
              rememberNativeDependents(
                (run.nativeDependents ??= createNativeDependentState()),
                handle,
                item,
                false,
              );
        const nextCompletedStateDriverKeys = new Set(completedStateDriverKeys);
        currentStateDriverItems.forEach(({ key }) =>
          nextCompletedStateDriverKeys.add(key),
        );
        if (analysis.mode === "GENERIC") {
          const nextCompletedGenericDrivers = new Map(
            completedGenericStateDrivers.current,
          );
          currentStateDriverItems.forEach((driver, index) => {
            if (
              stateSelectionResults[index]?.status === "written" &&
              driver.item.profileValue
            ) {
              nextCompletedGenericDrivers.set(driver.key, {
                profileValue: driver.item.profileValue,
              });
            }
          });
          completedGenericStateDrivers.current = nextCompletedGenericDrivers;
        }
        await prepareNativeMajorsAfterSchool({
          document: pageDocument,
          profile: loadedProfile,
          handles: currentStateDriverItems.map((driver) => driver.handle),
          state: (run.nativeMajors ??= {
            attempted: new WeakSet(),
            unavailable: [],
          }),
          apiClient,
          signal: run.controller.signal,
          beforeMutation: profileCurrent,
        });
        await analyzeFields(
          loadedProfile,
          ignoreFreshRowDefaults,
          nextCompletedStateDriverKeys,
          failedGroups,
          genericPass + (analysis.mode === "GENERIC" ? 1 : 0),
        );
        return;
      }
      if (adapter.stateDriverStage) {
        // A successful write still needs its normal settle check before continuing.
        const successful = await Promise.all(
          currentStateDriverItems.map(
            async ({ handle, item }, index) =>
              stateSelectionResults[index]?.status === "written" &&
              ((await adapter.settleStateDriver?.(
                pageDocument,
                handle,
                reportFor(item),
                {
                  item,
                  signal: run.controller.signal,
                  beforeMutation: profileCurrent,
                },
              )) ??
                true),
          ),
        );
        logDriverPhase("drivers-failed-or-unsettled", successful);
        if (await deferFailedGroups(successful, true)) return;
        logDriverPhase("exception-cannot-isolate-driver", successful);
        const failedLabel = runtimeRules(pageDocument)?.components?.workflow
          .driverFailureLabel
          ? currentStateDriverItems.find((_, index) => !successful[index])?.item
              .fieldLabel
          : undefined;
        setExceptionTitle(
          failedLabel
            ? `${failedLabel} 선택을 안전하게 적용하지 못했습니다`
            : "조건부 선택을 안전하게 적용하지 못했습니다",
        );
        setStage("exception");
        return;
      }
      if (analysis.mode === "GENERIC") {
        // Keep confirmed writes; defer failed controls and their known dependent regions.
        if (
          stateSelectionResults.length === currentStateDriverItems.length &&
          stateSelectionResults.some((result) => result.status !== "written")
        ) {
          const settled = await Promise.all(
            currentStateDriverItems.map(({ genericTargets }, index) =>
              stateSelectionResults[index]?.status !== "written"
                ? true
                : waitForGenericEffect(genericTargets, run.controller.signal),
            ),
          );
          if (settled.every(Boolean)) {
            const nextCompletedGenericDrivers = new Map(
              completedGenericStateDrivers.current,
            );
            currentStateDriverItems.forEach((driver, index) => {
              if (
                stateSelectionResults[index]?.status === "written" &&
                driver.item.profileValue
              )
                nextCompletedGenericDrivers.set(driver.key, {
                  profileValue: driver.item.profileValue,
                });
            });
            completedGenericStateDrivers.current = nextCompletedGenericDrivers;
            if (
              await deferFailedGroups(
                stateSelectionResults.map(
                  (result) => result.status === "written",
                ),
                true,
                true,
              )
            )
              return;
          }
        }
        setResults(stateSelectionResults);
        setStage("result");
        return;
      }
    }
    const finishOrdinaryPlan = startLocalTiming("ordinary-plan");
    const { approvedCandidateIds, deferredItems, finalWriteItems } =
      snapshot.registry.withReadCache(() => {
        const approvedCandidateIds = new Set(
          automaticItems
            .filter((item) => {
              const lookup = snapshot.registry.lookupField(item.candidateId);
              if (lookup.status !== "ready" && lookup.status !== "blocked") {
                return false;
              }
              const key = stateDriverKey(
                item,
                lookup.handle.candidate.domName ??
                  lookup.handle.candidate.domId,
                lookup.handle.itemIndex,
              );
              return (
                !completedStateDriverKeys.has(key) &&
                !item.disabled &&
                (item.selected || item.status === "needs-review")
              );
            })
            .map((item) => item.candidateId),
        );
        const deferredItems = automaticItems.filter((item) => {
          if (!belongsToFailedGroup(item, snapshot, failedGroups)) return false;
          if (analysis.mode !== "GENERIC") return true;
          const lookup = snapshot.registry.lookupField(item.candidateId);
          return (
            lookup.status !== "ready" ||
            !completedGenericStateDrivers.current.has(
              stateDriverKey(
                item,
                lookup.handle.candidate.domName ??
                  lookup.handle.candidate.domId,
                lookup.handle.itemIndex,
              ),
            )
          );
        });
        const finalWriteItems = automaticItems.filter((item) => {
          if (belongsToFailedGroup(item, snapshot, failedGroups)) return false;
          const lookup = snapshot.registry.lookupField(item.candidateId);
          if (lookup.status !== "ready" && lookup.status !== "blocked") {
            return true;
          }
          return !completedStateDriverKeys.has(
            stateDriverKey(
              item,
              lookup.handle.candidate.domName ?? lookup.handle.candidate.domId,
              lookup.handle.itemIndex,
            ),
          );
        });
        return { approvedCandidateIds, deferredItems, finalWriteItems };
      });
    if (
      JSON.stringify(await repository.load()) !== JSON.stringify(loadedProfile)
    ) {
      setExceptionTitle("분석 후 프로필이 변경되었습니다. 다시 시작해 주세요");
      setStage("exception");
      return;
    }
    if (run.controller.signal.aborted) return;
    if (rejectChangedHplaceContext()) return;
    setStage("writing");
    const componentTargets = executionPolicy(pageDocument)?.componentPolicy
      ?.workflow.captureDriverResults
      ? captureComponentResultTargets(snapshot.registry, automaticItems)
      : undefined;
    const componentDriverKeys = new Map<string, string>();
    const componentKeyCounts = new Map<string, number>();
    if (componentTargets) {
      for (const item of automaticItems) {
        const lookup = snapshot.registry.lookupField(item.candidateId);
        if (lookup.status !== "ready" && lookup.status !== "blocked") continue;
        const key = stateDriverKey(
          item,
          lookup.handle.candidate.domName ?? lookup.handle.candidate.domId,
          lookup.handle.itemIndex,
        );
        componentDriverKeys.set(item.candidateId, key);
        componentKeyCounts.set(key, (componentKeyCounts.get(key) ?? 0) + 1);
      }
    }
    const rebindComponentWrites = executionPolicy(pageDocument)?.componentPolicy
      ?.workflow.rebindReplacedControls
      ? captureComponentWriteRegistry(snapshot)
      : undefined;
    let ordinaryRegistry = snapshot.registry;
    let componentResultRegistry: CandidateRegistry | undefined;
    finishOrdinaryPlan();
    const writeResults = await executeApprovedWritesAfterPageSettles({
      document: pageDocument,
      onResult: onWriteResult,
      items: finalWriteItems,
      currentOrdinaryRegistry: rebindComponentWrites
        ? async (item) => {
            // Reuse live reviewed targets. React rendering alone does not require
            // rebuilding every field; recollect only when this target is stale.
            const current = ordinaryRegistry.lookupField(item.candidateId);
            if (current.status === "ready") return ordinaryRegistry;
            // Full collection retains row identity, option and context checks
            // when a replaced or changed control cannot reuse its old handle.
            ordinaryRegistry = rebindComponentWrites(
              await collectFields(pageDocument, run.controller.signal),
            );
            return ordinaryRegistry;
          }
        : undefined,
      approvedCandidateIds,
      registry: snapshot.registry,
      beforeWrite: presentField
        ? (item) => presentField(snapshot.registry, item)
        : undefined,
      signal: run.controller.signal,
      ...(companyId === "hplace" || nativePolicyRequired(pageDocument)
        ? {
            hplaceAddress: {
              address: loadedProfile.contact.addressLine1 ?? "",
              postalCode: loadedProfile.contact.postalCode ?? "",
            },
            assertCurrent: () =>
              currentAnalysisGeneration === analysisGeneration &&
              addressRun.current === run,
            beforeMutation: async () =>
              !run.controller.signal.aborted &&
              pageDocument.URL === snapshotUrl &&
              currentAnalysisGeneration === analysisGeneration &&
              addressRun.current === run &&
              JSON.stringify(await repository.load()) ===
                JSON.stringify(loadedProfile),
          }
        : {}),
      ...(componentTargets
        ? {
            settledRegistry: () => {
              componentResultRegistry = recollectComponentResultRegistry(
                pageDocument,
                componentTargets,
                automaticItems,
              );
              return componentResultRegistry;
            },
          }
        : {}),
      onSearchFollowUp: (item, controls) =>
        onSearchFollowUp?.(item, controls, snapshot.registry),
      ...(analysis.mode === "GENERIC"
        ? { followUpHaltScope: "row" as const }
        : {}),
    });
    if (run.controller.signal.aborted) return;
    const componentDriverResults: ApprovedWriteResult[] = [];
    if (componentResultRegistry) {
      setResultRegistry?.(componentResultRegistry);
      const writtenIds = new Set(
        writeResults
          .filter((result) => result.status === "written")
          .map((result) => result.candidateId),
      );
      rebindResultProgress?.(
        automaticItems.filter((item) => writtenIds.has(item.candidateId)),
        snapshot.registry,
        componentResultRegistry,
      );
      // Share only the read-only policy path; interactive verification recollects.
      const resolveReceipt =
        executionPolicy(pageDocument)?.componentPolicy
          ?.retainedSearchVerification === "RECORDED_VALUE"
          ? collectComponentResultResolver(pageDocument)
          : (
              captured: Parameters<typeof recollectComponentResultRegistry>[1],
              items: Parameters<typeof recollectComponentResultRegistry>[2],
            ) =>
              recollectComponentResultRegistry(pageDocument, captured, items);
      for (const item of automaticItems) {
        const key = componentDriverKeys.get(item.candidateId);
        if (!key || !completedStateDriverKeys.has(key)) continue;
        const receipt = completedComponentStateDrivers.current.get(key);
        const alias =
          receipt &&
          componentKeyCounts.get(key) === 1 &&
          receipt.identity === componentReceiptIdentity(item)
            ? resolveReceipt(receipt.captured, [receipt.originalItem])
            : undefined;
        const prior =
          receipt && alias?.lookupField(receipt.originalItem.candidateId);
        let searchUnverified = false;
        const current = componentResultRegistry.lookupField(item.candidateId);
        const live = resultFieldState(
          componentResultRegistry,
          pageDocument,
          item.candidateId,
        );
        const sameElement =
          prior &&
          (prior.status === "ready" || prior.status === "blocked") &&
          (current.status === "ready" || current.status === "blocked") &&
          (prior.handle.elements[0] ?? prior.handle.customElements?.[0]) ===
            (current.handle.elements[0] ?? current.handle.customElements?.[0]);
        const liveElement = live?.handle
          ? (live.handle.elements[0] ?? live.handle.customElements?.[0])
          : undefined;
        const retainedSearchVerification =
          executionPolicy(pageDocument)?.componentPolicy
            ?.retainedSearchVerification;
        const recordedSearchSelection =
          item.analysis?.writePlan?.command === "SEARCH_SELECTION" &&
          retainedSearchVerification === "RECORDED_VALUE" &&
          receipt?.identity === componentReceiptIdentity(item);
        const catalogSelectionRetained = !!(
          receipt &&
          sameElement &&
          liveElement &&
          (retainedCatalogSelection(item, liveElement) !== undefined ||
            rebindCatalogSelection(receipt.originalItem, item, liveElement))
        );
        const retainedSelection =
          item.analysis?.writePlan?.command !== "SEARCH_SELECTION" ||
          recordedSearchSelection ||
          catalogSelectionRetained;
        if (
          receipt &&
          alias &&
          sameElement &&
          live?.visible &&
          (current.status === "ready" || current.status === "blocked") &&
          componentGpaSafe(current.handle, item) &&
          matchesResultValue(
            item,
            live.value,
            item.profileValue ?? "",
            live.handle,
          ) &&
          (item.analysis?.writePlan?.command !== "SEARCH_SELECTION" ||
            (retainedSelection &&
              (retainedSearchVerification === "RECORDED_VALUE"
                ? recordedSearchSelection
                : retainedSearchVerification === "REOPEN_SELECTION" &&
                  (await adapter.executeStateDriver?.(
                    pageDocument,
                    current.handle,
                    item,
                    run.controller.signal,
                    (code) => {
                      if (code === "SEARCH_SELECTION_UNVERIFIED")
                        searchUnverified = true;
                    },
                    async () => {
                      const latestProfile = await repository.load();
                      return (
                        !run.controller.signal.aborted &&
                        pageDocument.URL === snapshotUrl &&
                        current.handle.isCurrentContext?.() !== false &&
                        current.handle.elements[0]?.value === live.value &&
                        JSON.stringify(latestProfile) ===
                          JSON.stringify(loadedProfile)
                      );
                    },
                  )) === true)))
        ) {
          if (run.controller.signal.aborted) return;
          rebindResultProgress?.(
            [receipt.originalItem],
            receipt.sourceRegistry,
            alias,
          );
          componentDriverResults.push({
            candidateId: item.candidateId,
            status: "written",
          });
        } else {
          if (run.controller.signal.aborted) return;
          const valueMatches =
            !!live?.visible &&
            matchesResultValue(
              item,
              live.value,
              item.profileValue ?? "",
              live.handle,
            );
          localWorkflowLog("component-retained-diagnostic", {
            candidateId: item.candidateId,
            fieldName: live?.handle.candidate.domName,
            fieldKey: item.profileFieldKey,
            receiptPresent: !!receipt,
            receiptIdentityMatches:
              !!receipt && receipt.identity === componentReceiptIdentity(item),
            aliasPresent: !!alias,
            priorStatus: prior?.status,
            currentStatus: current.status,
            capturedCount: componentTargets?.targets.length,
            receiptCapturedCount: receipt?.captured.targets.length,
            sameElement: !!sameElement,
            liveVisible: live?.visible,
            liveValue: live?.value,
            expectedValue: item.profileValue,
            valueMatches,
            searchUnverified,
          });
          componentDriverResults.push({
            candidateId: item.candidateId,
            status: "skipped",
            outcome: "needs-verification",
            code: "RETAINED_VALUE_UNCONFIRMED",
            failureCode: !valueMatches
              ? "VALUE_NOT_RETAINED"
              : searchUnverified ||
                  item.analysis?.writePlan?.command === "SEARCH_SELECTION"
                ? "SEARCH_SELECTION_UNVERIFIED"
                : "VALUE_MATCH_UNRECORDED",
            reason:
              "조건부 선택의 입력 기록과 현재 값을 함께 확인하지 못했습니다.",
          });
        }
      }
    }
    if (await refreshAfterWrites()) return;
    const pendingFollowUp = searchFollowUp
      ? takeWrittenSearchFollowUp(searchFollowUp, writeResults)
      : undefined;
    if (pendingFollowUp) {
      await analyzeFields(
        loadedProfile,
        ignoreFreshRowDefaults,
        completedStateDriverKeys,
        failedGroups,
        genericPass,
        { reviewOnly: true, searchFollowUp: pendingFollowUp },
      );
      return;
    }
    const deferredResults = deferredItems.map(deferredResultFor);
    const finalResults = [
      ...writeResults,
      ...retainedDriverResults,
      ...componentDriverResults,
      ...automaticItems
        .filter((item) => {
          const lookup = snapshot.registry.lookupField(item.candidateId);
          return (
            (lookup.status === "ready" || lookup.status === "blocked") &&
            analysis.mode !== "GENERIC" &&
            !executionPolicy(pageDocument)?.componentPolicy?.workflow
              .captureDriverResults &&
            completedStateDriverKeys.has(
              stateDriverKey(
                item,
                lookup.handle.candidate.domName ??
                  lookup.handle.candidate.domId,
                lookup.handle.itemIndex,
              ),
            )
          );
        })
        .map((item): ApprovedWriteResult => ({
          candidateId: item.candidateId,
          status: "written",
        })),
      ...deferredResults,
    ];
    const authoritativeResults = new Map<string, ApprovedWriteResult>();
    const resultPriority = (result: ApprovedWriteResult) => {
      if (result.status === "written") return 0;
      if (
        result.failureCode === "VALUE_NOT_RETAINED" ||
        result.failureCode === "VALUE_MATCH_UNRECORDED"
      )
        return 1;
      return 2;
    };
    for (const result of finalResults) {
      const current = authoritativeResults.get(result.candidateId);
      if (!current || resultPriority(result) > resultPriority(current))
        authoritativeResults.set(result.candidateId, result);
    }
    setResults([...authoritativeResults.values()]);
    dismissCompletedAutocomplete(pageDocument);
    setStage("result");
  };
  return analyzeFields;
}
