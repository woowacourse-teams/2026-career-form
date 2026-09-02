import { useEffect, useState } from "react";

import { AnalysisServiceError } from "../api/runtime-client";
import type { AnalysisApiClient, PreparationPlan } from "../api/types";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
  type CollectedSnapshot,
} from "../dom/collect";
import { executeApprovedPreparationPlans } from "../preparation/executor";
import {
  buildReviewPlan,
  revealSensitiveReviewItem,
  resolveProfileFieldValue,
  reviewItemsForDisplay,
  type ReviewPlanItem,
} from "../review/review-plan";
import {
  executeApprovedWrites,
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
  education: ["학력"],
  languages: ["어학", "외국어"],
  certifications: ["자격", "면허"],
  projects: ["프로젝트"],
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
    const runnable = value?.status === undefined || value.status === "resolved";
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
  return error instanceof AnalysisServiceError
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
  const [autoWritePending, setAutoWritePending] = useState(false);
  const [autoPreparationPending, setAutoPreparationPending] = useState(false);

  const analyzeFields = async (loadedProfile: Profile) => {
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
    const plan = buildReviewPlan({
      analysis,
      profile: loadedProfile,
      registry: snapshot.registry,
    });
    if (plan.status === "blocked") {
      setExceptionTitle("이 페이지에서는 자동 기입을 진행할 수 없습니다");
      setStage("exception");
      return;
    }
    setFieldsSnapshot(snapshot);
    setReviewItems(plan.items);
    setPartial(plan.status === "partial");
    setWarnings(analysis.warningCodes ?? []);
    setAutoWritePending(true);
    setStage("review");
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
        setStage("analyzing");
        setAutoPreparationPending(true);
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
      await analyzeFields(profile);
      return;
    }
    const result = await executeApprovedPreparationPlans({
      approvedPlans: runnablePlans,
      initialSnapshot: {
        registry: preparationSnapshot.registry,
        isTargetSectionVisible: (targetSectionId) =>
          preparationSnapshot.isSectionVisible(targetSectionId),
        countRepeatableGroups: (plan) =>
          preparationSnapshot.countRepeatableGroups(plan.actionCandidateId),
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
      selectProfileOption: (plan, snapshot) => {
        const lookup = snapshot.registry.lookupAction(plan.actionCandidateId);
        if (
          lookup.status !== "ready" ||
          !(lookup.handle.element instanceof HTMLSelectElement)
        ) {
          return false;
        }
        const value = resolveProfileFieldValue(profile, plan.profileFieldKey);
        if (value.status !== "resolved") return false;
        const option = Array.from(lookup.handle.element.options).find(
          (candidate) => candidate.textContent?.trim() === value.value,
        );
        if (!option) return false;
        lookup.handle.element.value = option.value;
        lookup.handle.element.dispatchEvent(
          new Event("change", { bubbles: true }),
        );
        return true;
      },
    });
    console.info(
      `[CareerForm] preparation execution result ${JSON.stringify({
        status: result.status,
        executedPlanCount: result.executedPlanCount,
        reason: result.status === "failed" ? result.reason : undefined,
      })}`,
    );
    if (result.status !== "completed") {
      setExceptionTitle("준비 동작을 안전하게 완료하지 못했습니다");
      setStage("exception");
      return;
    }
    try {
      setStage("analyzing");
      await analyzeFields(profile);
    } catch (error) {
      setExceptionTitle(safeErrorTitle(error));
      setStage("exception");
    }
  };

  useEffect(() => {
    if (!autoPreparationPending || !profile || !preparationSnapshot) return;
    setAutoPreparationPending(false);
    void executePreparation();
  }, [autoPreparationPending, preparationSnapshot, profile]);

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

  const executeWrites = () => {
    if (!fieldsSnapshot) return;
    const approvedCandidateIds = new Set(
      reviewItems
        .filter((item) => item.selected && !item.disabled)
        .map((item) => item.candidateId),
    );
    setResults(
      executeApprovedWrites({
        items: reviewItems,
        approvedCandidateIds,
        registry: fieldsSnapshot.registry,
      }),
    );
    setStage("result");
  };

  useEffect(() => {
    if (!autoWritePending || stage !== "review" || !fieldsSnapshot) return;
    setAutoWritePending(false);
    const autoItems = reviewItems.map((item) =>
      item.disabled ? item : { ...item, selected: true },
    );
    setResults(
      executeApprovedWrites({
        items: autoItems,
        approvedCandidateIds: new Set(
          autoItems
            .filter((item) => !item.disabled)
            .map((item) => item.candidateId),
        ),
        registry: fieldsSnapshot.registry,
      }),
    );
    setStage("result");
  }, [autoWritePending, fieldsSnapshot, reviewItems, stage]);

  if (stage === "analyzing") {
    return (
      <div className={styles.screen}>
        <Header step="1 / 4" title="지원서 분석 중" />
        <div className={styles.analysisGraphic} aria-hidden="true">
          <div className={styles.analysisSpinner}>
            {Array.from({ length: 12 }, (_, index) => (
              <span data-spinner-bar key={index} />
            ))}
          </div>
        </div>
        <p className={styles.lead}>
          지원서 구조를 비식별 정보만으로 확인합니다.
        </p>
        <aside className={styles.safety}>
          이 단계에서는 지원서 값을 변경하지 않습니다.
        </aside>
      </div>
    );
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
          onClick={executeWrites}
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
          지원서 값은 변경되지 않았습니다. 수동 복사는 계속 사용할 수 있습니다.
        </p>
      </div>
      <button className={styles.primary} type="button" onClick={onExit}>
        수동 복사로 돌아가기
      </button>
    </div>
  );
}
