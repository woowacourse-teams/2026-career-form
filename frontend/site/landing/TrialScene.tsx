import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackEvent } from "../../src/analytics/events";
import { InstallLink, type InstallHandler } from "./BrandChrome";
import { SampleForm, type FieldState } from "./SampleForm";
import {
  SAMPLE_NAME,
  filledCount,
  reviewCount,
  sampleFields,
} from "./sample-form";
import { usePrefersReducedMotion } from "./scroll";
import { useScrollHold } from "./useScrollHold";
import pointerArt from "./assets/C3.webp";
import logo from "./assets/logo.webp";
import sparkleArt from "./assets/O2.webp";
import brand from "./brand.module.css";
import styles from "./TrialScene.module.css";

type Stage = "ready" | "running" | "complete";
const BUTTON_LABEL: Record<Stage, string> = {
  ready: "자동 기입",
  running: "AI가 채우는 중…",
  complete: "완료",
};
const HINT = "여기를 눌러보세요";
const NUDGE = "먼저 자동 기입을 눌러보세요";
const idle = (): FieldState[] => sampleFields.map(() => "idle");

/** Timeline of the fill, in ms: read every field, then fill, then flag review. */
function fillSchedule(scale: number) {
  const steps: { at: number; index: number; state: FieldState }[] = [];
  sampleFields.forEach((_, i) =>
    steps.push({ at: scale * (80 + i * 70), index: i, state: "seen" }),
  );
  let k = 0;
  sampleFields.forEach((field, i) => {
    if (field.value)
      steps.push({ at: scale * (1100 + k++ * 160), index: i, state: "done" });
  });
  const end = scale * 2600;
  sampleFields.forEach((field, i) => {
    if (!field.value) steps.push({ at: end, index: i, state: "review" });
  });
  return { steps, end };
}

function useNarrow(query = "(max-width: 700px)") {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia?.(query).matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return narrow;
}

export function TrialScene({
  track,
  onInstall,
}: {
  track: TrackEvent;
  onInstall: InstallHandler;
}) {
  const reduced = usePrefersReducedMotion();
  const narrow = useNarrow();
  const section = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [stage, setStage] = useState<Stage>("ready");
  const [fields, setFields] = useState<FieldState[]>(idle);
  const [released, setReleased] = useState(false);
  const [hint, setHint] = useState(HINT);
  const [shaking, setShaking] = useState(0);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const nudge = useCallback(() => {
    setHint(NUDGE);
    setShaking((n) => n + 1);
  }, []);
  useScrollHold(section, !released && !narrow, nudge);

  const start = () => {
    if (stage !== "ready") return;
    setReleased(true);
    setStage("running");
    track("trial_started", { surface: "site" });
    const { steps, end } = fillSchedule(reduced ? 0 : 1);
    for (const step of steps)
      timers.current.push(
        setTimeout(
          () =>
            setFields((prev) =>
              prev.map((s, i) => (i === step.index ? step.state : s)),
            ),
          step.at,
        ),
      );
    timers.current.push(
      setTimeout(() => {
        setStage("complete");
        track("trial_completed", { surface: "site" });
      }, end),
    );
  };
  const reset = () => {
    clearTimers();
    setFields(idle());
    setStage("ready");
    setHint(HINT);
    button.current?.focus();
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
      aria-labelledby="try-title"
    >
      <div className={styles.inner}>
        <div className={styles.head}>
          <h2 id="try-title">이번엔 직접 눌러보세요.</h2>
          <p>가상 지원서예요. 아무 정보도 저장하지 않아요.</p>
        </div>
        {narrow ? (
          <ShareCard onInstall={onInstall} />
        ) : (
          <>
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
                    key={shaking}
                    type="button"
                    className={`${styles.fill} ${waiting ? styles.pulse : ""} ${shaking ? styles.shake : ""}`}
                    disabled={!waiting}
                    onClick={start}
                  >
                    <img src={sparkleArt} alt="" />
                    {BUTTON_LABEL[stage]}
                  </button>
                  {waiting && (
                    <svg
                      className={styles.cursor}
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
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
                      <em>노란 칸 {reviewCount}개</em>는 직접 확인하고, 제출도
                      직접 해요.
                    </p>
                    <InstallLink
                      onInstall={onInstall}
                      className={`${brand.primary} ${styles.resultInstall}`}
                    />
                    <button
                      type="button"
                      className={styles.again}
                      onClick={reset}
                    >
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

function ShareCard({ onInstall }: { onInstall: InstallHandler }) {
  const [message, setMessage] = useState("");
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#try`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "커리어폼 체험하기",
          text: "PC Chrome에서 열어보세요.",
          url,
        });
        setMessage("");
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage("링크를 복사했어요. PC에서 붙여넣어 열어보세요.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("공유하지 못했어요. 주소창의 링크를 복사해 주세요.");
    }
  };
  return (
    <div className={styles.share}>
      <img src={pointerArt} alt="" />
      <h3>PC Chrome에서 직접 해볼 수 있어요</h3>
      <button type="button" className={brand.primary} onClick={share}>
        PC로 링크 보내기
      </button>
      <InstallLink onInstall={onInstall} className={brand.soft} />
      <small role="status">{message}</small>
    </div>
  );
}
