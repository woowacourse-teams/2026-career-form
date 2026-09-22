import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/executor";
import { Fragment, useState } from "react";
import {
  isSkippedByApproval,
  userFacingReason,
  profileFieldLabel,
  reviewProfileFieldKey,
} from "./workflow-model";
import styles from "./WorkflowResults.module.css";
import type { Profile } from "../../profile/model";
import { resultPreview, savedResultValues } from "./result-preview";
export interface WorkflowResultsProps {
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
  reviewItems,
  results,
  profile,
  fieldStateFor,
  optionsFor,
  onLocate,
}: WorkflowResultsProps) {
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
    if (result?.status === "written") return item.status === "needs-review";
    const current = (live?.value ?? item.currentValue).trim();
    if (saved.length === 1 && current && current === saved[0].value.trim())
      return false;
    return !result || isSkippedByApproval(result);
  });
  const completed = results.filter((result) => result.status === "written");
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
        byId.get(item.candidateId)?.status === "written"
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
      {rows.length === 0 && (
        <p className={styles.empty}>확인할 항목이 없어요.</p>
      )}
      {rows.length > 0 && (
        <section aria-label="확인 필요한 항목">
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
