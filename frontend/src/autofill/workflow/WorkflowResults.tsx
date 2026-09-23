import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import { useRef, useState } from "react";
import styles from "./WorkflowResults.module.css";
import resultCss from "./WorkflowResults.module.css?inline";
import type { Profile } from "../../profile/model";
import { resultPreview } from "./result-preview";
import type { WriteProgress } from "./progress-model";
import { buildResultModel } from "./result-model";
import { resultFieldLabel } from "./result-label";
import { resultGuidance } from "./result-guidance";

function focusInPanel(target: HTMLElement | null) {
  if (!target) return;
  target.focus({ preventScroll: true });
  const document = target.ownerDocument;
  for (
    let parent = target.parentElement;
    parent && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    if (!/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY)) continue;
    parent.scrollTop +=
      target.getBoundingClientRect().top - parent.getBoundingClientRect().top;
    break;
  }
}

export interface WorkflowResultsProps {
  progress?: readonly WriteProgress[];
  wasWritten?(candidateId: string): boolean;
  progressIdFor?(candidateId: string): string | undefined;
  progressStateFor?(progressId: string): boolean;
  reviewItems: readonly ReviewPlanItem[];
  results: readonly ApprovedWriteResult[];
  profile?: Profile;
  fieldStateFor?(
    candidateId: string,
  ): { visible: boolean; value: string } | undefined;
  optionsFor?(candidateId: string): readonly string[];
  onLocate?(candidateId: string): boolean;
}
export function WorkflowResults({
  progress,
  wasWritten,
  progressIdFor,
  progressStateFor,
  reviewItems,
  results,
  profile,
  fieldStateFor,
  optionsFor,
  onLocate,
}: WorkflowResultsProps) {
  const completedDetails = useRef<HTMLDetailsElement>(null);
  const completedSummary = useRef<HTMLElement>(null);
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const { completed, pending } = buildResultModel({
    reviewItems,
    results,
    progress,
    profile,
    wasWritten,
    progressIdFor,
    progressStateFor,
    fieldStateFor,
  });
  const categories = new Map<string, typeof completed>();
  for (const entry of completed) {
    categories.set(entry.category, [
      ...(categories.get(entry.category) ?? []),
      entry,
    ]);
  }
  return (
    <section className={styles.results}>
      {/* Keep scoped selectors with their markup when entry CSS is fetched later. */}
      <style>{resultCss}</style>
      <div className={styles.summary}>
        <div className={styles.summaryText} role="status" aria-atomic="true">
          <h3>자동 기입을 마쳤어요</h3>
          <div className={styles.counts}>
            <span
              data-state="completed"
              aria-label={`입력 완료 ${completed.length}개`}
            >
              입력 완료 <strong>{completed.length}개</strong>
            </span>
            {pending.length > 0 && (
              <span aria-label={`확인 필요 ${pending.length}개`}>
                확인 필요 <strong>{pending.length}개</strong>
              </span>
            )}
          </div>
          {pending.length === 0 && (
            <p className={styles.empty}>확인할 항목이 없어요.</p>
          )}
        </div>
        {pending.length === 0 && completed.length > 0 && (
          <button
            className={styles.primary}
            type="button"
            onClick={() => {
              if (completedDetails.current) {
                completedDetails.current.open = true;
                focusInPanel(completedSummary.current);
              }
            }}
          >
            입력한 항목 보기
            <span aria-hidden="true">↓</span>
          </button>
        )}
      </div>
      {pending.length > 0 && (
        <section className={styles.review} aria-label="확인 필요한 항목">
          <h3 className={styles.reviewTitle}>
            확인 필요 <span aria-hidden="true">{pending.length}</span>
          </h3>
          <p className={styles.reviewHint}>
            항목별 프로필 값과 확인 이유를 살펴보세요.
          </p>
          <div className={styles.reviewList}>
            {pending.map(({ id, item, reason, written, failureCode }) => (
              <article key={id} className={styles.row}>
                <div className={styles.heading}>
                  <div className={styles.fieldTitle}>
                    <strong>
                      {item ? resultFieldLabel(item) : "프로필 정보"}
                    </strong>
                    {written && (
                      <span className={styles.writtenTag}>입력됨</span>
                    )}
                  </div>
                  <span className={styles.connector} aria-hidden="true">
                    :
                  </span>
                  <div className={styles.values}>
                    {item &&
                      resultPreview(item, profile).map((value, index) => (
                        <p key={index}>{value}</p>
                      ))}
                  </div>
                  <button
                    type="button"
                    title="필드로 이동"
                    disabled={
                      !onLocate ||
                      unavailable.has(id) ||
                      id.startsWith("progress:")
                    }
                    aria-label={`${item ? resultFieldLabel(item) : "입력 필드"} 필드로 이동`}
                    onClick={() => {
                      if (!onLocate?.(id))
                        setUnavailable(
                          (previous) => new Set([...previous, id]),
                        );
                    }}
                  >
                    <span aria-hidden="true">↗</span>
                  </button>
                </div>
                <small className={styles.guidance}>
                  {resultGuidance(reason, failureCode)}
                </small>
                {!!optionsFor?.(id).length && (
                  <details>
                    <summary>지원서 선택지</summary>
                    {optionsFor(id).map((label, index) => (
                      <p key={index}>{label}</p>
                    ))}
                  </details>
                )}
                {unavailable.has(id) && <small role="status">이동 불가</small>}
              </article>
            ))}
          </div>
        </section>
      )}
      {completed.length > 0 && (
        <section className={styles.completed} aria-label="입력 완료 내역">
          <details ref={completedDetails}>
            <summary ref={completedSummary}>
              <span className={styles.completionLabel}>
                <span className={styles.check} aria-hidden="true">
                  ✓
                </span>
                <span>입력 완료 {completed.length}개</span>
              </span>
              <span className={styles.chevron} aria-hidden="true">
                ⌄
              </span>
            </summary>
            <ul className={styles.categories} aria-label="범주별 입력 결과">
              {[...categories].map(([category, entries]) => (
                <li key={category}>
                  <div className={styles.categoryHeading}>
                    <h4>{category.replaceAll("·", "/")}</h4>
                    <strong>{entries.length}개 입력</strong>
                  </div>
                  <ul className={styles.completedFields}>
                    {entries.map((entry) => (
                      <li key={entry.id}>{entry.label.replaceAll("·", "/")}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </section>
  );
}
