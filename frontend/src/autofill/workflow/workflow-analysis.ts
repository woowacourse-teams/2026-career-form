import { sensitiveValueApproved } from "./review-actions";
import type { WorkflowAnalysisContext } from "./workflow-analysis-types";
export type {
  CompletedGenericStateDriver,
  DeferredDriverFailures,
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
  onActivity,
  onAddressOperation,
}: WorkflowAnalysisContext) {
  const analyzeFields = async (
    loadedProfile: Profile,
    ignoreFreshRowDefaults = false,
    completedStateDriverKeys: ReadonlySet<string> = completedDriverKeys.current,
    failedGroups: ReadonlySet<Element> = deferredDriverGroups.current,
    genericPass = 0,
  ) => {
    completedDriverKeys.current = completedStateDriverKeys;
    deferredDriverGroups.current = failedGroups;
    const run = addressRun.current;
    if (run.controller.signal.aborted) return;
    setStage("analyzing");
    onActivity?.("matching");
    const snapshot = collectFieldsSnapshot(pageDocument);

    const analysisStarted = performance.now();
    let analysis = await apiClient.analyzeFields(snapshot.request);
    if (run.controller.signal.aborted) return;
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

    if (run.button && adapter.runAddress) {
      const addressNames = adapter.addressFieldNames ?? [];
      const keys = [
        "contact.contact.postalCode",
        "contact.contact.addressLine1",
        "contact.contact.addressLine2",
      ];
      const fields = snapshot.request.sections.flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ]);
      const permitted =
        analysis.mode === "ADAPTER" &&
        addressNames.length === 3 &&
        addressNames.every((name, index) => {
          const candidates = fields.filter(
            (field) => field.domId === name || field.domName === name,
          );
          if (candidates.length !== 1) return false;
          const candidate = candidates[0];
          const mapping = analysis.fields.find(
            (field) => field.candidateId === candidate.candidateId,
          );
          return (
            candidate.domId === name &&
            candidate.domName === name &&
            candidate.element === "input" &&
            candidate.control === "text" &&
            candidate.visibility === "visible" &&
            !candidate.disabled &&
            !candidate.inert &&
            !!candidate.readonly === index < 2 &&
            mapping?.matchType === "MATCH" &&
            mapping.mappingStatus === "ADAPTER_VERIFIED" &&
            mapping.valueBinding?.type === "DIRECT" &&
            mapping.valueBinding.profileFieldKey === keys[index]
          );
        });
      const addressTargets = permitted
        ? addressNames.flatMap((name, index) => {
            const candidate = fields.find((field) => field.domId === name)!;
            const lookup = snapshot.registry.lookupField(candidate.candidateId);
            if (lookup.status !== "ready" && lookup.status !== "blocked")
              return [];
            const element = lookup.handle.elements[0];
            return element instanceof HTMLInputElement
              ? [
                  {
                    candidateId: candidate.candidateId,
                    fieldLabel: ["우편번호", "기본주소", "상세주소"][index],
                    profileFieldKey: keys[index],
                    element,
                    originalValue: element.value,
                  },
                ]
              : [];
          })
        : [];
      if (permitted) onActivity?.("address");
      if (!run.task && permitted) {
        const button = run.button;
        const onClick = () => {
          if (button) onAddressOperation?.(button);
        };
        button?.addEventListener("click", onClick, { once: true });
        run.task = adapter
          .runAddress({
            document: pageDocument,
            button,
            expected: addressValue(loadedProfile),
            loadCurrent: async () => addressValue(await repository.load()),
            signal: run.controller.signal,
            search: addressSearch,
          })
          .finally(() => button?.removeEventListener("click", onClick));
      }
      run.task ??= Promise.resolve({
        status: "manual",
        reason: "주소 입력란의 연결을 확인하지 못했습니다. 직접 확인해 주세요.",
      });
      const result = await run.task;
      if (run.controller.signal.aborted) return;
      setAddressResult(result);
      if (result.status === "written") {
        for (const target of addressTargets) {
          const lookup = snapshot.registry.lookupField(target.candidateId);
          if (
            (lookup.status !== "ready" &&
              !(lookup.status === "blocked" && lookup.reason === "readonly")) ||
            lookup.handle.elements[0] !== target.element ||
            !target.element.value.trim() ||
            target.element.value === target.originalValue
          )
            continue;
          onWriteResult?.(
            {
              candidateId: target.candidateId,
              fieldLabel: target.fieldLabel,
              profileFieldKey: target.profileFieldKey,
              currentValue: target.originalValue,
              profileValue: target.element.value,
              previewValue: target.element.value,
              status: "available",
              selected: true,
              disabled: false,
              revealed: true,
              reason: result.reason,
            },
            { candidateId: target.candidateId, status: "written" },
            snapshot.registry,
          );
        }
      }
      onActivity?.("matching");
      const ids = new Set(
        fields
          .filter(
            (field) =>
              addressNames.includes(field.domId ?? "") ||
              addressNames.includes(field.domName ?? ""),
          )
          .map((field) => field.candidateId),
      );
      analysis = {
        ...analysis,
        fields: analysis.fields.filter((field) => !ids.has(field.candidateId)),
      };
    }

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
    setFieldsSnapshot(snapshot);
    setPartial(plan.status === "partial");
    setWarnings(analysis.warningCodes ?? []);
    if (plan.items.length === 0) {
      setReviewItems([]);
      setResults([]);
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
    const belongsToFailedGroup = (item: ReviewPlanItem) => {
      const lookup = snapshot.registry.lookupField(item.candidateId);
      return (
        (lookup.status === "ready" || lookup.status === "blocked") &&
        [...failedGroups].some((group) =>
          lookup.handle.elements.some((element) => group.contains(element)),
        )
      );
    };
    const automaticItems = plan.items.map((item) => {
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
      return belongsToFailedGroup(item) ||
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
      if (!belongsToFailedGroup(item)) return false;
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
      if (belongsToFailedGroup(item)) return false;
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
    });
    if (run.controller.signal.aborted) return;
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
