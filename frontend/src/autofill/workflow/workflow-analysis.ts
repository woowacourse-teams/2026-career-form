import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AddressResult, AddressSearch } from "../address/types";
import type { WorkflowAdapter } from "../adapters/workflow";
import type { AnalysisApiClient } from "../api/types";
import { collectFieldsSnapshot, type CollectedSnapshot } from "../dom/collect";
import {
  buildReviewPlan,
  resolveProfileFieldValue,
  type ReviewPlanItem,
} from "../review/review-plan";
import {
  executeApprovedWrites,
  executeApprovedWritesAfterPageSettles,
  type ApprovedWriteResult,
  type WriteResultListener,
} from "../write/executor";
import type { Profile, RepeatedProfileCategoryId } from "../../profile/model";
import type { ProfileRepository } from "../../profile/profile-repository";
import type { CandidateRegistry } from "../dom/candidate-registry";
import type { WorkflowActivity } from "./progress-model";
import type { WriteFailureCode } from "../write/failure";
import {
  adapterProfileValue,
  addressValue,
  localProfileValue,
  reviewProfileFieldKey,
  stateDriverKey,
  type Stage,
} from "./workflow-model";

type FieldsSnapshot = CollectedSnapshot<
  ReturnType<typeof collectFieldsSnapshot>["request"]
>;
type AddressRun = {
  controller: AbortController;
  button?: Element;
  task?: Promise<AddressResult>;
};
export type DeferredDriverFailures = WeakMap<
  Element,
  { key: string; code: WriteFailureCode }
>;

interface WorkflowAnalysisContext {
  onActivity?: (activity: WorkflowActivity) => void;
  onWriteResult?: WriteResultListener;
  presentField?: (
    registry: CandidateRegistry,
    item: ReviewPlanItem,
  ) => Promise<void>;
  adapter: WorkflowAdapter;
  addressRun: MutableRefObject<AddressRun>;
  addressSearch: AddressSearch;
  apiClient: AnalysisApiClient;
  pageDocument: Document;
  repository: Pick<ProfileRepository, "load">;
  approvedSensitiveValues: MutableRefObject<Map<string, string>>;
  consideredSensitiveValues: MutableRefObject<Map<string, string>>;
  completedDriverKeys: MutableRefObject<ReadonlySet<string>>;
  deferredDriverGroups: MutableRefObject<ReadonlySet<Element>>;
  deferredDriverFailures?: MutableRefObject<DeferredDriverFailures>;
  setAddressResult: Dispatch<SetStateAction<AddressResult | undefined>>;
  setExceptionTitle: Dispatch<SetStateAction<string>>;
  setStage: Dispatch<SetStateAction<Stage>>;
  setFieldsSnapshot: Dispatch<SetStateAction<FieldsSnapshot | undefined>>;
  setReviewItems: Dispatch<SetStateAction<ReviewPlanItem[]>>;
  setPartial: Dispatch<SetStateAction<boolean>>;
  setWarnings: Dispatch<SetStateAction<string[]>>;
  setResults: Dispatch<SetStateAction<ApprovedWriteResult[]>>;
}

export function createAnalyzeFields({
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
}: WorkflowAnalysisContext) {
  const sensitiveValueApproved = (loaded: Profile, key: string): boolean => {
    const value = localProfileValue(loaded, key);
    return (
      value !== undefined && approvedSensitiveValues.current.get(key) === value
    );
  };
  const analyzeFields = async (
    loadedProfile: Profile,
    ignoreFreshRowDefaults = false,
    completedStateDriverKeys: ReadonlySet<string> = completedDriverKeys.current,
    failedGroups: ReadonlySet<Element> = deferredDriverGroups.current,
  ) => {
    completedDriverKeys.current = completedStateDriverKeys;
    deferredDriverGroups.current = failedGroups;
    const run = addressRun.current;
    if (run.controller.signal.aborted) return;
    setStage("analyzing");
    onActivity?.("matching");
    const snapshot = collectFieldsSnapshot(pageDocument);

    let analysis = await apiClient.analyzeFields(snapshot.request);
    if (run.controller.signal.aborted) return;
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
      run.task ??= permitted
        ? adapter.runAddress({
            document: pageDocument,
            button: run.button,
            expected: addressValue(loadedProfile),
            loadCurrent: async () => addressValue(await repository.load()),
            signal: run.controller.signal,
            search: addressSearch,
          })
        : Promise.resolve({
            status: "manual",
            reason:
              "주소 입력란의 연결을 확인하지 못했습니다. 직접 확인해 주세요.",
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
    if (plan.items.length === 0) {
      setResults([]);
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
      const key = reviewProfileFieldKey(item);
      const automatic =
        item.status === "sensitive" &&
        key &&
        sensitiveValueApproved(loadedProfile, key)
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
    setFieldsSnapshot(snapshot);
    setReviewItems(automaticItems);
    setPartial(plan.status === "partial");
    setWarnings(analysis.warningCodes ?? []);
    const stateDriverItems = automaticItems.flatMap((item) => {
      const lookup = snapshot.registry.lookupField(item.candidateId);
      if (lookup.status !== "ready" && lookup.status !== "blocked") return [];
      const domName =
        lookup.handle.candidate.domName ?? lookup.handle.candidate.domId;
      const stage =
        adapter.stateDriverStage?.(item, lookup.handle) ??
        (adapter.isStateDriver(item, domName) ? 1 : undefined);
      const key = stateDriverKey(item, domName, lookup.handle.itemIndex);
      return belongsToFailedGroup(item) ||
        !item.selected ||
        item.disabled ||
        stage === undefined ||
        completedStateDriverKeys.has(key)
        ? []
        : [{ item, handle: lookup.handle, domName, stage, key }];
    });
    if (stateDriverItems.length > 0) {
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
          item.analysis?.mappingStatus === "ADAPTER_VERIFIED" &&
          item.analysis.interactionStatus === "READY";
        if (run.controller.signal.aborted) return;
        if (eligible && presentField) {
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
            ? executeApprovedWrites({
                items: [item],
                approvedCandidateIds: new Set([item.candidateId]),
                registry: snapshot.registry,
              })
            : [
                special
                  ? {
                      candidateId: item.candidateId,
                      status: "written" as const,
                    }
                  : {
                      candidateId: item.candidateId,
                      status: "skipped" as const,
                      reason: "조건부 선택을 확인하지 못했습니다.",
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
          currentStateDriverItems.map(
            ({ handle, item }) =>
              adapter.settleStateDriver?.(
                pageDocument,
                handle,
                reportFor(item),
              ) ?? true,
          ),
        );
        if (!settled.every(Boolean)) {
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
        await analyzeFields(
          loadedProfile,
          ignoreFreshRowDefaults,
          nextCompletedStateDriverKeys,
          failedGroups,
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
    const deferredItems = automaticItems.filter(belongsToFailedGroup);
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
      ...automaticItems
        .filter((item) => {
          const lookup = snapshot.registry.lookupField(item.candidateId);
          return (
            (lookup.status === "ready" || lookup.status === "blocked") &&
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
