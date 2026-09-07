import { useEffect, useState } from "react";

import { AnalysisServiceError } from "../api/runtime-client";
import { AnalysisContractError } from "../api/validate-response";
import type {
  AnalysisApiClient,
  MatchedFieldAnalysis,
  PreparationPlan,
} from "../api/types";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
  isSkCareersHost,
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

export function hasFreshUniversityRows(
  items: readonly Pick<
    PreparationItem,
    "plan" | "currentGroupCount" | "requiredAdditions"
  >[],
): boolean {
  return items.some(
    (item) =>
      item.plan.command === "ADD_REPEATABLE_GROUP" &&
      item.plan.expectedFieldNames?.includes("eduEducationName") === true &&
      item.currentGroupCount === 0 &&
      (item.requiredAdditions ?? 0) > 0,
  );
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

export function isLanguageTypeStateDriver(
  item: ReviewPlanItem,
  domName: string | undefined,
  host: string,
): boolean {
  return (
    isSkCareersHost(host) &&
    item.analysis?.writePlan?.command === "SELECT_OPTION" &&
    domName === "lngLanguageType"
  );
}

const SK_UNIVERSITY_MAJOR_REVEALS = [
  {
    domName: "eduMajorDoubleYN",
    profileFieldKey: "education.university.doubleMajorStatus",
    label: "복수전공",
  },
  {
    domName: "eduMajorSubYN",
    profileFieldKey: "education.university.minorStatus",
    label: "부전공",
  },
] as const;

function hasUuidSuffix(value: string, baseName: string): boolean {
  return new RegExp(
    `^${baseName}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
    "i",
  ).test(value);
}

function selectSkUniversityMajorReveals(
  document: Document,
  profile: Profile,
): string[] {
  return SK_UNIVERSITY_MAJOR_REVEALS.map((reveal) => {
    const value = resolveProfileFieldValue(profile, reveal.profileFieldKey, 0);
    if (value.status !== "resolved") {
      return `${reveal.label}: 프로필 값 없음`;
    }
    if (value.value.normalize("NFKC").trim() !== "있음") {
      return `${reveal.label}: 프로필 값이 '있음'이 아니어서 건너뜀`;
    }
    const target = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[type='radio']"),
    ).find((input) => {
      if (
        input.name !== reveal.domName &&
        !hasUuidSuffix(input.name, reveal.domName)
      ) {
        return false;
      }
      return (
        input.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim() === "있음"
      );
    });
    if (!target) {
      return `${reveal.label}: '있음' 라디오를 DOM에서 찾지 못함`;
    }
    if (!target.checked) target.click();
    return target.checked
      ? `${reveal.label}: '있음' 선행 선택 완료`
      : `${reveal.label}: '있음' 선행 선택 실패`;
  });
}

function syncHyundaiFloatingLabels(
  host: string,
  items: readonly ReviewPlanItem[],
  writeResults: readonly ApprovedWriteResult[],
  registry: ReturnType<typeof collectFieldsSnapshot>["registry"],
): void {
  if (host.toLowerCase() !== "talent.hyundai.com") return;

  items.forEach((item, index) => {
    if (
      writeResults[index]?.status !== "written" ||
      item.analysis?.writePlan?.command !== "SET_TEXT"
    ) {
      return;
    }
    const lookup = registry.lookupField(item.candidateId);
    if (lookup.status !== "ready") return;
    const element = lookup.handle.elements[0];
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      !element.value.trim()
    ) {
      return;
    }
    element.closest(".field")?.classList.add("exist");
  });
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

interface WorkflowProps {
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
): "highSchool" | "university" | "graduateSchool" | undefined {
  const normalizedLabel = matchLabel.toLowerCase();
  if (
    matchLabel.includes("대학원") ||
    normalizedLabel.includes("graduateschool") ||
    normalizedLabel.includes("educationgrad")
  ) {
    return "graduateSchool";
  }
  if (
    matchLabel.includes("고등학교") ||
    normalizedLabel.includes("highschool") ||
    normalizedLabel.includes("educationhigh")
  ) {
    return "highSchool";
  }
  if (
    matchLabel.includes("대학") ||
    normalizedLabel.includes("university") ||
    normalizedLabel.includes("educationuniv")
  ) {
    return "university";
  }
  return undefined;
}

function localItemCount(
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
  const category = PROFILE_CATEGORIES.find((candidate) =>
    matchesProfileCategory(candidate, matchLabel),
  );
  const profileItemCount = category
    ? category.id === "education"
      ? (() => {
          const sectionId = educationProfileSectionId(matchLabel);
          return sectionId
            ? profile.education.filter((entry) => entry.sectionId === sectionId)
                .length
            : profile.education.length;
        })()
      : profile[category.id as RepeatedProfileCategoryId].length
    : 0;
  console.info("[CareerForm] preparation count", {
    actionCandidateId: plan.actionCandidateId,
    sectionDisplayName: section?.displayName ?? null,
    actionDisplayName: action?.displayName ?? null,
    actionDomName: action?.domName ?? null,
    actionDomId: action?.domId ?? null,
    matchLabel,
    matchedCategory: category?.id ?? null,
    profileItemCount,
  });
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
  console.info("[CareerForm] preparation item", {
    actionCandidateId: plan.actionCandidateId,
    localItemCount: localCount ?? null,
    currentGroupCount: currentGroupCount ?? null,
    requiredAdditions: requiredAdditions ?? null,
  });
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
}: WorkflowProps) {
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
  const [skMajorDiagnostics, setSkMajorDiagnostics] = useState<string[]>([]);

  const analyzeFields = async (
    loadedProfile: Profile,
    ignoreFreshUniversityDefaults = false,
    languageSelectionPrepared = false,
  ) => {
    const snapshot = collectFieldsSnapshot(pageDocument);
    console.info("[CareerForm] fields snapshot", {
      snapshotId: snapshot.request.snapshotId,
      site: snapshot.request.site,
      sections: snapshot.request.sections.map((section) => ({
        sectionId: section.sectionId,
        displayName: section.displayName ?? null,
        fieldCount: section.fields.length,
        hiddenFieldCount: section.fields.filter(
          (field) => field.visibility === "hidden",
        ).length,
        itemCount: section.items?.length ?? 0,
      })),
      fieldCount: snapshot.request.sections.reduce(
        (count, section) => count + section.fields.length,
        0,
      ),
    });
    let analysis: Awaited<ReturnType<typeof apiClient.analyzeFields>>;
    try {
      analysis = await apiClient.analyzeFields(snapshot.request);
    } catch (error) {
      console.error("[CareerForm] fields analysis error", {
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : "분석 요청 실패",
      });
      throw error;
    }
    console.info("[CareerForm] fields analysis", {
      snapshotId: analysis.snapshotId,
      analysisStatus: analysis.analysisStatus,
      fieldResultCount: analysis.fields.length,
      warningCodes: analysis.warningCodes ?? [],
    });
    if (analysis.analysisStatus === "BLOCKED") {
      setExceptionTitle("이 페이지에서는 자동 기입을 진행할 수 없습니다");
      setStage("exception");
      return;
    }
    console.info(
      "[CareerForm] university dependent fields",
      analysis.fields.flatMap((field) => {
        const lookup = snapshot.registry.lookupField(field.candidateId);
        if (
          (lookup.status !== "ready" && lookup.status !== "blocked") ||
          !["eduMajorDouble", "eduMajorSub"].includes(
            lookup.handle.candidate.domName ?? "",
          )
        ) {
          return [];
        }
        return [
          {
            candidateId: field.candidateId,
            domName: lookup.handle.candidate.domName,
            matchType: field.matchType,
            ...(field.matchType === "MATCH"
              ? {
                  profileFieldKey: field.valueBinding?.profileFieldKey,
                  command: field.writePlan?.command,
                }
              : {}),
          },
        ];
      }),
    );
    const ignoreCurrentValueCandidateIds = new Set(
      ignoreFreshUniversityDefaults
        ? analysis.fields.flatMap((field) => {
            const lookup = snapshot.registry.lookupField(field.candidateId);
            return (lookup.status === "ready" || lookup.status === "blocked") &&
              lookup.handle.candidate.domName === "eduEducationType"
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
    const approvedCandidateIds = new Set(
      automaticItems
        .filter(
          (item) =>
            !item.disabled && (item.selected || item.status === "needs-review"),
        )
        .map((item) => item.candidateId),
    );
    const languageStateDriverItems = languageSelectionPrepared
      ? []
      : automaticItems.filter((item) => {
          const lookup = snapshot.registry.lookupField(item.candidateId);
          return (
            (lookup.status === "ready" || lookup.status === "blocked") &&
            isLanguageTypeStateDriver(
              item,
              lookup.handle.candidate.domName,
              snapshot.request.site.host,
            )
          );
        });
    if (languageStateDriverItems.length > 0) {
      const languageSelectionResults = executeApprovedWrites({
        items: languageStateDriverItems,
        approvedCandidateIds: new Set(
          languageStateDriverItems.map((item) => item.candidateId),
        ),
        registry: snapshot.registry,
      });
      if (
        languageSelectionResults.every((result) => result.status === "written")
      ) {
        console.info(
          "[CareerForm] language selection applied; recollecting fields",
          {
            candidateIds: languageStateDriverItems.map(
              (item) => item.candidateId,
            ),
          },
        );
        await analyzeFields(loadedProfile, ignoreFreshUniversityDefaults, true);
        return;
      }
    }
    const writeResults = await executeApprovedWritesAfterPageSettles({
      items: automaticItems,
      approvedCandidateIds,
      registry: snapshot.registry,
    });
    syncHyundaiFloatingLabels(
      snapshot.request.site.host,
      automaticItems,
      writeResults,
      snapshot.registry,
    );
    console.info(
      "[CareerForm] delayed dependent writes",
      automaticItems.flatMap((item, index) => {
        const lookup = snapshot.registry.lookupField(item.candidateId);
        if (
          (lookup.status !== "ready" && lookup.status !== "blocked") ||
          !["eduMajorDouble", "eduMajorSub", "lngExamName"].includes(
            lookup.handle.candidate.domName ?? "",
          )
        ) {
          return [];
        }
        return [
          {
            candidateId: item.candidateId,
            profileValue: item.profileValue,
            status: writeResults[index]?.status,
            reason:
              writeResults[index]?.status === "skipped"
                ? writeResults[index].reason
                : undefined,
          },
        ];
      }),
    );
    setResults(writeResults);
    setStage("result");
  };

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const loadedProfile = await repository.load();
        if (!active) return;
        setProfile(loadedProfile);
        const snapshot = collectPreparationSnapshot(pageDocument);
        console.info("[CareerForm] preparation snapshot", {
          site: snapshot.request.site,
          sections: snapshot.request.sections.map((section) => ({
            sectionId: section.sectionId,
            displayName: section.displayName ?? null,
            actionCandidates: section.actionCandidates.map((action) => ({
              candidateId: action.candidateId,
              displayName: action.displayName ?? null,
              domName: action.domName ?? null,
            })),
            repeatableGroupCount: section.actionCandidates[0]
              ? snapshot.countRepeatableGroups(
                  section.actionCandidates[0].candidateId,
                )
              : null,
          })),
        });
        const analysis = await apiClient.analyzePreparation(snapshot.request);
        console.info("[CareerForm] preparation analysis", {
          snapshotId: analysis.snapshotId,
          analysisStatus: analysis.analysisStatus,
          preparationPlans: analysis.preparationPlans.map((plan) => ({
            actionCandidateId: plan.actionCandidateId,
            command: plan.command,
            targetSectionId:
              plan.command === "REVEAL_SECTION"
                ? plan.targetSectionId
                : undefined,
          })),
        });
        if (!active) return;
        if (analysis.analysisStatus === "BLOCKED") {
          await analyzeFields(loadedProfile);
          return;
        }
        if (analysis.preparationPlans.length === 0) {
          await analyzeFields(loadedProfile);
          return;
        }
        setPreparationSnapshot(snapshot);
        setPreparationItems(
          analysis.preparationPlans.map((plan) =>
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
    };
  }, [apiClient, pageDocument, repository]);

  const executePreparation = async () => {
    if (!profile || !preparationSnapshot) return;
    const runnablePlans = preparationItems
      .filter((item) => item.runnable)
      .map((item) => ({ ...item, approved: true }));
    console.info(
      `[CareerForm] preparation execution ${JSON.stringify({
        approvedPlanCount: runnablePlans.length,
        skippedPlanCount: preparationItems.length - runnablePlans.length,
        approvedActionCandidateIds: runnablePlans.map(
          (item) => item.plan.actionCandidateId,
        ),
      })}`,
    );
    if (runnablePlans.length === 0) {
      const addedUniversityRowsToEmptyForm =
        hasFreshUniversityRows(runnablePlans);
      await analyzeFields(profile, addedUniversityRowsToEmptyForm);
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
    console.info(
      `[CareerForm] preparation execution result ${JSON.stringify({
        status: result.status,
        executedPlanCount: result.executedPlanCount,
        reason: result.status === "failed" ? result.reason : undefined,
      })}`,
    );
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
      const addedUniversityRowsToEmptyForm =
        hasFreshUniversityRows(runnablePlans);
      // Adding a repeatable row can expose a second layer of conditional
      // controls (for example, the university's double/minor-major radios).
      // SK Careers keeps those radios out of the preparation-action snapshot,
      // so select their explicit, profile-backed "있음" option before the
      // field snapshot is collected. This makes the two name controls exist
      // for the normal analysis/write flow below.
      if (isSkCareersHost(pageHost(pageDocument))) {
        setSkMajorDiagnostics(
          selectSkUniversityMajorReveals(pageDocument, profile),
        );
      }
      // Analyze that newly collected DOM once, but only execute selections:
      // repeating add plans here could create duplicate rows.
      const followUpSnapshot = collectPreparationSnapshot(pageDocument);
      const followUpAnalysis = await apiClient.analyzePreparation(
        followUpSnapshot.request,
      );
      console.info("[CareerForm] university dependent preparation", {
        status: followUpAnalysis.analysisStatus,
        plans: followUpAnalysis.preparationPlans.filter(
          (plan) => plan.command === "SELECT_OPTION_TO_REVEAL",
        ),
      });
      if (isSkCareersHost(pageHost(pageDocument))) {
        const revealedPlans = followUpAnalysis.preparationPlans.filter(
          (plan) => plan.command === "SELECT_OPTION_TO_REVEAL",
        );
        setSkMajorDiagnostics((previous) => [
          ...previous,
          `후속 조건부 선택 계획: ${revealedPlans.length}개`,
          ...revealedPlans.map(
            (plan) =>
              `선택 ${plan.profileFieldKey} → 후속 바인딩 ${Object.keys(plan.revealedFieldBindings ?? {}).join(", ") || "없음"}`,
          ),
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
          console.info("[CareerForm] university dependent result", {
            status: followUpResult.status,
            executedPlanCount: followUpResult.executedPlanCount,
            unavailableActionCandidateIds:
              followUpResult.status === "completed"
                ? followUpResult.unavailableActionCandidateIds
                : [],
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
          await writeSkRevealedMajorNames(profile, followUpPlans);
        }
      }
      await analyzeFields(profile, addedUniversityRowsToEmptyForm);
    } catch (error) {
      setExceptionTitle(safeErrorTitle(error));
      setStage("exception");
    }
  };

  const writeSkRevealedMajorNames = async (
    loadedProfile: Profile,
    plans: readonly PreparationItem[],
  ) => {
    if (!isSkCareersHost(pageHost(pageDocument))) return;
    const revealedFieldBindings = new Map(
      plans.flatMap((item) =>
        item.plan.command === "SELECT_OPTION_TO_REVEAL"
          ? Object.entries(item.plan.revealedFieldBindings ?? {})
          : [],
      ),
    );
    if (revealedFieldBindings.size === 0) return;

    const diagnostics = [
      `정책 후속 바인딩: ${[...revealedFieldBindings.keys()].join(", ")}`,
    ];

    const snapshot = collectFieldsSnapshot(pageDocument);
    const analysis = await apiClient.analyzeFields(snapshot.request);
    if (analysis.analysisStatus === "BLOCKED") {
      setSkMajorDiagnostics([...diagnostics, "필드 재분석이 차단되었습니다."]);
      return;
    }

    const items = analysis.fields.flatMap((field) => {
      if (field.matchType !== "MATCH") return [];
      const lookup = snapshot.registry.lookupField(field.candidateId);
      if (lookup.status !== "ready") return [];
      const domName = lookup.handle.candidate.domName;
      const profileFieldKey = domName
        ? revealedFieldBindings.get(domName)
        : undefined;
      if (
        !domName ||
        !profileFieldKey ||
        field.valueBinding?.profileFieldKey !== profileFieldKey ||
        field.writePlan?.command !== "SET_TEXT"
      ) {
        return [];
      }
      // A hidden SK template can precede the real row in DOM order. Resolve
      // the sole saved university entry without trusting that template-based
      // row index; multiple profile entries remain safely ambiguous.
      const resolved = resolveProfileFieldValue(loadedProfile, profileFieldKey);
      if (resolved.status !== "resolved") return [];
      return [
        {
          candidateId: field.candidateId,
          fieldLabel: lookup.handle.candidate.displayName ?? domName,
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
          reason: "SK 조건부 전공명 필드",
          analysis: field as MatchedFieldAnalysis,
        } satisfies ReviewPlanItem,
      ];
    });
    diagnostics.push(
      `정책·가시성·프로필 값을 모두 통과한 입력 후보: ${items.length}개`,
    );
    const results = executeApprovedWrites({
      items,
      approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
      registry: snapshot.registry,
    });
    diagnostics.push(
      ...results.map((result) =>
        result.status === "written"
          ? `${result.candidateId}: 입력 성공`
          : `${result.candidateId}: 건너뜀 (${result.reason})`,
      ),
    );
    setSkMajorDiagnostics((previous) => [...previous, ...diagnostics]);
    console.info("[CareerForm] SK revealed major-name writes", results);
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
        {isSkCareersHost(pageHost(pageDocument)) && (
          <details className={styles.safety}>
            <summary>SK 복수·부전공명 진단</summary>
            <ul className={styles.boundaries}>
              {(skMajorDiagnostics.length > 0
                ? skMajorDiagnostics
                : [
                    "후속 조건부 입력 진단이 생성되지 않았습니다. 자동기입 실행 흐름을 확인해야 합니다.",
                  ]
              ).map((diagnostic) => (
                <li key={diagnostic}>{diagnostic}</li>
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
