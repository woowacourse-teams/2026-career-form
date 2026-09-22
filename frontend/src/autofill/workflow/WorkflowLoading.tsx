import styles from "./WorkflowLoading.module.css";

export function WorkflowLoading({
  writing,
  currentField,
}: {
  writing: boolean;
  currentField?: string;
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
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.status} aria-hidden="true">
          {message}
        </p>
        {writing && currentField && (
          <p className={styles.status}>{currentField}</p>
        )}
      </section>
    </>
  );
}
