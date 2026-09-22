import styles from "./WorkflowLoading.module.css";
export interface WriteProgress {
  id: string;
  label: string;
  status: "written" | "skipped";
}

export function WorkflowLoading({
  writing,
  currentField,
  progress = [],
}: {
  writing: boolean;
  currentField?: string;
  progress?: readonly WriteProgress[];
}) {
  const message = writing
    ? "지원서에 입력하고 있어요"
    : "지원서를 분석하고 있어요";
  return (
    <>
      <p className={styles.announcement} role="status" aria-live="polite">
        {message}
      </p>
      <section
        className={styles.container}
        aria-label="자동 기입 작업 영역"
        aria-busy="true"
      >
        {!writing && <span className={styles.spinner} aria-hidden="true" />}
        <p className={styles.status} aria-hidden="true">
          {message}
        </p>
        {writing && currentField && (
          <p className={styles.status}>{currentField} 입력 중</p>
        )}
        {progress.length > 0 && (
          <ol
            className={styles.progress}
            aria-label="최근 입력 결과"
            aria-live="polite"
          >
            {progress.map((entry) => (
              <li key={entry.id} data-status={entry.status}>
                <span aria-hidden="true">
                  {entry.status === "written" ? "✓" : "!"}
                </span>
                {entry.label}{" "}
                {entry.status === "written" ? "입력 완료" : "확인 필요"}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
