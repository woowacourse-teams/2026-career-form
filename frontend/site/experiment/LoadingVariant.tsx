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
    <svg
      className={styles.document}
      viewBox="0 0 120 120"
      role="img"
      aria-label="지원서 작성 중"
    >
      <circle cx="60" cy="60" r="54" fill="#edf4ff" />
      <rect
        x="32"
        y="21"
        width="61"
        height="83"
        rx="10"
        fill="#dce8fa"
        transform="rotate(8 62 62)"
      />
      <rect
        x="26"
        y="16"
        width="62"
        height="84"
        rx="10"
        fill="white"
        stroke="#d6e3f5"
        strokeWidth="1.5"
      />
      <rect x="38" y="30" width="18" height="5" rx="2.5" fill="#93b4e7" />
      <g
        className={styles.ink}
        stroke="#4c88ed"
        strokeWidth="4"
        strokeLinecap="round"
      >
        <path d="M39 49H74" pathLength="1" />
        <path d="M39 62H70" pathLength="1" />
        <path d="M39 75H61" pathLength="1" />
      </g>
      <g className={styles.pen}>
        <path
          d="M66 77L83 38Q86 32 91 35L94 37Q98 39 95 45L78 83L65 90Z"
          fill="#3182f6"
        />
        <path d="M66 77L78 83L65 90Z" fill="#ffdbad" />
        <path d="M65 85L70 88L65 90Z" fill="#34445c" />
        <path d="M83 40L94 45" stroke="#a4c9ff" strokeWidth="3" />
      </g>
    </svg>
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
