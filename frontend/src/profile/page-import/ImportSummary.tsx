import type { ReviewRow } from "./review-model";
import styles from "./ImportReview.module.css";

interface Props {
  rows: readonly ReviewRow[];
  chosen: Readonly<Record<string, boolean>>;
}

/** What one save would write: new values, overwrites and values already equal. */
export function ImportSummary({ rows, chosen }: Props) {
  const saving = rows.filter((row) => chosen[row.key]);
  const added = saving.filter((row) => row.status === "new").length;
  const changed = saving.filter((row) => row.status === "changed").length;
  const same = rows.filter((row) => row.status === "same").length;
  const legend = [
    { label: "새로 추가", count: added, tone: styles.toneNew },
    { label: "기존 값 변경", count: changed, tone: styles.toneChanged },
    { label: "이미 같음", count: same, tone: styles.toneSame },
  ];
  return (
    <section className={styles.summary} aria-label="가져오기 요약">
      <p className={styles.summaryLabel}>프로필에 가져올 정보</p>
      <p className={styles.summaryCount}>
        <span data-testid="import-count">{saving.length}</span>
        <small>개</small>
      </p>
      <div className={styles.bar} aria-hidden="true">
        {legend.map(({ label, count, tone }) => (
          <span key={label} className={tone} style={{ flexGrow: count }} />
        ))}
      </div>
      <ul className={styles.legend}>
        {legend.map(({ label, count, tone }) => (
          <li key={label}>
            <i className={tone} aria-hidden="true" />
            <span>{label}</span>
            <b>{count}</b>
          </li>
        ))}
      </ul>
      <p className={styles.summaryHint}>
        비어 있던 칸을 채우는 값은 미리 골라 두었어요. 기존 값을 바꾸는 값과
        민감 정보는 직접 켜야 저장돼요.
      </p>
    </section>
  );
}
