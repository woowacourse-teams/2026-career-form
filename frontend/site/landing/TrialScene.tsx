import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackEvent } from "../../src/analytics/events";
import { InstallLink, type InstallHandler } from "./BrandChrome";
import { SampleForm } from "./SampleForm";
import { ShareCard } from "./ShareCard";
import { SAMPLE_NAME, filledCount, reviewCount } from "./sample-form";
import { useHandoff } from "./handoff";
import { usePrefersReducedMotion } from "./scroll";
import { useTrialFill, type TrialStage } from "./trial-fill";
import { useScrollHold } from "./useScrollHold";
import pointerArt from "./assets/C3.webp";
import logo from "./assets/logo.webp";
import sparkleArt from "./assets/O2.webp";
import brand from "./brand.module.css";
import styles from "./TrialScene.module.css";

const BUTTON_LABEL: Record<TrialStage, string> = {
  ready: "자동 기입",
  running: "AI가 채우는 중…",
  complete: "완료",
};
const HINT = "여기를 눌러보세요";
const NUDGE = "먼저 자동 기입을 눌러보세요";

/** The hands-on trial under the AI scene; holds the scroll until it is tried. */
export function TrialScene({
  track,
  onInstall,
}: {
  track: TrackEvent;
  onInstall: InstallHandler;
}) {
  const reduced = usePrefersReducedMotion();
  const handoff = useHandoff();
  const section = useRef<HTMLElement>(null);
  const { stage, fields, start, reset } = useTrialFill(track, reduced);
  const [released, setReleased] = useState(false);
  const [hint, setHint] = useState(HINT);
  const [shakes, setShakes] = useState(0);
  const nudge = useCallback(() => {
    setHint(NUDGE);
    setShakes((n) => n + 1);
  }, []);
  useScrollHold(section, !released && !handoff, nudge);

  const run = () => {
    setReleased(true);
    start();
  };
  const again = () => {
    reset();
    setHint(HINT);
  };
  const skip = () => {
    setReleased(true);
    document
      .getElementById("alerts")
      ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  };
  const waiting = stage === "ready";
  return (
    <section
      ref={section}
      id="try"
      className={styles.trial}
      aria-labelledby={handoff ? "share-title" : "try-title"}
    >
      <div className={styles.inner}>
        {handoff ? (
          <ShareCard />
        ) : (
          <>
            <div className={styles.head}>
              <h2 id="try-title">이번엔 직접 눌러보세요.</h2>
              <p>가상 지원서예요. 아무 정보도 저장하지 않아요.</p>
            </div>
            <div
              className={`${styles.window} ${waiting ? styles.waiting : ""}`}
            >
              <div className={styles.page}>
                <div className={styles.dots} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <SampleForm
                  idPrefix="trial-field"
                  className={styles.form}
                  states={fields}
                />
              </div>
              <TrialPanel
                stage={stage}
                shakes={shakes}
                onRun={run}
                onAgain={again}
                onInstall={onInstall}
              />
              {waiting && (
                <div className={styles.guide} aria-live="polite">
                  <p className={styles.bubble}>{hint}</p>
                  <img
                    src={pointerArt}
                    alt="자동 기입 버튼을 가리키는 카피바라"
                  />
                </div>
              )}
            </div>
            <button type="button" className={styles.skip} onClick={skip}>
              {released ? "계속 보기 ↓" : "건너뛰고 계속 보기 ↓"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/** The simplified side panel: the 자동 기입 button and, when done, the result. */
function TrialPanel({
  stage,
  shakes,
  onRun,
  onAgain,
  onInstall,
}: {
  stage: TrialStage;
  shakes: number;
  onRun: () => void;
  onAgain: () => void;
  onInstall: InstallHandler;
}) {
  const waiting = stage === "ready";
  const button = useRef<HTMLButtonElement>(null);
  const previous = useRef(stage);
  // After 다시 해보기 the result card disappears; hand focus back to the button.
  useEffect(() => {
    if (previous.current === "complete" && stage === "ready")
      button.current?.focus();
    previous.current = stage;
  }, [stage]);
  return (
    <aside className={styles.panel} aria-label="커리어폼 패널 예시">
      <div className={styles.panelHead}>
        <img src={logo} alt="" />
        커리어폼
      </div>
      <p className={styles.greet}>
        <b>{SAMPLE_NAME}</b>님, 지원서를 열었어요.
      </p>
      <div className={styles.buttonWrap}>
        <button
          ref={button}
          key={shakes}
          type="button"
          className={`${styles.fill} ${waiting ? styles.pulse : ""} ${shakes ? styles.shake : ""}`}
          disabled={!waiting}
          onClick={onRun}
        >
          <img src={sparkleArt} alt="" />
          {BUTTON_LABEL[stage]}
        </button>
        {waiting && (
          <svg className={styles.cursor} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 2.5v17.2l4.6-4.3 2.9 6.6 3-1.3-2.9-6.5h6.2z" />
          </svg>
        )}
      </div>
      {stage === "complete" && (
        <div className={styles.result} role="status">
          <div className={styles.resultHead}>
            <i aria-hidden="true" />
            <b>{filledCount}칸을 채웠어요</b>
          </div>
          <p>
            <em>확인할 칸 {reviewCount}개</em>는 직접 확인하고, 제출도 직접
            해요.
          </p>
          <InstallLink
            onInstall={onInstall}
            className={`${brand.primary} ${styles.resultInstall}`}
          />
          <button type="button" className={styles.again} onClick={onAgain}>
            다시 해보기
          </button>
        </div>
      )}
      <div className={styles.card}>
        <b>프로필 관리</b>
        <span>이름, 학력, 경력을 모아둬요</span>
      </div>
      <div className={styles.card}>
        <b>지원 공고 관리</b>
        <span>마감 알림을 받을 공고 3개</span>
      </div>
    </aside>
  );
}
