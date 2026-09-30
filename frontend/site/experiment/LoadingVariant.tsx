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
          <svg
            className={styles.writingDesk}
            viewBox="0 0 220 110"
            aria-hidden="true"
          >
            <ellipse
              cx="112"
              cy="91"
              rx="87"
              ry="8"
              fill="var(--color-brand)"
            />
            <path
              d="M53 39 L157 39 L185 88 L72 88 Z"
              fill="var(--color-brand)"
            />
            <g className={styles.writingPage}>
              <path
                d="M53 34 L157 34 L185 83 L72 83 Z"
                fill="#fff9ee"
                stroke="var(--color-accent)"
                strokeWidth="0.7"
              />
              <g
                fill="none"
                stroke="var(--color-action)"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path
                  className={styles.inkOne}
                  pathLength="1"
                  d="M78 48 q5 -3 9 0 t9 0 t9 0 t9 0 t9 0"
                />
                <path
                  className={styles.inkTwo}
                  pathLength="1"
                  d="M82 59 q5 -3 9 0 t9 0 t9 0 t9 0 t9 0 t9 0"
                />
                <path
                  className={styles.inkThree}
                  pathLength="1"
                  d="M87 70 q5 -3 9 0 t9 0 t9 0 t9 0"
                />
              </g>
            </g>
            <g className={styles.writingHand}>
              <path
                d="M61 21 Q47 9 37 21 Q29 37 50 43 Q61 43 70 36"
                fill="#ed8827"
              />
              <g transform="rotate(-28 77 37)">
                <rect
                  x="74"
                  y="7"
                  width="6"
                  height="35"
                  rx="2"
                  fill="var(--color-action-strong)"
                />
                <path d="M74 42 L80 42 L77 49 Z" fill="#dfb780" />
                <path
                  d="M76 47 L78 47 L77 49 Z"
                  fill="var(--color-text-strong)"
                />
                <rect x="74" y="8" width="6" height="5" rx="1" fill="#f2d3a8" />
              </g>
              <ellipse cx="68" cy="30" rx="12" ry="9" fill="#ef902e" />
            </g>
          </svg>
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
          <p role="status">{waitingMessage}</p>
        </div>
      )}
    </section>
  );
}
