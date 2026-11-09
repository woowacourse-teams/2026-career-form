import { useState, type RefObject } from "react";
import { usePrefersReducedMotion } from "../../../site/landing/scroll";
import {
  FILL_PHASES,
  FILL_STILL,
  FillScene,
  fillChapter,
  PauseButton,
  sceneStyles,
  useLoopTimeline,
} from "./scenes";
import { StepBar } from "./StepBar";
import styles from "./Flow.module.css";

const usage = [
  ["작성 중인 지원서 탭을 여세요", "채용 사이트의 지원서 작성 화면이면 돼요."],
  [
    "지원서 옆 Career Form 창에서 ‘자동 기입’을 누르세요",
    "페이지에 뜨는 Career Form 아이콘이나 주소창 오른쪽의 퍼즐 모양 메뉴로 창을 열 수 있어요.",
  ],
  [
    "채워진 내용을 확인하고 직접 제출하세요",
    "저장과 제출은 자동으로 하지 않아요.",
  ],
] as const;

/** Step 6: how to use autofill, with a scene that keeps replaying. */
export function UsageStep({
  heading,
  onBack,
  onOpenProfile,
  onOpenPostings,
}: {
  heading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  /** The management page's full profile editor. */
  onOpenProfile: () => void;
  /** The management page's 새 공고 tab: postings open for applications. */
  onOpenPostings: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const phase = useLoopTimeline(FILL_PHASES, {
    paused,
    still: reduced ? FILL_STILL : undefined,
  });
  const chapter = fillChapter(phase);
  return (
    <div className={`${styles.stage} ${styles.one}`}>
      <section className={styles.card}>
        <div className={styles.hg}>
          <p className={styles.eye}>준비가 끝났어요</p>
          <h1 ref={heading} tabIndex={-1}>
            이제 지원서에서 써 보세요
          </h1>
          <p className={styles.lead}>
            작성 중인 지원서에서 아래 순서대로 하면 돼요.
          </p>
        </div>
        <div className={`${styles.duo} ${styles.wideScene}`}>
          <div className={styles.col}>
            <ol className={styles.how} aria-label="사용 순서">
              {usage.map(([title, detail], index) => (
                <li
                  key={title}
                  aria-current={index === chapter ? "step" : undefined}
                >
                  <div>
                    <b>{title}</b>
                    <span>{detail}</span>
                  </div>
                </li>
              ))}
            </ol>
            <p className={styles.sm}>
              이름과 이메일만으로도 쓸 수 있어요. 전화번호, 학력, 경력을 더
              넣으면 채워지는 칸이 늘어요. 이 탭은 닫아도 돼요.
            </p>
          </div>
          <div className={styles.col}>
            <div data-testid="fill-scene" data-paused={paused || undefined}>
              <FillScene phase={phase} />
            </div>
            <div className={sceneStyles.sceneFoot}>
              <p className={styles.sm}>
                동작을 설명하는 예시예요. 실제 화면은 지원서마다 달라요.
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
      </section>
      {/* 이전 and the main action sit where 이전 and 다음 do on every step. */}
      <StepBar label="다음에 할 일">
        <button
          type="button"
          className={`${styles.btn} ${styles.ghost} ${styles.back}`}
          data-variant="text"
          onClick={onBack}
        >
          이전
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.outline} ${styles.alt}`}
          data-variant="outline"
          onClick={onOpenPostings}
        >
          지금 채용 중인 회사 보기
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.pri}`}
          data-variant="primary"
          onClick={onOpenProfile}
        >
          전체 프로필 입력하기
        </button>
      </StepBar>
    </div>
  );
}
