import type { ReactNode, Ref } from "react";
import { SAMPLE_COMPANY, SAMPLE_FORM_TITLE, sampleFields } from "./sample-form";
import styles from "./SampleForm.module.css";

export type FieldState = "idle" | "seen" | "done" | "review";

const stateClass: Record<FieldState, string | undefined> = {
  idle: undefined,
  seen: styles.seen,
  done: `${styles.seen} ${styles.done}`,
  review: styles.review,
};

/**
 * The virtual application form. The AI scene drives it imperatively through
 * `rowRef` (class and style writes per frame); the trial drives it through
 * `states`.
 */
export function SampleForm({
  idPrefix,
  className,
  formRef,
  rowsRef,
  rowRef,
  states,
  withChips = false,
  children,
}: {
  idPrefix: string;
  className?: string;
  formRef?: Ref<HTMLDivElement>;
  rowsRef?: Ref<HTMLDivElement>;
  rowRef?: (index: number, row: HTMLDivElement | null) => void;
  states?: FieldState[];
  withChips?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      ref={formRef}
      className={className ? `${styles.form} ${className}` : styles.form}
      role="group"
      aria-label={`${SAMPLE_COMPANY} 입사지원서 예시`}
    >
      <div className={styles.head}>
        <small>
          {SAMPLE_COMPANY} · {SAMPLE_FORM_TITLE}
        </small>
        <b>입사지원서 · 인적사항</b>
      </div>
      <div ref={rowsRef} className={styles.rows}>
        {children}
        {sampleFields.map((field, i) => {
          const state = states?.[i] ?? "idle";
          return (
            <div
              key={field.label}
              ref={(el) => rowRef?.(i, el)}
              className={`${styles.row} ${stateClass[state] ?? ""}`}
              data-state={state}
            >
              <span className={styles.label} id={`${idPrefix}-${i}`}>
                {field.label}
              </span>
              <div
                className={styles.input}
                role="textbox"
                aria-readonly="true"
                aria-labelledby={`${idPrefix}-${i}`}
              >
                {/* The trial only puts a value in once it is filled; the AI
                    scene keeps it and reveals it with opacity per frame. */}
                <span className={styles.value} data-value>
                  {!states || state === "done" ? (field.value ?? "") : ""}
                </span>
                <i className={styles.check} aria-hidden="true" />
                {!field.value && (
                  <span className={styles.reviewNote}>확인 필요</span>
                )}
              </div>
              {withChips && (
                <span
                  className={`${styles.chip} ${field.value ? "" : styles.chipReview}`}
                  data-chip
                >
                  {field.label} → {field.meaning}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const sampleFormStyles = styles;
