import { useEffect, useRef } from "react";
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
  const records = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (records.current)
      records.current.scrollTop = records.current.scrollHeight;
  }, [completed]);
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
        <div className={styles.commonIntro}>
          {icon}
          <p role="status">{waitingMessage}</p>
        </div>
        <h2 className={styles.historyTotal}>
          <span>{completed}</span>개 항목 입력
        </h2>
        <p className={styles.historyLabel}>입력 기록</p>
        <ol
          ref={records}
          tabIndex={0}
          className={styles.historyList}
          aria-label="범주별 입력 현황"
        >
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
      className={styles.progressBody}
      data-reduced-motion={reducedMotion}
      aria-label="자동 기입 작업 영역"
      aria-busy={completed < scenarioFields.length}
    >
      <div className={styles.commonIntro}>
        {icon}
        <p role="status">{waitingMessage}</p>
      </div>
      {variant === "B" ? (
        <>
          <p className={styles.percentage}>{percentage}%</p>
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
        <div className={styles.remainingCount}>
          <p>남은 작업</p>
          <strong>
            {Math.max(0, scenarioFields.length - completed)}
            <small>개</small>
          </strong>
        </div>
      )}
    </section>
  );
}
