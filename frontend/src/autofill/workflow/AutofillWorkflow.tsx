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
  | "analyzing"
  | "preparation-review"
  | "review"
  | "confirmation"
  | "result"
  | "exception";

interface PreparationItem {
  plan: PreparationPlan;
  approved: boolean;
  localItemCount?: number;
  currentGroupCount?: number;
  requiredAdditions?: number;
}

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
  const category = PROFILE_CATEGORIES.find(
    (candidate) =>
      candidate.repeatable &&
      normalized(candidate.label) === normalized(section?.displayName),
  );
  return category
    ? profile[category.id as RepeatedProfileCategoryId].length
    : 0;
}

function preparationItem(
  plan: PreparationPlan,
  snapshot: ReturnType<typeof collectPreparationSnapshot>,
  profile: Profile,
): PreparationItem {
  const localCount = localItemCount(plan, snapshot, profile);
  if (plan.command !== "ADD_REPEATABLE_GROUP") {
    return { plan, approved: false, localItemCount: localCount };
  }
  const currentGroupCount = snapshot.countRepeatableGroups(
    plan.actionCandidateId,
  );
  return {
    plan,
    approved: false,
    localItemCount: localCount,
    currentGroupCount,
    ...(localCount !== undefined && currentGroupCount !== undefined
      ? { requiredAdditions: Math.max(0, localCount - currentGroupCount) }
      : {}),
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
  return result.reason === "사용자가 승인한 입력 항목이 아닙니다."
    ? "승인하지 않아 건너뜀"
    : "직접 입력 필요";
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

  const analyzeFields = async (loadedProfile: Profile) => {
    const snapshot = collectFieldsSnapshot(pageDocument);
    const analysis = await apiClient.analyzeFields(snapshot.request);
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
        const analysis = await apiClient.analyzePreparation(snapshot.request);
        if (!active) return;
        if (analysis.analysisStatus === "BLOCKED") {
          setExceptionTitle("이 페이지에서는 자동 기입을 진행할 수 없습니다");
          setStage("exception");
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
        setStage("preparation-review");
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
    const result = await executeApprovedPreparationPlans({
      approvedPlans: preparationItems,
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
    });
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

  if (stage === "analyzing") {
    return (
      <div className={styles.screen}>
        <Header step="1 / 4" title="지원서 분석 중" />
        <div className={styles.analysisGraphic} aria-hidden="true">
          <span />
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
    return (
      <div className={styles.screen}>
        <Header step="2 / 4" title="지원서 준비 동작 검토" />
        <p className={styles.lead}>
          아래 동작은 필드 분석을 위해서만 실행되며, 승인 전에는 실행하지
          않습니다.
        </p>
        {preparationItems.map((item, index) => (
          <label
            className={styles.reviewItem}
            key={item.plan.actionCandidateId}
          >
            <input
              type="checkbox"
              checked={item.approved}
              onChange={() =>
                setPreparationItems((items) =>
                  items.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? { ...candidate, approved: !candidate.approved }
                      : candidate,
                  ),
                )
              }
            />
            <span className={styles.reviewCopy}>
              <strong>
                {item.plan.command === "REVEAL_SECTION"
                  ? "숨은 영역 펼치기"
                  : "반복 입력 영역 추가"}
              </strong>
              <small>지원서 저장·이동·제출은 실행하지 않습니다.</small>
              {item.requiredAdditions !== undefined && (
                <small>
                  현재 화면 기준 추가 필요 수: {item.requiredAdditions}회
                </small>
              )}
            </span>
          </label>
        ))}
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
          disabled={preparationItems.some((item) => !item.approved)}
          onClick={() => void executePreparation()}
        >
          승인한 준비 동작 실행
        </button>
      </div>
    );
  }

  if (stage === "review") {
    return (
      <div className={styles.screen}>
        <Header step="2 / 4" title="입력 예정 항목 검토" />
        <p className={styles.lead}>선택한 항목만 최종 승인 뒤에 입력합니다.</p>
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
        <div className={styles.reviewList}>
          {reviewItems.map((item) => (
            <label
              className={styles.reviewItem}
              data-status={item.status}
              key={item.candidateId}
            >
              <input
                type="checkbox"
                checked={item.selected}
                disabled={item.disabled}
                aria-label={
                  item.status === "conflict"
                    ? `${item.fieldLabel} 기존 값 덮어쓰기 승인`
                    : `${item.fieldLabel} 입력 승인`
                }
                onChange={() => toggleReviewItem(item.candidateId)}
              />
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
                  type="button"
                  aria-label={`${item.fieldLabel} 값 보기`}
                  onClick={() => revealSensitiveItem(item.candidateId)}
                >
                  값 보기
                </button>
              )}
            </label>
          ))}
        </div>
        <button
          className={styles.primary}
          type="button"
          onClick={() => setStage("confirmation")}
        >
          선택한 항목 확인
        </button>
      </div>
    );
  }

  if (stage === "confirmation") {
    const selectedCount = reviewItems.filter(
      (item) => item.selected && !item.disabled,
    ).length;
    return (
      <div className={styles.screen}>
        <Header step="3 / 4" title="최종 승인" />
        <div className={styles.countCard}>
          <strong>{selectedCount}개 항목</strong>
          <span>선택한 항목만 지원서에 반영합니다.</span>
        </div>
        <ul className={styles.boundaries}>
          <li>지원서 저장을 실행하지 않음</li>
          <li>다음 단계와 미리보기로 이동하지 않음</li>
          <li>최종 제출을 실행하지 않음</li>
        </ul>
        <div className={styles.actions}>
          <button type="button" onClick={() => setStage("review")}>
            검토로 돌아가기
          </button>
          <button
            className={styles.primary}
            type="button"
            onClick={executeWrites}
          >
            기입하기
          </button>
        </div>
      </div>
    );
  }

  if (stage === "result") {
    const successful = results.filter(
      (result) => result.status === "written",
    ).length;
    return (
      <div className={styles.screen}>
        <Header step="완료" title="기입 결과" />
        <div className={styles.resultGrid}>
          <div>
            <strong>{successful}</strong>
            <span>기입 성공</span>
          </div>
          <div>
            <strong>{results.length - successful}</strong>
            <span>직접 확인 필요</span>
          </div>
        </div>
        <p className={styles.safety}>지원서의 실제 값을 직접 확인해 주세요.</p>
        <ul className={styles.boundaries}>
          {results.map((result) => {
            const item = reviewItems.find(
              (candidate) => candidate.candidateId === result.candidateId,
            );
            const reason =
              result.status === "written" ? item?.reason : result.reason;
            return (
              <li key={result.candidateId}>
                <strong>
                  {item?.fieldLabel ?? "지원서 필드"}:{" "}
                  {resultStatusLabel(result)}
                </strong>
                {reason && <span>{reason}</span>}
              </li>
            );
          })}
        </ul>
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
