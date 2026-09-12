import styles from "./WorkflowLoading.module.css";

export function WorkflowLoading({ writing }: { writing: boolean }) {
  return (
    <div className={styles.container}>
      <section className={styles.region} aria-busy="true">
        <span className={styles.spinner} aria-hidden="true" />
      </section>
      <p className={styles.status} role="status" aria-live="polite">
        {writing ? "지원서에 입력하고 있어요" : "지원서를 분석하고 있어요"}
      </p>
    </div>
  );
}
