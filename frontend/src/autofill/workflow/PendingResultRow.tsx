import { useState } from "react";
import type { Profile } from "../../profile/model";
import type { ResultModel } from "./result-model";
import { savedResultValues } from "./result-preview";
import { resultGuidance } from "./result-guidance";
import { pendingResultPresentation } from "./pending-result-presentation";
import styles from "./WorkflowResults.module.css";

export function PendingResultRow({
  entry,
  profile,
  options = [],
  onLocate,
  copyText,
}: {
  entry: ResultModel["pending"][number];
  profile?: Profile;
  options?: readonly string[];
  onLocate?(id: string): boolean;
  copyText(value: string): Promise<void>;
}) {
  const { id, item, reason, written, failureCode } = entry;
  const { label, shortLabel, sensitive } = pendingResultPresentation(item);
  const [unavailable, setUnavailable] = useState(false);
  const [copied, setCopied] = useState<number>();
  const [copyFailed, setCopyFailed] = useState(false);
  const values = item ? savedResultValues(item, profile) : [];
  const canLocate = !!onLocate && !unavailable && !id.startsWith("progress:");
  async function copy(value: string, index: number) {
    setCopyFailed(false);
    setCopied(undefined);
    try {
      await copyText(value);
      setCopied(index);
    } catch {
      setCopyFailed(true);
    }
  }
  return (
    <article className={styles.row}>
      <div className={styles.heading} data-has-values={values.length > 0}>
        <div className={styles.fieldTitle}>
          <button
            type="button"
            className={styles.locate}
            title="필드로 이동"
            disabled={!canLocate}
            aria-label={`${label} 필드로 이동`}
            onClick={() => {
              if (!onLocate?.(id)) setUnavailable(true);
            }}
          >
            <span>{shortLabel}</span>
            {canLocate && <span aria-hidden="true">↗</span>}
          </button>
          {written && <span className={styles.writtenTag}>입력됨</span>}
        </div>
        {values.length > 0 && (
          <div className={styles.values}>
            {values.map(({ value, sensitive: valueSensitive }, index) => {
              const masked = (sensitive || valueSensitive) && !item?.revealed;
              return (
                <div className={styles.valueGroup} key={index}>
                  <span
                    className={styles.previewValue}
                    title={masked ? undefined : value}
                  >
                    {masked ? "값 가림" : value}
                  </span>
                  <button
                    type="button"
                    className={styles.copyButton}
                    disabled={masked}
                    aria-label={`${label}${values.length > 1 ? ` 값 ${index + 1}` : ""} 복사`}
                    onClick={() => void copy(value, index)}
                  >
                    {copied === index ? "복사됨" : "복사"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className={styles.guidance}>{resultGuidance(reason, failureCode)}</p>
      {options.length > 0 && (
        <details>
          <summary>지원서 선택지</summary>
          {options.map((option, index) => (
            <p key={index}>{option}</p>
          ))}
        </details>
      )}
      {copied !== undefined && (
        <span className={styles.visuallyHidden} role="status">
          {label} 복사 완료
        </span>
      )}
      {copyFailed && (
        <small role="alert">복사하지 못했어요. 다시 시도해 주세요.</small>
      )}
      {unavailable && <small role="status">이동 불가</small>}
    </article>
  );
}
