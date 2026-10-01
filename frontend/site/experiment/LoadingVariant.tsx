import writingMascot from "./capybara-writing.png";
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
  const percentage = Math.round((completed / scenarioFields.length) * 100);
  const value =
    variant === "A"
      ? completed
      : variant === "B"
        ? percentage
        : Math.max(0, scenarioFields.length - completed);
  const label =
    variant === "A" ? "완료한 작업" : variant === "B" ? "진행률" : "남은 작업";
  return (
    <section
      className={styles.body}
      data-reduced-motion={reducedMotion}
      aria-label="자동 기입 작업 영역"
      aria-busy={completed < scenarioFields.length}
    >
      <img
        className={styles.document}
        src={writingMascot}
        alt="지원서를 쓰는 카피바라"
      />
      <p className={styles.caption} role="status">
        지원서를 채우고 있어요
      </p>
      <div className={styles.metric}>
        <p
          className={styles.total}
          aria-hidden={variant === "B"}
          style={variant === "B" ? { visibility: "hidden" } : undefined}
        >
          전체 {scenarioFields.length}개 항목
        </p>
        <p className={styles.label}>{label}</p>
        <strong className={styles.value}>
          {value}
          <small>{variant === "B" ? "%" : "개"}</small>
        </strong>
        <div className={styles.indicatorSlot}>
          {variant === "B" && (
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
          )}
        </div>
      </div>
    </section>
  );
}
