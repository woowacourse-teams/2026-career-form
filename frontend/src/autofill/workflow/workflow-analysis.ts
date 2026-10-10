import { hasGreetingFieldCandidates } from "../adapters/greeting/fingerprint";
import { resolveDocumentCompany } from "../adapters/company";
import { isGreetingEmailStateDriver } from "../adapters/greeting/workflow";
import { sensitiveValueApproved } from "./review-actions";
import type { CandidateRegistry } from "../dom/candidate-registry";
import { greetingGpaSafe } from "../adapters/greeting/gpa";
import { resultFieldState } from "./result-field-state";
import { matchesResultValue } from "./result-value-match";
import { rebindCatalogSelection } from "../profile/catalog-receipt";
import {
  captureGreetingResultTargets,
  recollectGreetingResultRegistry,
} from "./greeting-result-registry";
import type { WorkflowAnalysisContext } from "./workflow-analysis-types";
export type {
  CompletedGenericStateDriver,
  DeferredDriverFailures,
  GreetingStateDriverReceipt,
  GenericSearchFollowUp,
} from "./workflow-analysis-types";
import {
  retainedDriverCandidates,
  retainedDriverReviewResults,
} from "./retained-drivers";
import { collectFieldsSnapshotWithDropdowns } from "../dom/collect";
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
import { isPreMutationFailure } from "./driver-failure-scope";

import {
  isGenericStateDriver,
  genericControlledRegions,
  waitForGenericEffect,
} from "./generic-follow-up";
import {
  adapterProfileValue,
  addressValue,
  localProfileValue,
  reviewProfileFieldKey,
  stateDriverKey,
} from "./workflow-model";

function greetingReceiptIdentity(item: ReviewPlanItem): string {
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

export function createAnalyzeFields({
  onAnalysis,
  adapter,
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
  completedGreetingStateDrivers = { current: new Map() },
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
  presentField,
  onWriteResult,
  onSearchFollowUp,
  searchFollowUp,
  completedSearchFollowUps,
  onActivity,
  onAddressOperation,
}: WorkflowAnalysisContext) {
  let analysisGeneration = 0;
  const companyId = resolveDocumentCompany(pageDocument);
  const analyzeFields = async (
    loadedProfile: Profile,
    ignoreFreshRowDefaults = false,
    completedStateDriverKeys: ReadonlySet<string> = completedDriverKeys.current,
    failedGroups: ReadonlySet<Element> = deferredDriverGroups.current,
    genericPass = 0,
    options: SearchFollowUpAnalysisOptions = {},
  ) => {
    if (resolveDocumentCompany(pageDocument) === "hplace") {
      setStage("unsupported");
      return;
    }
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
    const snapshot = await collectFieldsSnapshotWithDropdowns(
      pageDocument,
      run.controller.signal,
    );
    if (
      run.controller.signal.aborted ||
      currentAnalysisGeneration !== analysisGeneration
    )
      return;
    if (resolveDocumentCompany(pageDocument) === "hplace") {
      setStage("unsupported");
      return;
    }

    const analysisStarted = performance.now();
    let analysis = await apiClient.analyzeFields(snapshot.request);
    debugAnalysis(snapshot, analysis);
    if (
      run.controller.signal.aborted ||
      currentAnalysisGeneration !== analysisGeneration
    )
      return;
    if (resolveDocumentCompany(pageDocument) === "hplace") {
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
      hasGreetingFieldCandidates(
        snapshot.request.sections.flatMap((section) => [
          ...section.fields,
          ...(section.items ?? []).flatMap((item) => item.fields),
        ]),
      )
    ) {
      setExceptionTitle("페이지 구조를 확인할 수 없습니다. 다시 시작해 주세요");
      setStage("exception");
      return;
    }
    if (
      companyId === "greeting" &&
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

    const addressAnalysis = await runAddressAnalysis({
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

    const ignoreCurrentValueCandidateIds = new Set(
      ignoreFreshRowDefaults
        ? analysis.fields.flatMap((field) => {
            const lookup = snapshot.registry.lookupField(field.candidateId);
            return (lookup.status === "ready" || lookup.status === "blocked") &&
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
    const plan = buildReviewPlan({
      analysis,
      profile: loadedProfile,
      registry: snapshot.registry,
      ignoreCurrentValueCandidateIds,
      freshDefaultCandidateIds,
      normalizeDirectValue: (key, value) =>
        adapterProfileValue(adapter, key, value),
    });
    debugReviewPlan(plan);
    if (plan.status === "blocked") {
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
    const adapterDate = (item: ReviewPlanItem) =>
      companyId === "greeting" &&
      analysis.mode === "ADAPTER" &&
      item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
      item.analysis.writePlan?.command === "SELECT_DATE";
    const automaticItems = plan.items.map((item) => {
      if (options.reviewOnly) {
        return completedSearchCandidateIds.has(item.candidateId)
          ? {
              ...item,
              selected: false,
              disabled: true,
              reason: "검색 결과가 같은 행에 유지되어 다시 검색하지 않습니다.",
            }
          : { ...item, selected: false };
      }
      if (
        item.analysis?.writePlan?.command === "SELECT_DATE" &&
        !adapterDate(item)
      )
        return { ...item, selected: false };
      if (adapterDate(item) && item.status === "available" && !item.disabled)
        return { ...item, selected: true };
      const key = reviewProfileFieldKey(item);
      const automatic =
        item.status === "sensitive" &&
        key &&
        sensitiveValueApproved(
          approvedSensitiveValues.current,
          loadedProfile,
          key,
        )
          ? {
              ...item,
              selected: true,
              disabled: false,
              revealed: true,
              previewValue: item.profileValue ?? item.previewValue,
            }
          : item.status === "needs-review" && !item.disabled
            ? { ...item, selected: true }
            : item;
      const lookup = snapshot.registry.lookupField(item.candidateId);
      return lookup.status === "ready" &&
        adapter.canWriteProfileOption?.(lookup.handle, automatic) === false
        ? { ...automatic, selected: false }
        : automatic;
    });
    setReviewItems(automaticItems);
    if (options.reviewOnly) {
      setStage("review");
      return;
    }
    if (
      automaticItems.some(
        (item) =>
          item.analysis?.writePlan?.command === "SELECT_DATE" &&
          !adapterDate(item),
      )
    ) {
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
      companyId === "greeting" &&
      automaticItems.filter(
        (item) =>
          item.analysis?.valueBinding?.type === "DIRECT" &&
          item.analysis.valueBinding.profileFieldKey ===
            "contact.contact.email",
      ).length > 1
    ) {
      setExceptionTitle("이메일 입력 대상을 하나로 확인하지 못했습니다");
      setStage("exception");
      return;
    }
    const stateDriverItems = automaticItems.flatMap((item) => {
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
              captured:
                companyId === "greeting"
                  ? captureGreetingResultTargets(snapshot.registry, [item])
                  : undefined,
              genericTargets:
                analysis.mode === "GENERIC"
                  ? genericControlledRegions(lookup.handle)
                  : [],
            },
          ];
    });
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
      // Greeting replaces controls during React updates. Recollect after each
      // confirmed selection so a later driver never uses an earlier DOM handle.
      const currentStateDriverItems =
        companyId === "greeting"
          ? sameStageDrivers.slice(0, 1)
          : sameStageDrivers;
      const rememberGreetingWrite = (
        driver: (typeof currentStateDriverItems)[number],
      ) => {
        if (!driver.captured) return;
        completedGreetingStateDrivers.current.set(driver.key, {
          originalItem: driver.item,
          sourceRegistry: snapshot.registry,
          captured: driver.captured,
          identity: greetingReceiptIdentity(driver.item),
        });
      };
      const failureCodes = new Map<string, WriteFailureCode>();
      const reportFor = (item: ReviewPlanItem) => (code: WriteFailureCode) => {
        if (!run.controller.signal.aborted)
          failureCodes.set(item.candidateId, code);
      };
      const deferFailedGroups = async (
        successful: readonly boolean[],
        writesVerified = false,
        genericFailures = false,
      ) => {
        const nextGroups = new Set(failedGroups);
        const nextCompleted = new Set(completedStateDriverKeys);
        for (const [index, driver] of currentStateDriverItems.entries()) {
          if (successful[index]) {
            nextCompleted.add(driver.key);
            continue;
          }
          if (genericFailures) {
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
          const group = adapter.stateDriverFailureGroup?.(
            driver.item,
            driver.handle,
          );
          if (
            !group?.isConnected ||
            group.ownerDocument !== pageDocument ||
            ![
              ...driver.handle.elements,
              ...(driver.handle.customElements ?? []),
            ].every((element) => group.contains(element))
          )
            return false;
          nextGroups.add(group);
        }
        if (run.controller.signal.aborted) return true;
        currentStateDriverItems.forEach((driver, index) => {
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
              rememberGreetingWrite(driver);
              onWriteResult?.(
                item,
                { candidateId: item.candidateId, status: "written" },
                snapshot.registry,
              );
            }
          });
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
      if (!driversReady.every(Boolean)) {
        if (await deferFailedGroups(driversReady)) return;
        setExceptionTitle("조건부 선택 메뉴를 안전하게 준비하지 못했습니다");
        setStage("exception");
        return;
      }
      const stateSelectionResults: ApprovedWriteResult[] = [];
      for (const { item, captured, stage } of currentStateDriverItems) {
        const lookup = snapshot.registry.lookupField(item.candidateId);
        const eligible =
          lookup.status === "ready" &&
          item.selected &&
          !item.disabled &&
          item.status !== "unavailable" &&
          (item.status !== "sensitive" || item.revealed) &&
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
        if (companyId === "greeting" && stage === 0) {
          if (!captured || !isGreetingEmailStateDriver(item, lookup.handle)) {
            setExceptionTitle(
              "이메일 입력 대상이 변경되었습니다. 다시 시작해 주세요",
            );
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
                recollectGreetingResultRegistry(pageDocument, captured, [item]),
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
        if (result?.status === "skipped" && result.failureCode)
          reportFor(item)(result.failureCode);
      }
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
          rememberGreetingWrite(driver);
          onWriteResult?.(
            item,
            {
              candidateId: item.candidateId,
              status: "written",
            },
            snapshot.registry,
          );
        });
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
        if (await deferFailedGroups(successful, true)) return;
        const failedLabel =
          companyId === "greeting"
            ? currentStateDriverItems.find((_, index) => !successful[index])
                ?.item.fieldLabel
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
        // Only failures that provably left the page untouched may be deferred.
        if (
          stateSelectionResults.length === currentStateDriverItems.length &&
          stateSelectionResults.every(
            (result) =>
              result.status === "written" || isPreMutationFailure(result),
          )
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
    const needsSensitiveReview = automaticItems.some((item) => {
      const key = reviewProfileFieldKey(item);
      return (
        item.status === "sensitive" &&
        key &&
        consideredSensitiveValues.current.get(key) !==
          localProfileValue(loadedProfile, key)
      );
    });
    if (needsSensitiveReview) {
      setStage("review");
      return;
    }
    const approvedCandidateIds = new Set(
      automaticItems
        .filter((item) => {
          const lookup = snapshot.registry.lookupField(item.candidateId);
          if (lookup.status !== "ready" && lookup.status !== "blocked") {
            return false;
          }
          const key = stateDriverKey(
            item,
            lookup.handle.candidate.domName ?? lookup.handle.candidate.domId,
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
            lookup.handle.candidate.domName ?? lookup.handle.candidate.domId,
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
    if (
      JSON.stringify(await repository.load()) !== JSON.stringify(loadedProfile)
    ) {
      setExceptionTitle("분석 후 프로필이 변경되었습니다. 다시 시작해 주세요");
      setStage("exception");
      return;
    }
    if (run.controller.signal.aborted) return;
    setStage("writing");
    const greetingTargets =
      companyId === "greeting"
        ? captureGreetingResultTargets(snapshot.registry, automaticItems)
        : undefined;
    const greetingDriverKeys = new Map<string, string>();
    const greetingKeyCounts = new Map<string, number>();
    if (greetingTargets) {
      for (const item of automaticItems) {
        const lookup = snapshot.registry.lookupField(item.candidateId);
        if (lookup.status !== "ready" && lookup.status !== "blocked") continue;
        const key = stateDriverKey(
          item,
          lookup.handle.candidate.domName ?? lookup.handle.candidate.domId,
          lookup.handle.itemIndex,
        );
        greetingDriverKeys.set(item.candidateId, key);
        greetingKeyCounts.set(key, (greetingKeyCounts.get(key) ?? 0) + 1);
      }
    }
    let greetingResultRegistry: CandidateRegistry | undefined;
    const writeResults = await executeApprovedWritesAfterPageSettles({
      document: pageDocument,
      onResult: onWriteResult,
      items: finalWriteItems,
      approvedCandidateIds,
      registry: snapshot.registry,
      beforeWrite: presentField
        ? (item) => presentField(snapshot.registry, item)
        : undefined,
      signal: run.controller.signal,
      ...(greetingTargets
        ? {
            settledRegistry: () => {
              greetingResultRegistry = recollectGreetingResultRegistry(
                pageDocument,
                greetingTargets,
                automaticItems,
              );
              return greetingResultRegistry;
            },
          }
        : {}),
      onSearchFollowUp: (item, controls) =>
        onSearchFollowUp?.(item, controls, snapshot.registry),
    });
    if (run.controller.signal.aborted) return;
    const greetingDriverResults: ApprovedWriteResult[] = [];
    if (greetingResultRegistry) {
      setResultRegistry?.(greetingResultRegistry);
      const writtenIds = new Set(
        writeResults
          .filter((result) => result.status === "written")
          .map((result) => result.candidateId),
      );
      rebindResultProgress?.(
        automaticItems.filter((item) => writtenIds.has(item.candidateId)),
        snapshot.registry,
        greetingResultRegistry,
      );
      for (const item of automaticItems) {
        const key = greetingDriverKeys.get(item.candidateId);
        if (!key || !completedStateDriverKeys.has(key)) continue;
        const receipt = completedGreetingStateDrivers.current.get(key);
        const alias =
          receipt &&
          greetingKeyCounts.get(key) === 1 &&
          receipt.identity === greetingReceiptIdentity(item)
            ? recollectGreetingResultRegistry(pageDocument, receipt.captured, [
                receipt.originalItem,
              ])
            : undefined;
        const prior =
          receipt && alias?.lookupField(receipt.originalItem.candidateId);
        let searchUnverified = false;
        const current = greetingResultRegistry.lookupField(item.candidateId);
        const live = resultFieldState(
          greetingResultRegistry,
          pageDocument,
          item.candidateId,
        );
        const sameElement =
          prior &&
          (prior.status === "ready" || prior.status === "blocked") &&
          (current.status === "ready" || current.status === "blocked") &&
          (prior.handle.elements[0] ?? prior.handle.customElements?.[0]) ===
            (current.handle.elements[0] ?? current.handle.customElements?.[0]);
        if (receipt && sameElement && live?.handle) {
          const element =
            live.handle.elements[0] ?? live.handle.customElements?.[0];
          if (element)
            rebindCatalogSelection(receipt.originalItem, item, element);
        }
        if (
          receipt &&
          alias &&
          sameElement &&
          live?.visible &&
          (current.status === "ready" || current.status === "blocked") &&
          greetingGpaSafe(current.handle, item) &&
          matchesResultValue(
            item,
            live.value,
            item.profileValue ?? "",
            live.handle,
          ) &&
          (item.analysis?.writePlan?.command !== "SEARCH_SELECTION" ||
            (companyId === "greeting" &&
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
              )) === true))
        ) {
          if (run.controller.signal.aborted) return;
          rebindResultProgress?.(
            [receipt.originalItem],
            receipt.sourceRegistry,
            alias,
          );
          greetingDriverResults.push({
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
          greetingDriverResults.push({
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
    const deferredResults = deferredItems.map((item): ApprovedWriteResult => {
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
      const result: ApprovedWriteResult = {
        candidateId: item.candidateId,
        status: "skipped",
        reason: deferredDriverReason(
          ownFailure?.code,
          analysis.mode === "GENERIC",
          "검색 결과를 확정하지 못해 이 행의 입력을 보류했습니다. 검색 항목과 같은 행의 정보를 직접 확인해 주세요.",
        ),
        failureCode: ownFailure?.code ?? "ROW_SEARCH_UNCONFIRMED",
      };
      return result;
    });
    setResults([
      ...writeResults,
      ...retainedDriverResults,
      ...greetingDriverResults,
      ...automaticItems
        .filter((item) => {
          const lookup = snapshot.registry.lookupField(item.candidateId);
          return (
            (lookup.status === "ready" || lookup.status === "blocked") &&
            analysis.mode !== "GENERIC" &&
            companyId !== "greeting" &&
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
    ]);
    setStage("result");
  };
  return analyzeFields;
}
