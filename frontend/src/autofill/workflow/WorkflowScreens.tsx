import type { Dispatch, SetStateAction } from "react";
import type { AddressResult } from "../address/types";
import type { WorkflowAdapter, WorkflowDiagnostic } from "../adapters/workflow";
import {
  reviewItemsForDisplay,
  type ReviewPlanItem,
} from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import styles from "../../autofill-demo/AutofillDemo.module.css";
import {
  Header,
  diagnosticLabel,
  isSkippedByApproval,
  mappingLabel,
  profileFieldLabel,
  reviewProfileFieldKey,
  resultStatusLabel,
  statusLabel,
  interactionLabel,
  currentPreview,
  userFacingReason,
  type PreparationItem,
  type Stage,
} from "./workflow-model";

interface WorkflowScreensProps {
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
  onExit(): void;
}

export function WorkflowScreens({
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
  adapter,
  workflowDiagnostics,
  exceptionTitle,
  onExit,
}: WorkflowScreensProps) {
  if (stage === "analyzing") {
    return null;
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
                <article
                  className={styles.reviewItem}
                  data-included={item.selected}
                  data-status={item.status}
                  key={item.candidateId}
                >
                  <span className={styles.reviewCopy}>
                    <strong>{item.fieldLabel}</strong>
                    {sensitiveProfileCaption && (
                      <small id={sensitiveProfileCaption.id}>
                        프로필 항목: {sensitiveProfileCaption.label}
                      </small>
                    )}
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
                      aria-describedby={sensitiveProfileCaption?.id}
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
                        aria-describedby={sensitiveProfileCaption?.id}
                        onClick={() => toggleReviewItem(item.candidateId)}
                      >
                        {item.selected ? "제외하기" : "포함하기"}
                      </button>
                    )}
                </article>
              );
            })}
          </section>
        )}
        <p className={styles.safety}>
          지원서 저장·이동·제출은 실행하지 않습니다.
        </p>
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
                    <strong>
                      {profileFieldLabel(
                        item ? reviewProfileFieldKey(item) : undefined,
                      )}
                    </strong>
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
