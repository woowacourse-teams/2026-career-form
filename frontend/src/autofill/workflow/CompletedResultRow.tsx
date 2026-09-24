import { useId, useState } from "react";
import type { ReviewPlanItem } from "../review/review-plan";
import type { WriteProgress } from "./progress-model";
import { pendingResultPresentation } from "./pending-result-presentation";
import styles from "./WorkflowResults.module.css";

export function CompletedResultRow({
  entry,
  item,
  live,
  onLocate,
}: {
  entry: WriteProgress;
  item?: ReviewPlanItem;
  live?: { visible: boolean; value: string };
  onLocate?(id: string): boolean;
}) {
  const valueId = useId();
  const [unavailable, setUnavailable] = useState(false);
  const label = entry.label.replaceAll("·", "/");
  const masked =
    !!item && pendingResultPresentation(item).sensitive && !item.revealed;
  // A saved profile value is not evidence of what is currently on the form.
  const value = item && live?.visible && live.value ? live.value : undefined;
  const content = (
    <>
      <span className={styles.completedLabel}>{label}</span>
      <span
        id={valueId}
        className={styles.completedValue}
        title={masked ? undefined : value}
      >
        {masked ? "값 가림" : (value ?? "지원서에서 확인")}
      </span>
      {entry.candidateId && onLocate && !unavailable && (
        <span className={styles.completedArrow} aria-hidden="true">
          ↗
        </span>
      )}
    </>
  );
  return (
    <li>
      {entry.candidateId && onLocate ? (
        <button
          type="button"
          className={styles.completedRow}
          aria-label={`${label} 입력값 확인`}
          aria-describedby={valueId}
          disabled={unavailable}
          onClick={() => {
            if (!onLocate(entry.candidateId!)) setUnavailable(true);
          }}
        >
          {content}
        </button>
      ) : (
        <div className={styles.completedRow}>{content}</div>
      )}
      {unavailable && (
        <p className={styles.completedUnavailable} role="status">
          지원서에서 직접 확인해 주세요.
        </p>
      )}
    </li>
  );
}
