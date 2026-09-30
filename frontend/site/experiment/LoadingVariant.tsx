import writingMascot from "./capybara-writing.png";
import { scenarioFields } from "./scenario";
import type { Variant } from "./study";
import styles from "./LoadingVariant.module.css";
const waitingMessage = "지원서를 채우고 있어요";
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
  if (variant === "A") {
    const currentCategory = scenarioFields[completed]?.category;
    const categories = [
      ...new Set(
        scenarioFields
          .slice(0, Math.min(completed + 1, scenarioFields.length))
          .map((field) => field.category),
      ),
    ];
    return (
      <section
        className={styles.history}
        data-reduced-motion={reducedMotion}
        aria-label="자동 기입 작업 영역"
        aria-busy={completed < scenarioFields.length}
      >
        <div className={styles.historyHeader}>
          <div>
            <p className={styles.historyCaption} role="status">
              {waitingMessage}
            </p>
            <h2 className={styles.historyTotal}>
              <span>{completed}</span>개 항목 입력
            </h2>
          </div>
          {icon}
        </div>
        <p className={styles.historyLabel}>입력 기록</p>
        <ol className={styles.historyList} aria-label="범주별 입력 현황">
          {categories.map((category) => {
            const count = scenarioFields
              .slice(0, completed)
              .filter((field) => field.category === category).length;
            const active = currentCategory === category;
            return (
              <li key={category} data-state={active ? "active" : "done"}>
                <span className={styles.recordIcon} aria-hidden="true">
                  {active ? <i /> : "✓"}
                </span>
                <strong>{category}</strong>
                <div className={styles.recordStatus}>
                  <span>{count}개 입력</span>
                  {active && <small>입력 중</small>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }
  const percentage = Math.round((completed / scenarioFields.length) * 100);
  return (
    <section
      className={`${styles.body} ${variant === "B" ? styles.progressBody : styles.minimalBody}`}
      data-reduced-motion={reducedMotion}
      aria-label="자동 기입 작업 영역"
      aria-busy="true"
    >
      {variant === "D" ? (
        <div className={styles.minimalScene}>
          {icon}
          <span className={styles.sceneShadow} aria-hidden="true" />
        </div>
      ) : (
        icon
      )}
      {variant === "B" ? (
        <>
          <p className={styles.caption}>{waitingMessage}</p>
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
          <span className={styles.activityTrack} aria-hidden="true">
            <i />
          </span>
          <p role="status">{waitingMessage}</p>
        </div>
      )}
    </section>
  );
}
