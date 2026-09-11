import { browser } from "wxt/browser";
import { createAddressSearch } from "../address/runtime";
import type {
  AddressSearch,
  AddressResult,
  AddressValue,
} from "../address/types";
import {
  getWorkflowAdapter,
  type WorkflowAdapter,
  type WorkflowDiagnostic,
} from "../adapters/workflow";
import { AnalysisServiceError } from "../api/runtime-client";
import { AnalysisContractError } from "../api/validate-response";
import type { AnalysisApiClient, PreparationPlan } from "../api/types";
import {
  collectPreparationSnapshot,
  type CollectedSnapshot,
} from "../dom/collect";
import { normalizeProfileOptionValue } from "../profile/standard-profile-option";
import { requiresSensitiveConfirmation } from "../profile/sensitive-confirmation";
import {
  resolveProfileFieldValue,
  reviewItemsForDisplay,
  type ReviewPlanItem,
} from "../review/review-plan";
import { type ApprovedWriteResult } from "../write/executor";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import type { Profile, RepeatedProfileCategoryId } from "../../profile/model";
import type { ProfileRepository } from "../../profile/profile-repository";
import styles from "../../autofill-demo/AutofillDemo.module.css";

export type Stage =
  "analyzing" | "preparation-review" | "review" | "result" | "exception";

export interface PreparationItem {
  plan: PreparationPlan;
  actionLabel: string;
  runnable: boolean;
  unavailableReason?: string;
  localItemCount?: number;
  currentGroupCount?: number;
  requiredAdditions?: number;
  sensitive?: boolean;
  profileValue?: string;
}

export function reviewProfileFieldKey(
  item: ReviewPlanItem,
): string | undefined {
  return item.analysis?.valueBinding?.profileFieldKey ?? item.profileFieldKey;
}

export function localProfileValue(
  profile: Profile,
  key: string,
): string | undefined {
  const resolved = resolveProfileFieldValue(profile, key);
  return resolved.status === "resolved" ? resolved.value : undefined;
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

export function adapterProfileValue(
  adapter: WorkflowAdapter,
  profileFieldKey: string,
  value: string,
): string {
  const normalized = normalizeProfileOptionValue(profileFieldKey, value);
  return (
    adapter.normalizeProfileValue?.(profileFieldKey, normalized) ?? normalized
  );
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

export const runtimeAddressSearch = createAddressSearch(() =>
  browser.runtime.connect({ name: "cf-address-top" }),
);
export const addressValue = (profile: Profile): AddressValue => ({
  address: profile.contact.addressLine1 ?? "",
  postalCode: profile.contact.postalCode ?? "",
  detail: profile.contact.addressLine2 ?? "",
});

export interface WorkflowProps {
  addressSearch?: AddressSearch;
  apiClient: AnalysisApiClient;
  repository: Pick<ProfileRepository, "load">;
  pageDocument: Document;
  onExit(): void;
}

export function pageHost(pageDocument: Document): string {
  return pageDocument.location?.host ?? "";
}

export function Header({ step, title }: { step: string; title: string }) {
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

export function stateDriverKey(
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
    profileFieldKey ?? "unbound",
    domName ?? item.candidateId,
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

export function actionLabel(
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

export function reviewGroupsForDisplay(
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

export function preparationItem(
  plan: PreparationPlan,
  snapshot: ReturnType<typeof collectPreparationSnapshot>,
  profile: Profile,
  adapter: WorkflowAdapter,
): PreparationItem {
  const localCount = localItemCount(plan, snapshot, profile);
  if (plan.command !== "ADD_REPEATABLE_GROUP") {
    const value =
      plan.command === "SELECT_OPTION_TO_REVEAL"
        ? resolveProfileFieldValue(profile, plan.profileFieldKey)
        : undefined;
    const profileAllowsSelection =
      plan.command !== "SELECT_OPTION_TO_REVEAL" ||
      (value?.status === "resolved" &&
        shouldRunRevealPlan(
          adapterProfileValue(adapter, plan.profileFieldKey, value.value),
          plan.optionDisplayName,
          plan.selectableProfileValues,
        ));
    const lookup = snapshot.registry.lookupAction(plan.actionCandidateId);
    const adapterAllowsSelection =
      profileAllowsSelection &&
      plan.command === "SELECT_OPTION_TO_REVEAL" &&
      value?.status === "resolved" &&
      lookup.status === "ready"
        ? adapter.canSelectProfileOption?.(
            lookup.handle,
            adapterProfileValue(adapter, plan.profileFieldKey, value.value),
            plan.profileFieldKey,
          )
        : undefined;
    const runnable = profileAllowsSelection && adapterAllowsSelection !== false;
    return {
      plan,
      actionLabel: actionLabel(plan, snapshot),
      runnable,
      sensitive:
        plan.command === "SELECT_OPTION_TO_REVEAL" &&
        requiresSensitiveConfirmation(
          plan.profileFieldKey,
          value?.sensitive === true,
        ),
      ...(plan.command === "SELECT_OPTION_TO_REVEAL" &&
      value?.status === "resolved"
        ? {
            profileValue: adapterProfileValue(
              adapter,
              plan.profileFieldKey,
              value.value,
            ),
          }
        : {}),
      ...(runnable
        ? {}
        : {
            unavailableReason:
              adapterAllowsSelection === false
                ? "현재 선택된 값을 보존하기 위해 준비하지 않습니다."
                : "저장된 프로필 값이 없어 직접 선택이 필요합니다.",
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

export function statusLabel(item: ReviewPlanItem): string {
  const labels = {
    available: "입력 가능",
    "needs-review": "확인 필요",
    conflict: "기존 값 충돌",
    sensitive: "민감정보",
    unavailable: "입력 불가",
  } as const;
  return labels[item.status];
}

export function profileFieldLabel(profileFieldKey?: string): string {
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

export function userFacingReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  if (reason.includes("네이티브") || reason.includes("안전하게 입력")) {
    return "이 입력란은 자동으로 입력할 수 없어 직접 확인이 필요합니다.";
  }
  if (reason.includes("지원서에 기존 값")) {
    return "지원서에 기존 값이 있어 자동으로 덮어쓰지 않았습니다.";
  }
  return reason;
}

export function safeErrorTitle(error: unknown): string {
  return error instanceof AnalysisServiceError ||
    error instanceof AnalysisContractError
    ? error.message
    : "분석을 완료하지 못했습니다";
}

export function mappingLabel(item: ReviewPlanItem): string | undefined {
  if (item.analysis?.mappingStatus === "ADAPTER_VERIFIED") {
    return "어댑터 검증";
  }
  return item.analysis?.mappingStatus === "LLM_SUGGESTED"
    ? "LLM 제안"
    : undefined;
}

export function interactionLabel(item: ReviewPlanItem): string | undefined {
  const labels = {
    READY: "입력 준비됨",
    MANUAL_REVEAL_REQUIRED: "수동으로 펼쳐야 함",
    BLOCKED: "입력 차단됨",
    SYSTEM_CONTROL: "시스템 제어 항목",
    UNVERIFIED: "검증되지 않음",
  } as const;
  return item.analysis ? labels[item.analysis.interactionStatus] : undefined;
}

export function currentPreview(item: ReviewPlanItem): string {
  return item.status === "sensitive" && !item.revealed
    ? "••••••••"
    : item.currentValue || "입력된 값 없음";
}

export function diagnosticLabel(code: WorkflowDiagnostic["code"]): string {
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

export function resultStatusLabel(result: ApprovedWriteResult): string {
  if (result.status === "written") return "기입 성공";
  return result.reason === SKIPPED_BY_APPROVAL_REASON
    ? "승인하지 않아 건너뜀"
    : "직접 입력 필요";
}

export function isSkippedByApproval(result: ApprovedWriteResult): boolean {
  return (
    result.status === "skipped" && result.reason === SKIPPED_BY_APPROVAL_REASON
  );
}
