import { useState, type RefObject } from "react";
import { usePrefersReducedMotion } from "../../../site/landing/scroll";
import { GREETING_EXAMPLE_COMPANIES } from "./greeting-companies";
import {
  IMPORT_PHASES,
  IMPORT_STILL,
  ImportScene,
  importChapter,
  PauseButton,
  sceneStyles,
  useLoopTimeline,
} from "./scenes";
import styles from "./Flow.module.css";

const captions = [
  "써 둔 Greeting 지원서에서 Career Form 창을 열어요",
  "톱니바퀴에서 ‘프로필 가져오기’를 눌러요",
  "가져올 항목을 확인하고 저장하면 끝",
];

/**
 * Step 5, optional: shows that a profile can be imported from a Greeting
 * application written before. The import runs in the application tab's panel;
 * nothing here waits for it, and 다음 always moves on.
 */
export function GreetingStep({
  heading,
  onBack,
  onNext,
}: {
  heading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onNext: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const phase = useLoopTimeline(IMPORT_PHASES, {
    paused,
    still: reduced ? IMPORT_STILL : undefined,
  });
  const chapter = importChapter(phase);
  return (
    <div className={`${styles.stage} ${styles.one}`}>
      <section className={styles.card}>
        <div className={styles.hg}>
          <p className={styles.eye}>선택 · 이런 방법도 있어요</p>
          <h1 ref={heading} tabIndex={-1}>
            혹시 모든 인적사항을 입력하기 번거로우신가요?
          </h1>
          <p className={styles.lead}>
            과거에 Greeting에서 입력한 적이 있다면 한 번에 가져올 수 있어요!
          </p>
        </div>
        <div className={`${styles.duo} ${styles.wideScene}`}>
          <div className={styles.col}>
            <div className={styles.examples}>
              <p>
                <b>Greeting 채용 솔루션을 쓰는 회사 예:</b>{" "}
                {GREETING_EXAMPLE_COMPANIES.join(", ")} 등
              </p>
              <p className={styles.sm}>
                예시일 뿐이에요. 목록에 없는 회사도 Greeting 지원서라면 될 수
                있어요.
              </p>
            </div>
            <ol className={styles.caps} aria-label="가져오는 순서">
              {captions.map((caption, index) => (
                <li
                  key={caption}
                  aria-current={index === chapter ? "step" : undefined}
                >
                  {caption}
                </li>
              ))}
            </ol>
            <p className={styles.sm}>
              지금 하지 않아도 돼요. 나중에 지원서 화면에서 언제든 할 수 있어요.
            </p>
          </div>
          <div className={styles.col}>
            <div data-testid="import-scene" data-paused={paused || undefined}>
              <ImportScene phase={phase} />
            </div>
            <div className={sceneStyles.sceneFoot}>
              <p className={styles.sm}>
                예시 화면이에요. 가져올 항목은 저장 전에 직접 골라요.
              </p>
              {!reduced && (
                <PauseButton
                  paused={paused}
                  onToggle={() => setPaused((value) => !value)}
                />
              )}
            </div>
          </div>
        </div>
        <div className={`${styles.foot} ${styles.divided}`}>
          <div className={styles.acts}>
            <button
              type="button"
              className={`${styles.btn} ${styles.ghost}`}
              onClick={onBack}
            >
              이전
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.pri}`}
              onClick={onNext}
            >
              다음
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
