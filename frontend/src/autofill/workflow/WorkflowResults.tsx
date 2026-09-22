import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import { Fragment, useRef, useState } from "react";
import {
  isSkippedByApproval,
  userFacingReason,
  profileFieldLabel,
  reviewProfileFieldKey,
} from "./workflow-model";
import styles from "./WorkflowResults.module.css";
import type { Profile } from "../../profile/model";
import { resultPreview, savedResultValues } from "./result-preview";
import { progressCategory, type WriteProgress } from "./progress-model";

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
  reviewItems,
  results,
  profile,
  fieldStateFor,
  optionsFor,
  onLocate,
}: WorkflowResultsProps) {
  const reviewRegion = useRef<HTMLElement>(null);
  const completedDetails = useRef<HTMLDetailsElement>(null);
  const completedSummary = useRef<HTMLElement>(null);
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const byId = new Map(results.map((result) => [result.candidateId, result]));
  const failures = results.filter((result) => {
    if (result.status !== "skipped" || isSkippedByApproval(result))
      return false;
    const item = reviewItems.find(
      (item) => item.candidateId === result.candidateId,
    );
    return (
      !item ||
      (savedResultValues(item, profile).length > 0 &&
        fieldStateFor?.(item.candidateId)?.visible !== false)
    );
  });
  const pending = reviewItems.filter((item) => {
    const result = byId.get(item.candidateId);
    const saved = savedResultValues(item, profile);
    const live = fieldStateFor?.(item.candidateId);
    if (!saved.length || live?.visible === false) return false;
    const written = result?.status === "written";
    const recordedWrite = wasWritten?.(item.candidateId) !== false;
    if (written && recordedWrite) return item.status === "needs-review";
    const current = (live?.value ?? item.currentValue).trim();
    if (saved.length === 1 && current && current === saved[0].value.trim())
      return false;
    return (
      !result || isSkippedByApproval(result) || (written && !recordedWrite)
    );
  });
  const completed = (
    progress ??
    results.map((result) => {
      const item = reviewItems.find(
        (item) => item.candidateId === result.candidateId,
      );
      return {
        id: result.candidateId,
        label: item?.fieldLabel ?? "입력 필드",
        category: item ? progressCategory(item) : "기타 정보",
        status: result.status,
      };
    })
  ).filter((entry) => entry.status === "written");
  const categories = new Map<string, typeof completed>();
  for (const entry of completed) {
    categories.set(entry.category, [
      ...(categories.get(entry.category) ?? []),
      entry,
    ]);
  }
  const excluded = reviewItems.filter((item) => {
    const result = byId.get(item.candidateId);
    return (
      !pending.includes(item) &&
      result?.status !== "written" &&
      !failures.some((failure) => failure.candidateId === item.candidateId)
    );
  });
  const rows = [
    ...pending.map((item) => ({
      id: item.candidateId,
      item,
      reason:
        byId.get(item.candidateId)?.status === "written" &&
        wasWritten?.(item.candidateId) !== false
          ? "입력한 값과 지원서 조건을 확인해 주세요."
          : item.reason,
    })),
    ...failures.map((result) => ({
      id: result.candidateId,
      item: reviewItems.find((item) => item.candidateId === result.candidateId),
      reason:
        result.status === "skipped"
          ? userFacingReason(result.reason)
          : undefined,
    })),
  ];
  return (
    <section className={styles.results}>
      <div className={styles.summary}>
        <div aria-label={`입력 완료 ${completed.length}개`}>
          <h3>
            {completed.length > 0
              ? `${completed.length}개 항목을 입력했어요`
              : "입력한 항목이 없어요"}
          </h3>
        </div>
        {rows.length > 0 ? (
          <div className={styles.counts}>
            {pending.length > 0 && (
              <span aria-label={`확인 필요 ${pending.length}개`}>
                확인 필요 <strong>{pending.length}개</strong>
              </span>
            )}
            {failures.length > 0 && (
              <span aria-label={`입력 실패 ${failures.length}개`}>
                입력 실패 <strong>{failures.length}개</strong>
              </span>
            )}
          </div>
        ) : (
          <p className={styles.empty}>확인할 항목이 없어요.</p>
        )}
        {(rows.length > 0 || completed.length > 0) && (
          <button
            className={styles.primary}
            type="button"
            onClick={() => {
              if (rows.length > 0) {
                focusInPanel(reviewRegion.current);
              } else if (completedDetails.current) {
                completedDetails.current.open = true;
                focusInPanel(completedSummary.current);
              }
            }}
          >
            {rows.length > 0 ? "확인할 항목 보기" : "입력한 항목 보기"}
            <span aria-hidden="true">↓</span>
          </button>
        )}
      </div>
      {rows.length > 0 && (
        <section
          ref={reviewRegion}
          tabIndex={-1}
          className={styles.review}
          aria-label="확인 필요한 항목"
        >
          {rows.map(({ id, item, reason }, index) => (
            <Fragment key={id}>
              {(index === 0 || index === pending.length) && (
                <h3>{index < pending.length ? "확인 필요" : "입력 실패"}</h3>
              )}
              <article className={styles.row}>
                <div className={styles.heading}>
                  <strong>
                    {item
                      ? (item.status === "sensitive" &&
                        reviewProfileFieldKey(item)
                          ? profileFieldLabel(reviewProfileFieldKey(item))
                          : item.fieldLabel
                        ).replaceAll("·", "/")
                      : "프로필 정보"}
                  </strong>
                  <button
                    type="button"
                    disabled={!onLocate || unavailable.has(id)}
                    aria-label={`${item?.fieldLabel ?? "입력 필드"} 필드로 이동`}
                    onClick={() => {
                      if (!onLocate?.(id))
                        setUnavailable(
                          (previous) => new Set([...previous, id]),
                        );
                    }}
                  >
                    필드로 이동
                  </button>
                </div>
                {item &&
                  resultPreview(item, profile).map((value, index) => (
                    <p key={index}>{value}</p>
                  ))}
                {reason && <small>{reason.replaceAll("·", "/")}</small>}
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
            </Fragment>
          ))}
        </section>
      )}
      {completed.length > 0 && (
        <section className={styles.completed} aria-label="입력 완료 내역">
          <ul className={styles.categories} aria-label="범주별 입력 결과">
            {[...categories].map(([category, entries]) => (
              <li key={category}>
                <span>
                  <span className={styles.check} aria-hidden="true">
                    ✓
                  </span>
                  {category.replaceAll("·", "/")}
                </span>
                <strong>{entries.length}개 입력</strong>
              </li>
            ))}
          </ul>
          <details ref={completedDetails}>
            <summary ref={completedSummary}>
              입력 완료 {completed.length}개
            </summary>
            {[...categories].map(([category, entries]) => (
              <div className={styles.completedGroup} key={category}>
                <h4>{category.replaceAll("·", "/")}</h4>
                <ul>
                  {entries.map((entry) => (
                    <li key={entry.id}>{entry.label.replaceAll("·", "/")}</li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        </section>
      )}
      {excluded.length > 0 && (
        <details>
          <summary>입력 대상에서 제외 {excluded.length}개</summary>
          {excluded.map((item) => (
            <p key={item.candidateId}>
              <strong>{item.fieldLabel}</strong>
              <br />
              <small>{item.reason}</small>
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
