import { ONBOARDING_STEPS, STEP_LABELS, type OnboardingStep } from "./steps";
import styles from "./Flow.module.css";

/** Every step with the current one marked; narrow screens read the caption. */
export function ProgressRail({ step }: { step: OnboardingStep }) {
  const index = ONBOARDING_STEPS.indexOf(step);
  return (
    <nav className={styles.prog} aria-label="진행 상황">
      <p className={styles.cap}>
        <b>
          {index + 1} / {ONBOARDING_STEPS.length}
        </b>
        {STEP_LABELS[step]}
      </p>
      <ol className={styles.rail}>
        {ONBOARDING_STEPS.map((item, i) => (
          <li
            key={item}
            className={
              i < index ? styles.done : i === index ? styles.now : undefined
            }
            aria-current={i === index ? "step" : undefined}
          >
            <span className={styles.dot}>{i + 1}</span>
            <span>{STEP_LABELS[item]}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
