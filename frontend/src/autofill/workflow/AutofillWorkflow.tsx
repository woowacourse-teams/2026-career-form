import { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { createAddressSearch } from "../address/runtime";
import type {
  AddressSearch,
  AddressResult,
  AddressValue,
} from "../address/types";

import {
  getWorkflowAdapter,
  type WorkflowDiagnostic,
} from "../adapters/workflow";
import { AnalysisServiceError } from "../api/runtime-client";
import { AnalysisContractError } from "../api/validate-response";
import type { AnalysisApiClient, PreparationPlan } from "../api/types";
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
import { waitForExpectedFields } from "../preparation/wait-for-fields";
import {
  buildReviewPlan,
  revealSensitiveReviewItem,
  resolveProfileFieldValue,
  reviewItemsForDisplay,
  type ReviewPlanItem,
} from "../review/review-plan";
import {
  executeApprovedWrites,
  executeApprovedWritesAfterPageSettles,
  type ApprovedWriteResult,
} from "../write/executor";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type { Profile, RepeatedProfileCategoryId } from "../../profile/model";
import type { ProfileRepository } from "../../profile/profile-repository";
import styles from "../../autofill-demo/AutofillDemo.module.css";

type Stage =
  "analyzing" | "preparation-review" | "review" | "result" | "exception";

interface PreparationItem {
  plan: PreparationPlan;
  actionLabel: string;
  runnable: boolean;
  unavailableReason?: string;
  localItemCount?: number;
  currentGroupCount?: number;
  requiredAdditions?: number;
}

export function shouldRunRevealPlan(
  profileValue: string,
  optionDisplayName?: string,
  selectableProfileValues?: readonly string[],
): boolean {
  return selectableProfileValues
    ? selectableProfileValues.includes(profileValue)
    : optionDisplayName === undefined || profileValue === optionDisplayName;
}

type ReviewItemGroupId = "available" | "needs-review";

interface ReviewItemGroup {
  id: ReviewItemGroupId;
  label: string;
  description: string;
  items: ReviewPlanItem[];
}

const REVIEW_ITEM_GROUPS: readonly Omit<ReviewItemGroup, "items">[] = [
  {
    id: "available",
    label: "입력 가능",
    description: "연결이 명확해 바로 선택할 수 있습니다.",
  },
  {
    id: "needs-review",
    label: "확인 필요",
    description: "조건부 입력, 기존 값과 민감정보를 직접 확인해 주세요.",
  },
];

const SKIPPED_BY_APPROVAL_REASON = "사용자가 승인한 입력 항목이 아닙니다.";

const runtimeAddressSearch = createAddressSearch(() =>
  browser.runtime.connect({ name: "cf-address-top" }),
);
const addressValue = (profile: Profile): AddressValue => ({
  address: profile.contact.addressLine1 ?? "",
  postalCode: profile.contact.postalCode ?? "",
  detail: profile.contact.addressLine2 ?? "",
});

interface WorkflowProps {
  addressSearch?: AddressSearch;
  apiClient: AnalysisApiClient;
  repository: Pick<ProfileRepository, "load">;
  pageDocument: Document;
  onExit(): void;
}

function pageHost(pageDocument: Document): string {
  return pageDocument.location?.host ?? "";
}

function Header({ step, title }: { step: string; title: string }) {
  return (
    <header className={styles.header}>
      <span>{step}</span>
      <h2>{title}</h2>
    </header>
  );
}

function normalized(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

const PROFILE_CATEGORY_KEYWORDS: Record<
  RepeatedProfileCategoryId,
  readonly string[]
> = {
  education: ["학력", "academic"],
  languages: ["어학", "외국어", "foreign"],
  certifications: ["자격", "면허", "licence"],
  careers: ["경력", "직장", "career"],
  projects: ["프로젝트", "project"],
  publications: ["논문", "특허", "publication"],
  health: ["건강"],
};

function matchesProfileCategory(
  category: (typeof PROFILE_CATEGORIES)[number],
  sectionDisplayName: string | undefined,
): boolean {
  if (!category.repeatable) return false;
  const sectionLabel = normalized(sectionDisplayName);
  const keywords = PROFILE_CATEGORY_KEYWORDS[
    category.id as RepeatedProfileCategoryId
  ] ?? [normalized(category.label)];
  return keywords.some((keyword) => sectionLabel.includes(keyword));
}

function educationProfileSectionId(
  matchLabel: string,
  sectionHint?: "highSchool" | "university" | "graduateSchool",
): "highSchool" | "university" | "graduateSchool" | undefined {
  const normalizedLabel = matchLabel.toLowerCase();
  if (
    matchLabel.includes("대학원") ||
    normalizedLabel.includes("graduateschool") ||
    sectionHint === "graduateSchool"
  ) {
    return "graduateSchool";
  }
  if (
    matchLabel.includes("고등학교") ||
    normalizedLabel.includes("highschool") ||
    sectionHint === "highSchool"
  ) {
    return "highSchool";
  }
  if (
    matchLabel.includes("대학") ||
    normalizedLabel.includes("university") ||
    sectionHint === "university"
  ) {
    return "university";
  }
  return undefined;
}

function stateDriverKey(
  item: ReviewPlanItem,
  domName: string | undefined,
  itemIndex: number | undefined,
): string {
  const binding = item.analysis?.valueBinding;
  const profileFieldKey =
    binding?.type === "DIRECT" ||
    binding?.type === "LOOKUP" ||
    binding?.type === "BUTTON_OPTION"
      ? binding.profileFieldKey
      : item.profileFieldKey;
  return [
    item.profileEntryId ?? `item-${itemIndex ?? "single"}`,
    profileFieldKey ?? domName ?? item.candidateId,
  ].join("|");
}

export function localItemCount(
  plan: PreparationPlan,
  snapshot: CollectedSnapshot<
    ReturnType<typeof collectPreparationSnapshot>["request"]
  >,
  profile: Profile,
): number | undefined {
  if (plan.command !== "ADD_REPEATABLE_GROUP") return undefined;
  const section = snapshot.request.sections.find((candidate) =>
    candidate.actionCandidates.some(
      (action) => action.candidateId === plan.actionCandidateId,
    ),
  );
  const action = section?.actionCandidates.find(
    (candidate) => candidate.candidateId === plan.actionCandidateId,
  );
  const matchLabel = [
    section?.displayName,
    action?.displayName,
    action?.domName,
    action?.domId,
  ]
    .filter(Boolean)
    .join(" ");
  const profileSectionHint = getWorkflowAdapter(
    snapshot.request.site.host,
  ).repeatedProfileSectionHint?.(action?.domId);
  const category = profileSectionHint
    ? PROFILE_CATEGORIES.find(
        (candidate) => candidate.id === profileSectionHint.categoryId,
      )
    : PROFILE_CATEGORIES.find((candidate) =>
        matchesProfileCategory(candidate, matchLabel),
      );
  const profileItemCount = category
    ? category.id === "education"
      ? (() => {
          const sectionId = educationProfileSectionId(
            matchLabel,
            getWorkflowAdapter(
              snapshot.request.site.host,
            ).educationSectionHint?.(matchLabel),
          );
          return sectionId
            ? profile.education.filter((entry) => entry.sectionId === sectionId)
                .length
            : profile.education.length;
        })()
      : profileSectionHint
        ? profile[category.id as RepeatedProfileCategoryId].filter(
            (entry) => entry.sectionId === profileSectionHint.sectionId,
          ).length
        : profile[category.id as RepeatedProfileCategoryId].length
    : 0;

  return profileItemCount;
}

function actionLabel(
  plan: PreparationPlan,
  snapshot: ReturnType<typeof collectPreparationSnapshot>,
): string {
  const candidates = snapshot.request.sections.flatMap((section) => [
    ...section.actionCandidates,
    ...(section.items ?? []).flatMap((item) => item.actionCandidates),
  ]);
  const candidate = candidates.find(
    ({ candidateId }) => candidateId === plan.actionCandidateId,
  );
  return candidate?.displayName ?? candidate?.domName ?? plan.actionCandidateId;
}

function reviewGroupsForDisplay(
  items: readonly ReviewPlanItem[],
): ReviewItemGroup[] {
  const displayItems = reviewItemsForDisplay(items);
  return REVIEW_ITEM_GROUPS.map((group) => ({
    ...group,
    items: displayItems.filter((item) =>
      group.id === "available"
        ? item.status === "available"
        : item.status !== "available",
    ),
  })).filter((group) => group.items.length > 0);
}

function preparationItem(
  plan: PreparationPlan,
  snapshot: ReturnType<typeof collectPreparationSnapshot>,
  profile: Profile,
): PreparationItem {
  const localCount = localItemCount(plan, snapshot, profile);
  if (plan.command !== "ADD_REPEATABLE_GROUP") {
    const value =
      plan.command === "SELECT_OPTION_TO_REVEAL"
        ? resolveProfileFieldValue(profile, plan.profileFieldKey)
        : undefined;
    const runnable =
      plan.command !== "SELECT_OPTION_TO_REVEAL" ||
      (value?.status === "resolved" &&
        shouldRunRevealPlan(
          value.value,
          plan.optionDisplayName,
          plan.selectableProfileValues,
        ));
    return {
      plan,
      actionLabel: actionLabel(plan, snapshot),
      runnable,
      ...(runnable
        ? {}
        : {
            unavailableReason:
              "저장된 프로필 값이 없어 직접 선택이 필요합니다.",
          }),
      localItemCount: localCount,
    };
  }
  const currentGroupCount = snapshot.countRepeatableGroups(
    plan.actionCandidateId,
  );
  const requiredAdditions =
    localCount !== undefined && currentGroupCount !== undefined
      ? Math.max(0, localCount - currentGroupCount)
      : undefined;

  return {
    plan,
    actionLabel: actionLabel(plan, snapshot),
    runnable: true,
    localItemCount: localCount,
    currentGroupCount,
    ...(requiredAdditions !== undefined ? { requiredAdditions } : {}),
  };
}

function statusLabel(item: ReviewPlanItem): string {
  const labels = {
    available: "입력 가능",
    "needs-review": "확인 필요",
    conflict: "기존 값 충돌",
    sensitive: "민감정보",
    unavailable: "입력 불가",
  } as const;
  return labels[item.status];
}

function profileFieldLabel(profileFieldKey?: string): string {
  if (!profileFieldKey) return "프로필 정보";
  const [categoryId, sectionId, fieldId] = profileFieldKey.split(".");
  const category = PROFILE_CATEGORIES.find(
    (candidate) => candidate.id === categoryId,
  );
  const section = category?.sections.find(
    (candidate) => candidate.id === sectionId,
  );
  const field = section?.fields.find((candidate) => candidate.id === fieldId);
  return field && section ? `${section.label} · ${field.label}` : "프로필 정보";
}

function userFacingReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  if (reason.includes("네이티브") || reason.includes("안전하게 입력")) {
    return "이 입력란은 자동으로 입력할 수 없어 직접 확인이 필요합니다.";
  }
  if (reason.includes("지원서에 기존 값")) {
    return "지원서에 기존 값이 있어 자동으로 덮어쓰지 않았습니다.";
  }
  return reason;
}

function safeErrorTitle(error: unknown): string {
  return error instanceof AnalysisServiceError ||
    error instanceof AnalysisContractError
    ? error.message
    : "분석을 완료하지 못했습니다";
}

function mappingLabel(item: ReviewPlanItem): string | undefined {
  if (item.analysis?.mappingStatus === "ADAPTER_VERIFIED") {
    return "어댑터 검증";
  }
  return item.analysis?.mappingStatus === "LLM_SUGGESTED"
    ? "LLM 제안"
    : undefined;
}

function interactionLabel(item: ReviewPlanItem): string | undefined {
  const labels = {
    READY: "입력 준비됨",
    MANUAL_REVEAL_REQUIRED: "수동으로 펼쳐야 함",
    BLOCKED: "입력 차단됨",
    SYSTEM_CONTROL: "시스템 제어 항목",
    UNVERIFIED: "검증되지 않음",
  } as const;
  return item.analysis ? labels[item.analysis.interactionStatus] : undefined;
}

function currentPreview(item: ReviewPlanItem): string {
  return item.status === "sensitive" && !item.revealed
    ? "••••••••"
    : item.currentValue || "입력된 값 없음";
}

function diagnosticLabel(code: WorkflowDiagnostic["code"]): string {
  const labels = {
    PROFILE_UNAVAILABLE: "프로필 값 없음",
    PROFILE_NOT_SELECTED: "프로필 선택 조건 불충족",
    TARGET_MISSING: "선행 선택란 없음",
    SELECTED: "선행 선택 완료",
    SELECTION_FAILED: "선행 선택 실패",
    FOLLOW_UP_PLANS: "후속 조건부 선택 계획",
    FOLLOW_UP_BINDINGS: "정책 후속 바인딩",
    ANALYSIS_BLOCKED: "필드 재분석 차단",
    ELIGIBLE_FIELDS: "입력 후보",
    WRITTEN: "입력 성공",
    SKIPPED: "건너뜀",
  };
  return labels[code];
}

function resultStatusLabel(result: ApprovedWriteResult): string {
  if (result.status === "written") return "기입 성공";
  return result.reason === SKIPPED_BY_APPROVAL_REASON
    ? "승인하지 않아 건너뜀"
    : "직접 입력 필요";
}

function isSkippedByApproval(result: ApprovedWriteResult): boolean {
  return (
    result.status === "skipped" && result.reason === SKIPPED_BY_APPROVAL_REASON
  );
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

  const analyzeFields = async (
    loadedProfile: Profile,
    ignoreFreshRowDefaults = false,
    completedStateDriverKeys: ReadonlySet<string> = new Set(),
  ) => {
    const run = addressRun.current;
    if (run.controller.signal.aborted) return;
    const snapshot = collectFieldsSnapshot(pageDocument);

    let analysis = await apiClient.analyzeFields(snapshot.request);
    if (run.controller.signal.aborted) return;

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
    const plan = buildReviewPlan({
      analysis,
      profile: loadedProfile,
      registry: snapshot.registry,
      ignoreCurrentValueCandidateIds,
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
    const automaticItems = plan.items.map((item) =>
      item.status === "needs-review" && !item.disabled
        ? { ...item, selected: true }
        : item,
    );
    setFieldsSnapshot(snapshot);
    setReviewItems(automaticItems);
    setPartial(plan.status === "partial");
    setWarnings(analysis.warningCodes ?? []);
    const stateDriverItems = automaticItems.flatMap((item) => {
      const lookup = snapshot.registry.lookupField(item.candidateId);
      if (lookup.status !== "ready" && lookup.status !== "blocked") return [];
      const domName = lookup.handle.candidate.domName;
      const stage =
        adapter.stateDriverStage?.(item, lookup.handle) ??
        (adapter.isStateDriver(item, domName) ? 1 : undefined);
      const key = stateDriverKey(item, domName, lookup.handle.itemIndex);
      return !item.selected ||
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
      const driversReady = await Promise.all(
        currentStateDriverItems.map(
          ({ handle }) =>
            adapter.waitForStateDriverReady?.(pageDocument, handle) ?? true,
        ),
      );
      if (!driversReady.every(Boolean)) {
        setExceptionTitle("조건부 선택 메뉴를 안전하게 준비하지 못했습니다");
        setStage("exception");
        return;
      }
      const stateSelectionResults = [];
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
        const special = eligible
          ? await adapter.executeStateDriver?.(
              pageDocument,
              lookup.handle,
              item,
              run.controller.signal,
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
                {
                  candidateId: item.candidateId,
                  status: special ? "written" : "skipped",
                },
              ]),
        );
      }
      if (
        stateSelectionResults.every((result) => result.status === "written")
      ) {
        const settled = await Promise.all(
          currentStateDriverItems.map(
            ({ handle }) =>
              adapter.settleStateDriver?.(pageDocument, handle) ?? true,
          ),
        );
        if (!settled.every(Boolean)) {
          setExceptionTitle(
            "조건부 선택 뒤 입력란을 안전하게 준비하지 못했습니다",
          );
          setStage("exception");
          return;
        }
        const nextCompletedStateDriverKeys = new Set(completedStateDriverKeys);
        currentStateDriverItems.forEach(({ key }) =>
          nextCompletedStateDriverKeys.add(key),
        );
        await analyzeFields(
          loadedProfile,
          ignoreFreshRowDefaults,
          nextCompletedStateDriverKeys,
        );
        return;
      }
      if (adapter.stateDriverStage) {
        setExceptionTitle("조건부 선택을 안전하게 적용하지 못했습니다");
        setStage("exception");
        return;
      }
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
            lookup.handle.candidate.domName,
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
    const finalWriteItems = automaticItems.filter((item) => {
      const lookup = snapshot.registry.lookupField(item.candidateId);
      if (lookup.status !== "ready" && lookup.status !== "blocked") {
        return true;
      }
      return !completedStateDriverKeys.has(
        stateDriverKey(
          item,
          lookup.handle.candidate.domName,
          lookup.handle.itemIndex,
        ),
      );
    });
    const writeResults = await executeApprovedWritesAfterPageSettles({
      items: finalWriteItems,
      approvedCandidateIds,
      registry: snapshot.registry,
    });
    setResults(writeResults);
    setStage("result");
  };

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
        setPreparationItems(
          preparationPlans.map((plan) =>
            preparationItem(plan, snapshot, loadedProfile),
          ),
        );
        setWarnings(analysis.warningCodes ?? []);
        setPreparationExecutionPending(true);
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
    const runnablePlans = preparationItems
      .filter((item) => item.runnable)
      .map((item) => ({ ...item, approved: true }));

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
        if (
          lookup.handle.element instanceof HTMLInputElement &&
          lookup.handle.element.type === "radio"
        ) {
          const label = plan.optionDisplayName ?? value.value;
          if (lookup.handle.candidate.displayName !== label)
            return "option-label-mismatch";
          lookup.handle.element.click();
          return lookup.handle.element.checked
            ? "selected"
            : "action-not-ready";
        }
        if (!(lookup.handle.element instanceof HTMLSelectElement))
          return "unsupported-option-action";
        const option = Array.from(lookup.handle.element.options).find(
          (candidate) => candidate.textContent?.trim() === value.value,
        );
        if (!option) return "option-label-mismatch";
        lookup.handle.element.value = option.value;
        lookup.handle.element.dispatchEvent(
          new Event("change", { bubbles: true }),
        );
        return "selected";
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
          return adapter.selectReveal(
            pageDocument,
            selection,
            resolved.status === "resolved" ? resolved.value : undefined,
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
            ...preparationItem(plan, followUpSnapshot, profile),
            approved: true,
          }))
          .filter((item) => item.runnable);
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

  const writeRevealedFields = async (
    loadedProfile: Profile,
    plans: readonly PreparationItem[],
  ) => {
    const revealedFieldBindings = adapter.revealedBindings(
      plans.map((item) => item.plan),
    );
    if (revealedFieldBindings.size === 0) return;
    const diagnostics: WorkflowDiagnostic[] = [
      { code: "FOLLOW_UP_BINDINGS", count: revealedFieldBindings.size },
    ];

    const snapshot = collectFieldsSnapshot(pageDocument);
    const analysis = await apiClient.analyzeFields(snapshot.request);
    if (analysis.analysisStatus === "BLOCKED") {
      setWorkflowDiagnostics([
        ...diagnostics,
        { code: "ANALYSIS_BLOCKED", count: 1 },
      ]);
      return;
    }

    const items = analysis.fields.flatMap((field) => {
      if (field.matchType !== "MATCH" || field.interactionStatus !== "READY")
        return [];
      const lookup = snapshot.registry.lookupField(field.candidateId);
      if (lookup.status !== "ready") return [];
      const domName = lookup.handle.candidate.domName;
      const profileFieldKey = adapter.revealedProfileFieldKey(
        field,
        domName,
        revealedFieldBindings,
      );
      if (!profileFieldKey) return [];
      // Resolve a sole saved entry independently of template-based DOM row indices.
      // Multiple saved entries remain ambiguous in the common profile resolver.
      const resolved = resolveProfileFieldValue(loadedProfile, profileFieldKey);
      if (resolved.status !== "resolved") return [];
      return [
        {
          candidateId: field.candidateId,
          fieldLabel:
            lookup.handle.candidate.displayName ?? domName ?? "조건부 입력란",
          profileFieldKey,
          ...(resolved.profileEntryId
            ? { profileEntryId: resolved.profileEntryId }
            : {}),
          ...(lookup.handle.itemIndex !== undefined
            ? { itemIndex: lookup.handle.itemIndex }
            : {}),
          currentValue: lookup.handle.elements[0]?.value ?? "",
          profileValue: resolved.value,
          previewValue: resolved.value,
          status: "available" as const,
          selected: true,
          disabled: false,
          revealed: true,
          reason: "정책으로 연결된 조건부 입력란",
          analysis: field,
        } satisfies ReviewPlanItem,
      ];
    });
    diagnostics.push({ code: "ELIGIBLE_FIELDS", count: items.length });
    const results = executeApprovedWrites({
      items,
      approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
      registry: snapshot.registry,
    });
    diagnostics.push(
      {
        code: "WRITTEN",
        count: results.filter((result) => result.status === "written").length,
      },
      {
        code: "SKIPPED",
        count: results.filter((result) => result.status === "skipped").length,
      },
    );
    setWorkflowDiagnostics((previous) => [...previous, ...diagnostics]);
  };

  const toggleReviewItem = (candidateId: string) => {
    setReviewItems((items) =>
      items.map((item) =>
        item.candidateId === candidateId && !item.disabled
          ? { ...item, selected: !item.selected }
          : item,
      ),
    );
  };

  const revealSensitiveItem = (candidateId: string) => {
    setReviewItems((items) =>
      items.map((item) =>
        item.candidateId === candidateId
          ? revealSensitiveReviewItem(item)
          : item,
      ),
    );
  };

  const executeWrites = async () => {
    if (!fieldsSnapshot) return;
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

  if (stage === "analyzing") {
    return null;
  }

  if (stage === "preparation-review") {
    const runnableItems = preparationItems.filter((item) => item.runnable);
    const additions = preparationItems.reduce(
      (count, item) => count + (item.requiredAdditions ?? 0),
      0,
    );
    const unavailableCount = preparationItems.length - runnableItems.length;
    return (
      <div className={styles.screen}>
        <Header step="1 / 3" title="입력 항목 준비" />
        <p className={styles.lead}>
          필요한 입력칸을 준비한 뒤 자동 기입할 항목만 확인합니다.
        </p>
        <div className={styles.countCard}>
          <strong>{runnableItems.length}개 준비</strong>
          <span>
            {additions > 0
              ? `입력 행 ${additions}개를 추가합니다.`
              : "현재 화면의 입력 행을 그대로 사용합니다."}
          </span>
          {unavailableCount > 0 && (
            <small>
              {unavailableCount}개 항목은 저장된 값이 없어 직접 선택이
              필요합니다.
            </small>
          )}
        </div>
        {warnings.map((warning) => (
          <aside className={styles.safety} key={warning}>
            분석 경고:{" "}
            {warning === "MANUAL_REVEAL_REQUIRED"
              ? "수동으로 펼쳐야 하는 영역이 있습니다."
              : warning}
          </aside>
        ))}
        <button
          className={styles.primary}
          type="button"
          onClick={() => void executePreparation()}
        >
          준비하고 계속
        </button>
      </div>
    );
  }

  if (stage === "review") {
    const selectedCount = reviewItems.filter(
      (item) => item.selected && !item.disabled,
    ).length;
    const exceptionalItems = reviewItemsForDisplay(reviewItems).filter(
      (item) => item.status !== "available",
    );
    return (
      <div className={styles.screen}>
        <Header step="2 / 3" title="자동 기입 확인" />
        <p className={styles.lead}>일반 항목은 자동으로 포함되었습니다.</p>
        <div className={styles.countCard}>
          <strong>{selectedCount}개 항목</strong>
          <span>이 버튼을 누르면 선택된 항목만 현재 지원서에 기입합니다.</span>
        </div>
        {partial && (
          <aside className={styles.safety}>
            일부 필드는 분석하지 못해 자동 기입 대상에서 제외했습니다.
          </aside>
        )}
        {warnings.map((warning) => (
          <aside className={styles.safety} key={warning}>
            분석 경고:{" "}
            {warning === "UNRESOLVED_FIELD"
              ? "일부 필드를 연결하지 못했습니다."
              : "LLM 분석 일부 미완료"}
          </aside>
        ))}
        {exceptionalItems.length > 0 && (
          <section
            className={styles.exceptionList}
            aria-label="확인 필요한 항목"
          >
            <h3>확인 필요한 항목 {exceptionalItems.length}개</h3>
            {exceptionalItems.map((item) => (
              <article
                className={styles.reviewItem}
                data-included={item.selected}
                data-status={item.status}
                key={item.candidateId}
              >
                <span className={styles.reviewCopy}>
                  <strong>{item.fieldLabel}</strong>
                  <span>현재 입력값: {currentPreview(item)}</span>
                  <span>입력 예정값: {item.previewValue}</span>
                  <small>{item.reason}</small>
                  {mappingLabel(item) && (
                    <small>매핑 근거: {mappingLabel(item)}</small>
                  )}
                  {interactionLabel(item) && (
                    <small>입력 상태: {interactionLabel(item)}</small>
                  )}
                </span>
                <em>{statusLabel(item)}</em>
                {item.status === "sensitive" && !item.revealed && (
                  <button
                    className={styles.reviewAction}
                    type="button"
                    aria-label={`${item.fieldLabel} 값 보기`}
                    onClick={() => revealSensitiveItem(item.candidateId)}
                  >
                    값 보기
                  </button>
                )}
                {item.status !== "available" &&
                  !item.disabled &&
                  (item.status !== "sensitive" || item.revealed) && (
                    <button
                      className={styles.reviewAction}
                      type="button"
                      aria-label={`${item.fieldLabel} ${item.selected ? "제외하기" : "포함하기"}`}
                      onClick={() => toggleReviewItem(item.candidateId)}
                    >
                      {item.selected ? "제외하기" : "포함하기"}
                    </button>
                  )}
              </article>
            ))}
          </section>
        )}
        <p className={styles.safety}>
          지원서 저장·이동·제출은 실행하지 않습니다.
        </p>
        <button
          className={styles.primary}
          type="button"
          disabled={selectedCount === 0}
          onClick={() => void executeWrites()}
        >
          {selectedCount}개 항목 기입하기
        </button>
      </div>
    );
  }

  if (stage === "result") {
    const visibleResults = results.filter(
      (result) => !isSkippedByApproval(result),
    );
    const successful = visibleResults.filter(
      (result) => result.status === "written",
    ).length;
    const manualResults = visibleResults.filter(
      (result) => result.status !== "written",
    );
    return (
      <div className={styles.screen}>
        <Header step="완료" title="기입 결과" />
        {addressResult && (
          <p role="status">
            {addressResult.status === "written"
              ? "주소 확인 완료: "
              : "주소 직접 확인 필요: "}
            {addressResult.reason}
          </p>
        )}
        <div className={styles.resultGrid}>
          <div>
            <strong>{successful}</strong>
            <span>기입 성공</span>
          </div>
          <div>
            <strong>{visibleResults.length - successful}</strong>
            <span>직접 확인 필요</span>
          </div>
        </div>
        <p className={styles.safety}>
          성공한 항목은 지원서에서 한 번만 확인해 주세요. 저장과 제출은 직접
          진행합니다.
        </p>
        {manualResults.length > 0 && <h3>확인 필요</h3>}
        {manualResults.length > 0 && (
          <ul className={`${styles.boundaries} ${styles.resultList}`}>
            {manualResults.map((result) => {
              const item = reviewItems.find(
                (candidate) => candidate.candidateId === result.candidateId,
              );
              const reason = userFacingReason(result.reason);
              return (
                <li className={styles.resultItem} key={result.candidateId}>
                  <div className={styles.resultItemHeader}>
                    <strong>{profileFieldLabel(item?.profileFieldKey)}</strong>
                    <strong>{resultStatusLabel(result)}</strong>
                  </div>
                  <p className={styles.resultValue}>
                    {item?.previewValue ?? "입력값 확인 필요"}
                  </p>
                  {reason && <p>{reason}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {adapter.diagnosticsTitle && (
          <details className={styles.safety}>
            <summary>{adapter.diagnosticsTitle}</summary>
            <ul className={styles.boundaries}>
              {workflowDiagnostics.length === 0 && (
                <li>후속 조건부 입력 진단이 생성되지 않았습니다.</li>
              )}
              {workflowDiagnostics.map((diagnostic, index) => (
                <li key={index}>
                  {diagnosticLabel(diagnostic.code)}: {diagnostic.count}개
                </li>
              ))}
            </ul>
          </details>
        )}
        <button className={styles.primary} type="button" onClick={onExit}>
          수동 복사로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <Header step="예외" title={exceptionTitle} />
      <div className={styles.exceptionCard}>
        <p>
          자동 기입은 완료하지 않았습니다. 조건부 선택 상태는 변경되었을 수
          있으며, 수동 복사는 계속 사용할 수 있습니다.
        </p>
      </div>
      <button className={styles.primary} type="button" onClick={onExit}>
        수동 복사로 돌아가기
      </button>
    </div>
  );
}
