import type { ReactNode } from "react";
import styles from "./Flow.module.css";

/** The landing character beside the card, saying one short tip. */
export function Coach({
  art,
  flip = false,
  label = "안내",
  children,
}: {
  art: string;
  flip?: boolean;
  label?: string;
  children: ReactNode;
}) {
  return (
    <aside className={styles.coach} aria-label={label}>
      <img
        className={flip ? `${styles.art} ${styles.flip}` : styles.art}
        src={art}
        alt=""
      />
      <div className={styles.bub}>{children}</div>
    </aside>
  );
}
