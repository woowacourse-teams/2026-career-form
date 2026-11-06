import type { RefObject } from "react";
import {
  GREETING_EXAMPLE_COMPANIES,
  GREETING_OTHER_LABEL,
} from "./greeting-companies";
import { ImportScene, LoopBar, usePause } from "./scenes";
import styles from "./Flow.module.css";

/** Step 5: shows where the Greeting import lives. The import itself runs in
 *  the application tab's panel; this page only notices the saved profile. */
export function GreetingStep({
  heading,
  imported,
  onBack,
  onNext,
}: {
  heading: RefObject<HTMLHeadingElement | null>;
  imported: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const { paused, toggle } = usePause();
  return (
    <div className={`${styles.stage} ${styles.one}`}>
      <section className={styles.card}>
        <div
          className={`${styles.duo} ${styles.gloop} ${paused ? styles.paused : ""}`}
          data-testid="import-scene"
          data-paused={paused || undefined}
        >
          <div className={styles.col}>
            <div className={styles.hg}>
              <p className={styles.eye}>인적사항 한 번에 불러오기</p>
              <h1 ref={heading} tabIndex={-1}>
                Greeting 지원서를 쓴 적이 있나요?
              </h1>
              <p className={styles.lead}>
                그때 쓴 인적사항을 그대로 가져올 수 있어요.
              </p>
            </div>
            <ul
              className={styles.chips}
              aria-label="Greeting으로 지원서를 받는 회사 예시"
            >
              {[...GREETING_EXAMPLE_COMPANIES, GREETING_OTHER_LABEL].map(
                (company) => (
                  <li key={company} className={styles.chip}>
                    {company}
                  </li>
                ),
              )}
            </ul>
            <ol className={styles.caps} aria-label="가져오는 순서">
              <li>써 둔 지원서를 열어요</li>
              <li>패널 톱니에서 ‘프로필 가져오기’</li>
              <li>고르고 저장하면 끝</li>
            </ol>
            <p
              className={
                imported ? `${styles.wait} ${styles.got}` : styles.wait
              }
              role="status"
            >
              {imported
                ? "가져왔어요. 프로필에 저장했어요."
                : "가져오면 이 화면이 알아서 이어져요."}
            </p>
            <div className={styles.foot}>
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
                  className={`${styles.btn} ${imported ? styles.pri : styles.soft}`}
                  onClick={onNext}
                >
                  {imported ? "다음" : "건너뛰기"}
                </button>
              </div>
            </div>
          </div>
          <div className={styles.col}>
            <LoopBar
              label="가져오는 모습 · 계속 반복돼요"
              paused={paused}
              onToggle={toggle}
            />
            <ImportScene />
            <p className={styles.sm}>
              예시 화면이에요. 목록에 없는 회사도 될 수 있고, 가져올 항목은 저장
              전에 직접 골라요.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
