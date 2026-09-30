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
      aria-label="지원서를 쓰는 카피바라"
    >
      <circle cx="60" cy="60" r="55" fill="var(--color-accent-soft)" />
      <ellipse cx="59" cy="108" rx="44" ry="5" fill="var(--color-brand)" />
      <path d="M23 97V70Q23 48 52 48Q80 49 82 77L85 99Z" fill="#b68b60" />
      <g className={styles.capyHead}>
        <ellipse cx="35" cy="27" rx="9" ry="11" fill="#b68b60" />
        <ellipse cx="68" cy="25" rx="9" ry="10" fill="#b68b60" />
        <ellipse cx="35" cy="28" rx="4" ry="6" fill="#8b6344" />
        <ellipse cx="68" cy="26" rx="4" ry="5" fill="#8b6344" />
        <path
          d="M25 44Q22 27 46 26H61Q78 27 80 42L88 49Q95 55 89 66Q85 75 64 73L39 70Q22 66 25 44Z"
          fill="#c9a47b"
        />
        <ellipse cx="77" cy="58" rx="16" ry="12" fill="#ddbd95" />
        <circle cx="60" cy="46" r="2.8" fill="#493627" />
        <ellipse cx="87" cy="54" rx="3" ry="2.2" fill="#493627" />
        <path
          d="M76 64Q81 67 85 62"
          fill="none"
          stroke="#795739"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M36 84L88 80L108 108H46Z"
        fill="white"
        stroke="var(--color-border-strong)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <g
        className={styles.ink}
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M52 90L79 88" pathLength="1" />
        <path d="M55 96L87 94" pathLength="1" />
        <path d="M59 102L81 101" pathLength="1" />
      </g>
      <ellipse
        cx="38"
        cy="86"
        rx="9"
        ry="6"
        fill="#c9a47b"
        transform="rotate(20 38 86)"
      />
      <g className={styles.pen}>
        <path
          d="M76 94L85 64"
          stroke="var(--color-action)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M76 91L74 98L79 93Z" fill="#493627" />
        <path d="M63 74Q74 72 80 81Q83 87 77 89Q72 90 66 83" fill="#c9a47b" />
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
