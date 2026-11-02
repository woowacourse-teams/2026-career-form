import { Fragment, type ReactNode } from "react";
import styles from "../../autofill-demo/AutofillDemo.module.css";

export type WorkflowErrorKind =
  "connection" | "rateLimited" | "updateNeeded" | "unknown" | "interrupted";

interface ErrorCopy {
  tone: "neutral" | "accent" | "warning";
  title: string;
  description: string;
  icon: ReactNode;
}

const iconProps = {
  width: 30,
  height: 30,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ERROR_COPY: Record<WorkflowErrorKind, ErrorCopy> = {
  connection: {
    tone: "neutral",
    title: "서버에 연결하지 못했어요",
    description:
      "인터넷 연결을 확인한 뒤 다시 시도해 주세요. 지원서는 바뀌지 않았어요.",
    icon: (
      <svg {...iconProps}>
        <path d="M2 8.8a15 15 0 0 1 20 0" />
        <path d="M5 12.6a10 10 0 0 1 14 0" />
        <path d="M8.5 16.3a5 5 0 0 1 7 0" />
        <circle cx="12" cy="19.6" r=".9" fill="currentColor" />
        <path d="M3 3l18 18" />
      </svg>
    ),
  },
  rateLimited: {
    tone: "neutral",
    title: "잠시 후 다시 시도해 주세요",
    description:
      "지금 요청이 많아 분석을 시작하지 못했어요. 지원서는 바뀌지 않았어요.",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  updateNeeded: {
    tone: "accent",
    title: "확장 프로그램을 업데이트해 주세요",
    description:
      "이 지원서 정책은 새 버전에서 지원해요. Chrome 확장 프로그램 화면에서 업데이트한 뒤 다시 시도해 주세요.",
    icon: (
      <svg {...iconProps}>
        <path d="M12 19V6" />
        <path d="m6 11 6-6 6 6" />
        <path d="M5 21h14" />
      </svg>
    ),
  },
  unknown: {
    tone: "neutral",
    title: "자동 기입을 시작하지 못했어요",
    description:
      "잠시 후 다시 시도해 주세요. 계속되면 복사 버튼으로 직접 입력할 수 있어요.",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2v.4" />
        <circle cx="12" cy="16.8" r=".9" fill="currentColor" />
      </svg>
    ),
  },
  interrupted: {
    tone: "warning",
    title: "자동 기입을 멈췄어요",
    // Built from the stop reason and what was written; see describe().
    description: "",
    icon: (
      <svg {...iconProps}>
        <path d="M12 8v5" />
        <circle cx="12" cy="16.5" r=".9" fill="currentColor" />
        <path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
    ),
  },
};

const GENERIC_STOP_REASON = "문제가 생겨 안전하게 멈췄어요.";

/**
 * An interrupted run says why it stopped, then only what is true about the
 * page: the kept-values claim is made only when something was written. Each
 * sentence is returned separately so the reason stays its own text element.
 */
function describe(
  kind: WorkflowErrorKind,
  reason: string | undefined,
  completedCount: number,
): string[] {
  if (kind !== "interrupted") return [ERROR_COPY[kind].description];
  const cause = reason?.trim()
    ? /[.!?]$/.test(reason.trim())
      ? reason.trim()
      : `${reason.trim()}.`
    : GENERIC_STOP_REASON;
  return completedCount > 0
    ? [
        cause,
        "이미 입력한 값은 그대로 있어요. 남은 항목은 복사 버튼으로 채울 수 있어요.",
      ]
    : [cause, "복사 버튼으로 직접 입력할 수 있어요."];
}

const RETRYABLE: ReadonlySet<WorkflowErrorKind> = new Set([
  "connection",
  "rateLimited",
  "unknown",
]);

export interface WorkflowErrorProps {
  kind: WorkflowErrorKind;
  developerMode: boolean;
  /** Our own wording for why an interrupted run stopped. Shown to everyone. */
  reason?: string;
  /** Raw server text or code. Shown only in developer mode. */
  detail?: string;
  /** Interrupted runs lead with how far the run got. */
  completedCount?: number;
  manualCount?: number;
  /** Retry runs only from this click; nothing retries on its own. */
  onRetry?(): void;
  onBack?(): void;
}

export function WorkflowError({
  kind,
  developerMode,
  reason,
  detail,
  completedCount = 0,
  manualCount = 0,
  onRetry,
  onBack,
}: WorkflowErrorProps) {
  const copy = ERROR_COPY[kind];
  const showRetry = RETRYABLE.has(kind) && !!onRetry;
  const showSummary =
    kind === "interrupted" && completedCount + manualCount > 0;
  return (
    <div className={`${styles.screen} ${styles.errorScreen}`}>
      <div className={styles.errorBody} role="alert">
        <div className={styles.errorIcon} data-tone={copy.tone}>
          {copy.icon}
        </div>
        <h2 className={styles.errorTitle}>{copy.title}</h2>
        <p className={styles.errorDescription}>
          {describe(kind, reason, completedCount).map((sentence, index) => (
            <Fragment key={sentence}>
              {index > 0 && " "}
              <span>{sentence}</span>
            </Fragment>
          ))}
        </p>
        {showSummary && (
          <div
            className={styles.errorSummary}
            role="group"
            aria-label="기입 현황"
          >
            <div>
              <strong>{completedCount}</strong>
              <span>입력 완료</span>
            </div>
            <div>
              <strong data-tone="warning">{manualCount}</strong>
              <span>직접 입력 필요</span>
            </div>
          </div>
        )}
        {developerMode && detail && (
          <details className={styles.errorDetails}>
            <summary>오류 정보</summary>
            <pre>{detail}</pre>
          </details>
        )}
      </div>
      {(showRetry || onBack) && (
        <div className={styles.errorFooter}>
          {showRetry && (
            <button className={styles.primary} type="button" onClick={onRetry}>
              다시 시도
            </button>
          )}
          {onBack && (
            <button
              className={showRetry ? styles.textButton : styles.primary}
              type="button"
              onClick={onBack}
            >
              돌아가기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
