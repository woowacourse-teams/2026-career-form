import type { ReactNode } from "react";
import styles from "./Flow.module.css";

/**
 * A step's moves, pinned to the bottom of the window, so 이전 and 다음 keep
 * one place on every step however tall or wide the card is. 이전 holds the
 * left end of the content column and the other moves line up on the right.
 */
export function StepBar({
  label = "단계 이동",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.bar}
      role="group"
      aria-label={label}
      data-step-bar=""
    >
      <div className={styles.barIn}>{children}</div>
    </div>
  );
}
