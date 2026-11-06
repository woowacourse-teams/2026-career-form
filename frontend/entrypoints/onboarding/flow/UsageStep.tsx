import type { RefObject } from "react";
import { FillScene, LoopBar, usePause } from "./scenes";
import styles from "./Flow.module.css";

/** Step 6: how to use autofill, with a scene that keeps replaying. */
export function UsageStep({
  heading,
  onBack,
  onExtra,
  onOpenProfile,
  onOpenPostings,
}: {
  heading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  /** Opens the one-question-at-a-time registration for the rest. */
  onExtra: () => void;
  onOpenProfile: () => void;
  onOpenPostings: () => void;
}) {
  const { paused, toggle } = usePause();
  return (
    <div className={`${styles.stage} ${styles.one}`}>
      <section className={styles.card}>
        <div className={styles.duo}>
          <div className={styles.col}>
            <div className={styles.hg}>
              <p className={styles.eye}>준비가 끝났어요</p>
              <h1 ref={heading} tabIndex={-1}>
                이제 지원서에서 써 보세요
              </h1>
              <p className={styles.lead}>
                작성 중인 지원서에서 아래 순서대로 하면 돼요.
              </p>
            </div>
            <ol className={styles.how} aria-label="사용 순서">
              <li>
                <div>
                  <b>작성 중인 지원서 탭을 여세요</b>
                  <span>채용 사이트의 지원서 작성 화면이면 돼요.</span>
                </div>
              </li>
              <li>
                <div>
                  <b>지원서 옆 Career Form 창에서 ‘자동 기입’을 누르세요</b>
                  <span>
                    페이지에 뜨는 Career Form 아이콘이나 주소창 오른쪽의 퍼즐
                    모양 메뉴로 창을 열 수 있어요.
                  </span>
                </div>
              </li>
              <li>
                <div>
                  <b>채워진 내용을 확인하고 직접 제출하세요</b>
                  <span>저장과 제출은 자동으로 하지 않아요.</span>
                </div>
              </li>
            </ol>
            <p className={styles.sm}>
              이름과 이메일만으로도 쓸 수 있어요. 전화번호, 학력, 경력을 더
              넣으면 채워지는 칸이 늘어요. 이 탭은 닫아도 돼요.
            </p>
            <div className={styles.foot}>
              <div className={`${styles.acts} ${styles.start}`}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.pri}`}
                  onClick={onExtra}
                >
                  추가 정보 더 등록하기
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.soft}`}
                  onClick={onOpenProfile}
                >
                  전체 프로필 편집
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.soft}`}
                  onClick={onOpenPostings}
                >
                  새 공고 보기
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.ghost}`}
                  onClick={onBack}
                >
                  이전
                </button>
              </div>
            </div>
          </div>
          <div className={styles.col}>
            <LoopBar
              label="사용법 미리보기 · 계속 반복돼요"
              paused={paused}
              onToggle={toggle}
            />
            <div
              className={`${styles.loop} ${paused ? styles.paused : ""}`}
              data-testid="fill-scene"
              data-paused={paused || undefined}
            >
              <FillScene />
            </div>
            <p className={styles.sm}>
              동작을 설명하는 예시예요. 실제 화면은 지원서마다 달라요.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
