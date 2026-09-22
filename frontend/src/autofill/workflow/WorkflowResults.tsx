import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import { useState } from "react";
import {
  isSkippedByApproval,
  userFacingReason,
  profileFieldLabel,
  reviewProfileFieldKey,
} from "./workflow-model";
import styles from "./WorkflowResults.module.css";
import type { Profile } from "../../profile/model";
import { resultPreview } from "./result-preview";
export interface WorkflowResultsProps {
  reviewItems: readonly ReviewPlanItem[];
  results: readonly ApprovedWriteResult[];
  profile?: Profile;
  optionsFor?(candidateId: string): readonly string[];
  onLocate?(candidateId: string): boolean;
}
export function WorkflowResults({
  reviewItems,
  results,
  profile,
  optionsFor,
  onLocate,
}: WorkflowResultsProps) {
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const byId = new Map(results.map((result) => [result.candidateId, result]));
  const failures = results.filter(
    (result) => result.status === "skipped" && !isSkippedByApproval(result),
  );
  const pending = reviewItems.filter((item) => {
    const result = byId.get(item.candidateId);
    return !result || isSkippedByApproval(result);
  });
  const completed = results.filter((result) => result.status === "written");
  const rows = [
    ...pending.map((item) => ({
      id: item.candidateId,
      item,
      reason: item.reason,
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
      <div className={styles.counts}>
        {[
          ["입력 완료", completed.length],
          ["확인 필요", pending.length],
          ["입력 실패", failures.length],
        ].map(([label, count]) => (
          <span key={label} aria-label={`${label} ${count}개`}>
            {label} <strong>{count}</strong>
          </span>
        ))}
      </div>
      {rows.length > 0 && (
        <section aria-label="확인 필요한 항목">
          <h3>확인 필요</h3>
          {rows.map(({ id, item, reason }) => (
            <article className={styles.row} key={id}>
              <div className={styles.heading}>
                <strong>
                  {item
                    ? (reviewProfileFieldKey(item)
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
                      setUnavailable((previous) => new Set([...previous, id]));
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
          ))}
        </section>
      )}
      {completed.length > 0 && (
        <details>
          <summary>입력 완료 {completed.length}개</summary>
          {completed.map((result) => (
            <p key={result.candidateId}>
              {reviewItems.find(
                (item) => item.candidateId === result.candidateId,
              )?.fieldLabel ?? "입력 필드"}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
