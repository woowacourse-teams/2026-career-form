import { sensitiveValueApproved } from "./review-actions";
import type { WorkflowAnalysisContext } from "./workflow-analysis-types";
export type {
  CompletedGenericStateDriver,
  DeferredDriverFailures,
  GenericSearchFollowUp,
} from "./workflow-analysis-types";
import {
  retainedDriverCandidates,
  retainedDriverReviewResults,
} from "./retained-drivers";
import { collectFieldsSnapshot } from "../dom/collect";
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
  localProfileValue,
  reviewProfileFieldKey,
  stateDriverKey,
} from "./workflow-model";

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
  completedDriverKeys,
  completedGenericStateDrivers,
  deferredDriverGroups,
  deferredDriverFailures = { current: new WeakMap() },
  setAddressResult,
  setExceptionTitle,
  setStage,
  setFieldsSnapshot,
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
  const analyzeFields = async (
    loadedProfile: Profile,
    ignoreFreshRowDefaults = false,
    completedStateDriverKeys: ReadonlySet<string> = completedDriverKeys.current,
    failedGroups: ReadonlySet<Element> = deferredDriverGroups.current,
    genericPass = 0,
    options: SearchFollowUpAnalysisOptions = {},
  ) => {
    const currentAnalysisGeneration = ++analysisGeneration;
    completedDriverKeys.current = completedStateDriverKeys;
    deferredDriverGroups.current = failedGroups;
    const run = addressRun.current;
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
    onActivity?.("matching");
    const snapshot = collectFieldsSnapshot(pageDocument);

    const analysisStarted = performance.now();
    let analysis = await apiClient.analyzeFields(snapshot.request);
    if (
      run.controller.signal.aborted ||
      currentAnalysisGeneration !== analysisGeneration
    )
      return;
    if (
      options.reviewOnly &&
      JSON.stringify(await repository.load()) !== JSON.stringify(loadedProfile)
    ) {
      setExceptionTitle("확인 중 프로필이 변경되었습니다. 다시 시작해 주세요");
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
    const plan = buildReviewPlan({
      analysis,
      profile: loadedProfile,
      registry: snapshot.registry,
      ignoreCurrentValueCandidateIds,
      normalizeDirectValue: (key, value) =>
        adapterProfileValue(adapter, key, value),
    });
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
      if (item.analysis?.writePlan?.command === "SELECT_DATE")
        return { ...item, selected: false };
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
        (item) => item.analysis?.writePlan?.command === "SELECT_DATE",
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
      const currentStateDriverItems = stateDriverItems.filter(
        (driver) => driver.stage === nextStage,
      );
      const failureCodes = new Map<string, WriteFailureCode>();
      const reportFor = (item: ReviewPlanItem) => (code: WriteFailureCode) => {
        if (!run.controller.signal.aborted)
          failureCodes.set(item.candidateId, code);
      };
      const deferFailedGroups = async (
        successful: readonly boolean[],
        writesVerified = false,
      ) => {
        const nextGroups = new Set(failedGroups);
        const nextCompleted = new Set(completedStateDriverKeys);
        for (const [index, driver] of currentStateDriverItems.entries()) {
          if (successful[index]) {
            nextCompleted.add(driver.key);
            continue;
          }
          const group = adapter.stateDriverFailureGroup?.(
            driver.item,
            driver.handle,
          );
          if (
            !group?.isConnected ||
            group.ownerDocument !== pageDocument ||
            !driver.handle.elements.every((element) => group.contains(element))
          )
            return false;
          nextGroups.add(group);
        }
        if (run.controller.signal.aborted) return true;
        currentStateDriverItems.forEach((driver, index) => {
          const element = driver.handle.elements[0];
          if (!successful[index] && element)
            deferredDriverFailures.current.set(element, {
              key: driver.key,
              code:
                failureCodes.get(driver.item.candidateId) ??
                "SEARCH_UNCONFIRMED",
            });
          if (!successful[index])
            onWriteResult?.(
              driver.item,
              {
                candidateId: driver.item.candidateId,
                status: "skipped",
                reason: "조건부 선택을 확인하지 못했습니다.",
                failureCode:
                  failureCodes.get(driver.item.candidateId) ??
                  "SEARCH_UNCONFIRMED",
              },
              snapshot.registry,
            );
        });
        if (writesVerified) {
          currentStateDriverItems.forEach(({ item }, index) => {
            if (successful[index])
              onWriteResult?.(
                item,
                { candidateId: item.candidateId, status: "written" },
                snapshot.registry,
              );
          });
        }
        await analyzeFields(
          loadedProfile,
          ignoreFreshRowDefaults,
          nextCompleted,
          nextGroups,
        );
        return true;
      };
      const driversReady = await Promise.all(
        currentStateDriverItems.map(
          ({ handle, item }) =>
            adapter.waitForStateDriverReady?.(
              pageDocument,
              handle,
              reportFor(item),
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
      for (const { item } of currentStateDriverItems) {
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
        }
        const special = eligible
          ? await adapter.executeStateDriver?.(
              pageDocument,
              lookup.handle,
              item,
              run.controller.signal,
              reportFor(item),
            )
          : undefined;
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
        currentStateDriverItems.forEach(({ item }) =>
          onWriteResult?.(
            item,
            {
              candidateId: item.candidateId,
              status: "written",
            },
            snapshot.registry,
          ),
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
              )) ??
                true),
          ),
        );
        if (await deferFailedGroups(successful, true)) return;
        setExceptionTitle("조건부 선택을 안전하게 적용하지 못했습니다");
        setStage("exception");
        return;
      }
      if (analysis.mode === "GENERIC") {
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
    const writeResults = await executeApprovedWritesAfterPageSettles({
      onResult: onWriteResult,
      items: finalWriteItems,
      approvedCandidateIds,
      registry: snapshot.registry,
      beforeWrite: presentField
        ? (item) => presentField(snapshot.registry, item)
        : undefined,
      signal: run.controller.signal,
      onSearchFollowUp: (item, controls) =>
        onSearchFollowUp?.(item, controls, snapshot.registry),
    });
    if (run.controller.signal.aborted) return;
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
      const source = handle?.elements[0];
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
      const result: ApprovedWriteResult = {
        candidateId: item.candidateId,
        status: "skipped",
        reason:
          "검색 결과를 확정하지 못해 이 행의 입력을 보류했습니다. 검색 항목과 같은 행의 정보를 직접 확인해 주세요.",
        failureCode:
          failure && failure.key === key
            ? failure.code
            : "ROW_SEARCH_UNCONFIRMED",
      };
      return result;
    });
    setResults([
      ...writeResults,
      ...retainedDriverResults,
      ...automaticItems
        .filter((item) => {
          const lookup = snapshot.registry.lookupField(item.candidateId);
          return (
            (lookup.status === "ready" || lookup.status === "blocked") &&
            analysis.mode !== "GENERIC" &&
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
