import { WorkflowLoading } from "../../src/autofill/workflow/WorkflowLoading";
import logo from "../../public/side-panel-launcher-logo.png";
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
  if (variant === "A")
    return (
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
    );
  const percentage = Math.round((completed / scenarioFields.length) * 100);
  return (
    <section
      className={styles.body}
      data-reduced-motion={reducedMotion}
      aria-label="자동 기입 작업 영역"
      aria-busy="true"
    >
      {variant === "B" ? (
        <>
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
      ) : variant === "C" ? (
        <>
          <div className={styles.character} aria-hidden="true">
            <img src={logo} alt="" />
            <span className={styles.paper} />
            <span className={styles.keyboard}>▤</span>
          </div>
          <p role="status">지원서를 채우고 있어요</p>
        </>
      ) : (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          <p role="status">입력 중이에요</p>
        </>
      )}
    </section>
  );
}
