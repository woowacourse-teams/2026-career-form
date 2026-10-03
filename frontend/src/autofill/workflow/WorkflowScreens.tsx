import { useId, useState, type Dispatch, type SetStateAction } from "react";
import type { AddressResult } from "../address/types";
import type { WorkflowAdapter, WorkflowDiagnostic } from "../adapters/workflow";
import {
  reviewItemsForDisplay,
  type ReviewPlanItem,
} from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import styles from "../../autofill-demo/AutofillDemo.module.css";
import { WorkflowResults, type WorkflowResultsProps } from "./WorkflowResults";
import { resultFieldLabel } from "./result-label";
import resultStyles from "./WorkflowResults.module.css";
import resultCss from "./WorkflowResults.module.css?inline";
import { WorkflowLoading, type WriteProgress } from "./WorkflowLoading";
import type { WorkflowActivity } from "./progress-model";
import type { Profile } from "../../profile/model";
import {
  Header,
  mappingLabel,
  profileFieldLabel,
  reviewProfileFieldKey,
  statusLabel,
  interactionLabel,
  currentPreview,
  type PreparationItem,
  type Stage,
} from "./workflow-model";

const DEFAULT_CONDITIONAL_REVIEW_REASON =
  "지원서 조건을 확인한 뒤 선택해 주세요.";

interface WorkflowScreensProps {
  exitInToolbar?: boolean;
  wasWritten?: WorkflowResultsProps["wasWritten"];
  progressIdFor?: WorkflowResultsProps["progressIdFor"];
  progressStateFor?: WorkflowResultsProps["progressStateFor"];
  activity?: WorkflowActivity;
  progress?: readonly WriteProgress[];
  fieldStateFor?: WorkflowResultsProps["fieldStateFor"];
  profile?: Profile;
  optionsFor?(candidateId: string): readonly string[];
  currentCategory?: string;
  analysisSummary?: {
    mode: "ADAPTER" | "GENERIC";
    durationMs: number;
    fieldCount: number;
    matchedCount: number;
  };
  stage: Stage;
  preparationItems: readonly PreparationItem[];
  warnings: readonly string[];
  revealedPreparationKeys: ReadonlySet<string>;
  selectedPreparationKeys: ReadonlySet<string>;
  setRevealedPreparationKeys: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setSelectedPreparationKeys: Dispatch<SetStateAction<ReadonlySet<string>>>;
  executePreparation(): Promise<void>;
  reviewItems: readonly ReviewPlanItem[];
  partial: boolean;
  toggleReviewItem(candidateId: string): void;
  revealSensitiveItem(candidateId: string): void;
  executeWrites(): Promise<void>;
  results: readonly ApprovedWriteResult[];
  addressResult?: AddressResult;
  adapter: WorkflowAdapter;
  workflowDiagnostics: readonly WorkflowDiagnostic[];
  exceptionTitle: string;
  unsupportedImageUrl?: string;
  onLocate?(candidateId: string): boolean;
  operatedCategories?: readonly string[];
  onLocateSection?(candidateIds: readonly string[], category?: string): boolean;
  onExit(): void;
}

export function WorkflowScreens({
  exitInToolbar = false,
  wasWritten,
  progressIdFor,
  progressStateFor,
  progress,
  activity,
  fieldStateFor,
  profile,
  optionsFor,
  stage,
  preparationItems,
  warnings,
  revealedPreparationKeys,
  selectedPreparationKeys,
  setRevealedPreparationKeys,
  setSelectedPreparationKeys,
  executePreparation,
  reviewItems,
  partial,
  toggleReviewItem,
  revealSensitiveItem,
  executeWrites,
  results,
  addressResult,
  exceptionTitle,
  unsupportedImageUrl,
  onExit,
  onLocate,
  onLocateSection,
  operatedCategories,
  currentCategory,
}: WorkflowScreensProps) {
  const reviewTabsId = useId();
  const [reviewTab, setReviewTab] = useState<"planned" | "needs-review">(
    "needs-review",
  );
  if (stage === "analyzing" || stage === "writing") {
    return (
      <WorkflowLoading
        progress={progress}
        writing={stage === "writing"}
        currentCategory={currentCategory}
        activity={activity}
      />
    );
  }

  if (stage === "preparation-review") {
    const sensitivePreparations = [
      ...new Map(
        preparationItems.flatMap((item) =>
          item.runnable &&
          item.sensitive &&
          item.plan.command === "SELECT_OPTION_TO_REVEAL"
            ? [[item.plan.profileFieldKey, item] as const]
            : [],
        ),
      ).entries(),
    ];
    const runnableItems = preparationItems.filter((item) => item.runnable);
    const additions = preparationItems.reduce(
      (count, item) => count + (item.requiredAdditions ?? 0),
      0,
    );
    const unavailableCount = preparationItems.length - runnableItems.length;
    return (
      <div className={`${styles.screen} ${resultStyles.results}`}>
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
              : warning === "LLM_UNAVAILABLE"
                ? "준비 항목을 분석하지 못했습니다. 현재 입력칸으로 계속합니다."
                : warning}
          </aside>
        ))}
        {sensitivePreparations.length > 0 && (
          <section
            className={styles.exceptionList}
            aria-label="민감정보 준비 승인"
          >
            <h3>항목별 확인이 필요합니다</h3>
            <p>
              상태 선택은 지원서를 변경합니다. 값을 확인하고 포함한 항목만
              준비하며, 노출되는 상세 항목은 별도로 확인합니다.
            </p>
            {sensitivePreparations.map(([key, item]) => {
              const label = profileFieldLabel(key);
              const revealed = revealedPreparationKeys.has(key);
              const selected = selectedPreparationKeys.has(key);
              return (
                <article
                  className={styles.reviewItem}
                  key={key}
                  data-included={selected}
                >
                  <span className={styles.reviewCopy}>
                    <strong>{label}</strong>
                    <span>
                      입력 예정값: {revealed ? item.profileValue : "••••••••"}
                    </span>
                  </span>
                  {!revealed ? (
                    <button
                      type="button"
                      className={styles.reviewAction}
                      aria-label={`${label} 값 보기`}
                      onClick={() =>
                        setRevealedPreparationKeys(
                          (previous) => new Set([...previous, key]),
                        )
                      }
                    >
                      값 보기
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.reviewAction}
                      aria-label={`${label} ${selected ? "제외하기" : "포함하기"}`}
                      onClick={() =>
                        setSelectedPreparationKeys((previous) => {
                          const next = new Set(previous);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                    >
                      {selected ? "제외하기" : "포함하기"}
                    </button>
                  )}
                </article>
              );
            })}
          </section>
        )}
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
    const isCalendar = (item: ReviewPlanItem) =>
      item.analysis?.writePlan?.command === "SELECT_DATE";
    const selectedCount = reviewItems.filter(
      (item) => item.selected && !item.disabled,
    ).length;
    const exceptionalItems = reviewItemsForDisplay(reviewItems).filter(
      (item) =>
        item.status !== "available" ||
        isCalendar(item) ||
        item.searchValuePlan ||
        !item.selected,
    );
    const plannedItems = reviewItemsForDisplay(reviewItems).filter(
      (item) =>
        item.selected && !item.disabled && !exceptionalItems.includes(item),
    );
    return (
      <div className={styles.screen}>
        <style>{resultCss}</style>
        <Header step="2 / 3" title="자동 기입 확인" />
        <div className={resultStyles.summary}>
          <div
            className={resultStyles.summaryText}
            role="status"
            aria-atomic="true"
          >
            <h3>자동 기입할 항목을 확인해 주세요</h3>
          </div>
        </div>
        <div
          className={resultStyles.counts}
          role="tablist"
          aria-label="자동 기입 확인 구분"
        >
          <button
            type="button"
            role="tab"
            data-state="completed"
            id={`${reviewTabsId}-planned-tab`}
            aria-controls={`${reviewTabsId}-planned-panel`}
            aria-selected={reviewTab === "planned"}
            onClick={() => setReviewTab("planned")}
          >
            자동 기입 예정 <strong>{selectedCount}</strong>
          </button>
          <button
            type="button"
            role="tab"
            data-state="pending"
            id={`${reviewTabsId}-needs-review-tab`}
            aria-controls={`${reviewTabsId}-needs-review-panel`}
            aria-selected={reviewTab === "needs-review"}
            onClick={() => setReviewTab("needs-review")}
          >
            확인 필요 <strong>{exceptionalItems.length}</strong>
          </button>
        </div>
        <section
          role="tabpanel"
          id={`${reviewTabsId}-planned-panel`}
          aria-labelledby={`${reviewTabsId}-planned-tab`}
          hidden={reviewTab !== "planned"}
          className={resultStyles.review}
        >
          {plannedItems.length > 0 ? (
            plannedItems.map((item) => (
              <article className={resultStyles.row} key={item.candidateId}>
                <div className={resultStyles.heading} data-has-values="true">
                  <button
                    type="button"
                    className={resultStyles.locate}
                    aria-label={`${resultFieldLabel(item)} 필드로 이동`}
                    disabled={!onLocate}
                    onClick={() => onLocate?.(item.candidateId)}
                  >
                    <span>{resultFieldLabel(item)}</span>
                    {onLocate && <span aria-hidden="true">↗</span>}
                  </button>
                  <div className={resultStyles.valueGroup}>
                    <span className={resultStyles.previewValue}>
                      {item.previewValue}
                    </span>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className={resultStyles.empty}>자동 기입 예정 항목이 없어요.</p>
          )}
        </section>
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
              : warning === "검색 후 드러난 급수 항목은 직접 확인해 주세요."
                ? warning
                : "LLM 분석 일부 미완료"}
          </aside>
        ))}
        {reviewTab === "needs-review" && exceptionalItems.length > 0 && (
          <p className={resultStyles.guidance}>
            자동 기입에서 제외할 항목이 있는지 확인해 주세요.
          </p>
        )}
        {reviewTab === "needs-review" && exceptionalItems.length > 0 && (
          <section
            role="tabpanel"
            id={`${reviewTabsId}-needs-review-panel`}
            aria-labelledby={`${reviewTabsId}-needs-review-tab`}
            className={resultStyles.review}
            aria-label="확인 필요한 항목"
          >
            {exceptionalItems.map((item) => {
              const profileFieldKey = reviewProfileFieldKey(item);
              const sensitiveProfileCaption =
                item.status === "sensitive" && profileFieldKey
                  ? {
                      id: `sensitive-profile-${item.candidateId}`,
                      label: profileFieldLabel(profileFieldKey),
                    }
                  : undefined;
              return (
                <article className={resultStyles.row} key={item.candidateId}>
                  <div className={resultStyles.heading} data-has-values="true">
                    <button
                      type="button"
                      className={resultStyles.locate}
                      aria-label={`${resultFieldLabel(item)} 필드로 이동`}
                      disabled={!onLocate}
                      onClick={() => onLocate?.(item.candidateId)}
                    >
                      <span>{resultFieldLabel(item)}</span>
                      {onLocate && <span aria-hidden="true">↗</span>}
                    </button>
                    <div className={resultStyles.valueGroup}>
                      <span className={resultStyles.previewValue}>
                        {item.previewValue}
                      </span>
                      {(item.status !== "available" ||
                        isCalendar(item) ||
                        !item.selected) &&
                        !item.disabled &&
                        (item.status !== "sensitive" || item.revealed) && (
                          <button
                            className={resultStyles.copyButton}
                            type="button"
                            aria-label={`${item.fieldLabel} ${item.selected ? "제외하기" : "포함하기"}`}
                            aria-describedby={sensitiveProfileCaption?.id}
                            onClick={() => toggleReviewItem(item.candidateId)}
                          >
                            {item.selected ? "제외" : "포함"}
                          </button>
                        )}
                    </div>
                  </div>
                  {item.reason !== DEFAULT_CONDITIONAL_REVIEW_REASON && (
                    <p className={resultStyles.guidance}>{item.reason}</p>
                  )}
                  {item.status !== "needs-review" && (
                    <small className={resultStyles.writtenTag}>
                      {statusLabel(item)}
                    </small>
                  )}
                  {item.status === "sensitive" && !item.revealed && (
                    <button
                      className={styles.reviewAction}
                      type="button"
                      aria-label={`${item.fieldLabel} 값 보기`}
                      aria-describedby={sensitiveProfileCaption?.id}
                      onClick={() => revealSensitiveItem(item.candidateId)}
                    >
                      값 보기
                    </button>
                  )}
                </article>
              );
            })}
          </section>
        )}
        <button
          className={styles.primary}
          type="button"
          onClick={() => void executeWrites()}
        >
          {selectedCount > 0
            ? `${selectedCount}개 항목 기입하기`
            : "선택하지 않고 계속"}
        </button>
      </div>
    );
  }

  if (stage === "result") {
    return (
      <div className={`${styles.screen} ${styles.resultScreen}`}>
        <h2 className={styles.resultTitle}>기입 결과</h2>
        {addressResult && addressResult.status !== "written" && (
          <details className={styles.addressResult}>
            <summary>주소 확인 필요</summary>
            <p>주소 직접 확인 필요: {addressResult.reason}</p>
          </details>
        )}
        <WorkflowResults
          wasWritten={wasWritten}
          progressIdFor={progressIdFor}
          progressStateFor={progressStateFor}
          progress={progress}
          fieldStateFor={fieldStateFor}
          profile={profile}
          optionsFor={optionsFor}
          results={results}
          reviewItems={reviewItems}
          onLocate={onLocate}
          onLocateSection={onLocateSection}
          operatedCategories={operatedCategories}
        />
        {!exitInToolbar && (
          <button className={styles.primary} type="button" onClick={onExit}>
            수동 복사로 돌아가기
          </button>
        )}
      </div>
    );
  }

  if (stage === "unsupported") {
    return (
      <div className={`${styles.screen} ${styles.unsupportedScreen}`}>
        {unsupportedImageUrl && (
          <img
            className={styles.unsupportedImage}
            src={unsupportedImageUrl}
            alt="안전모를 쓰고 X 표시를 든 카피바라"
          />
        )}
        <h2 className={styles.unsupportedTitle}>아직 지원하지 않아요</h2>
        <p className={styles.lead}>
          이 지원서 페이지는 아직 자동 기입을 지원하지 않아요. 수동 복사는 계속
          사용할 수 있어요.
        </p>
        {!exitInToolbar && (
          <button className={styles.primary} type="button" onClick={onExit}>
            수동 복사로 돌아가기
          </button>
        )}
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
      {!exitInToolbar && (
        <button className={styles.primary} type="button" onClick={onExit}>
          수동 복사로 돌아가기
        </button>
      )}
    </div>
  );
}
