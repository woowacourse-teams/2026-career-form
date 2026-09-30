import writingMascot from "./capybara-writing.png";
import { WorkflowLoading } from "../../src/autofill/workflow/WorkflowLoading";
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
  if (variant === "A")
    return (
      <div className={styles.history} data-reduced-motion={reducedMotion}>
        <div className={styles.historyBrand}>{icon}</div>
        <WorkflowLoading
          writing
          statusMessage={waitingMessage}
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
  if (variant === "E") {
    const groups = [
      { label: "기본정보", categories: ["personal", "contact"] },
      { label: "학력", categories: ["education"] },
      { label: "어학·경력", categories: ["languages", "careers"] },
      { label: "자격증", categories: ["certifications"] },
    ];
    return (
      <section
        className={`${styles.body} ${styles.stepBody}`}
        data-reduced-motion={reducedMotion}
        aria-label="자동 기입 작업 영역"
        aria-busy="true"
      >
        {icon}
        <p className={styles.caption} role="status">
          {waitingMessage}
        </p>
        <ol className={styles.steps} aria-label="입력 단계">
          {groups.map((group, index) => {
            const indices = scenarioFields.flatMap((field, i) =>
              group.categories.includes(field.categoryId) ? [i] : [],
            );
            const done = completed > indices[indices.length - 1]!;
            const active = !done && completed >= indices[0]!;
            return (
              <li
                key={group.label}
                data-state={done ? "done" : active ? "active" : "waiting"}
                aria-current={active ? "step" : undefined}
              >
                <span className={styles.stepMarker} aria-hidden="true">
                  {done ? "✓" : index + 1}
                </span>
                <strong>{group.label}</strong>
                <span>{done ? "완료" : active ? "입력 중" : "대기"}</span>
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
      {icon}
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
          <span className={styles.loadingDots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <p role="status">{waitingMessage}</p>
        </div>
      )}
    </section>
  );
}
