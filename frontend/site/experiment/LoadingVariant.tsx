import writingMascot from "./capybara-writing.png";
import { WorkflowLoading } from "../../src/autofill/workflow/WorkflowLoading";
import { scenarioFields } from "./scenario";
import type { Variant } from "./study";
import styles from "./LoadingVariant.module.css";
export function LoadingVariant({
  variant,
  completed,
  reducedMotion,
}: {
  variant: Variant;
  completed: number;
  reducedMotion: boolean;
}) {
  const icon = (
    <img
      className={styles.document}
      src={writingMascot}
      alt="지원서를 쓰는 카피바라"
    />
  );
  if (variant === "A")
    return (
      <div className={styles.history} data-reduced-motion={reducedMotion}>
        <div className={styles.historyBrand}>{icon}</div>
        <WorkflowLoading
          writing
          currentCategory={
            scenarioFields[Math.min(completed, scenarioFields.length - 1)]!
              .category
          }
          progress={scenarioFields
            .slice(0, completed)
            .map((field) => ({ ...field, status: "written" as const }))}
        />
      </div>
    );
  const percentage = Math.round((completed / scenarioFields.length) * 100);
  return (
    <section
      className={`${styles.body} ${variant === "B" ? styles.progressBody : styles.minimalBody}`}
      data-reduced-motion={reducedMotion}
      aria-label="자동 기입 작업 영역"
      aria-busy="true"
    >
      {icon}
      {variant === "B" ? (
        <>
          <p className={styles.caption}>지원서를 채우고 있어요</p>
          <p className={styles.percentage} role="status">
            {percentage}%
          </p>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="입력 완료 비율"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
          >
            <span style={{ width: `${percentage}%` }} />
          </div>
        </>
      ) : (
        <div className={styles.minimalStatus}>
          <span className={styles.spinner} aria-hidden="true" />
          <p role="status">입력 중이에요</p>
        </div>
      )}
    </section>
  );
}
