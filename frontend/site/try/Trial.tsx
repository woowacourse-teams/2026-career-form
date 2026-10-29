import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TrackEvent } from "../../src/analytics/events";
import { PanelPreview } from "../demo/PanelPreview";
import { ApplicationForm } from "../experiment/ApplicationForm";
import { LoadingVariant } from "../experiment/LoadingVariant";
import { experimentRepository } from "../experiment/profile";
import { scenarioFields, startScenario } from "../experiment/scenario";
import demo from "../demo/Simulation.module.css";
import experiment from "../experiment/Experiment.module.css";
import styles from "./Trial.module.css";

type Stage = "ready" | "running" | "complete";
type Guide = "profile" | "postings";

// What the two panel buttons would open after installing. Shown in place of
// the extension pages the web cannot open.
const guides: Record<Guide, { title: string; body: string }> = {
  profile: {
    title: "프로필 관리는 설치 후에 열려요",
    body: "이름·이메일·연락처부터 등록하고, 학력·경력·자격증은 필요할 때 추가해요. 등록한 정보는 내 브라우저에만 저장돼요.",
  },
  postings: {
    title: "지원 공고 관리는 설치 후에 열려요",
    body: "회사명·직무·마감 시각을 저장하면 마감 하루 전과 2시간 전에 알림이 와요. 프로필 없이 공고 저장부터 시작할 수 있어요.",
  },
};

// The hands-on trial from the panel study, without the survey: the visitor
// presses 자동 기입 on the real panel and watches a fixed example profile fill
// a virtual application. Nothing is submitted and no profile is stored.
export function Trial({
  track,
  surface,
  install,
}: {
  track: TrackEvent;
  surface: "site" | "extension_onboarding";
  install: ReactNode;
}) {
  const [stage, setStage] = useState<Stage>("ready");
  const [completed, setCompleted] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [guide, setGuide] = useState<Guide | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const guideHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!guide) return;
    guideHeading.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGuide(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [guide]);
  const cancel = useRef(() => {});
  const completionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const reset = () => {
    clearTimeout(completionTimer.current);
    cancel.current();
    setCompleted(0);
    setStage("ready");
    setAttempt((n) => n + 1);
  };
  useEffect(
    () => () => {
      clearTimeout(completionTimer.current);
      cancel.current();
    },
    [],
  );
  useEffect(() => {
    if (stage === "complete") heading.current?.focus();
  }, [stage]);
  const start = async () => {
    if (stage !== "ready" || !root.current) return;
    setNotice("");
    setReducedMotion(
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    );
    setStage("running");
    track("trial_started", { surface });
    cancel.current = startScenario({
      root: root.current,
      onProgress: setCompleted,
      onComplete: () => {
        completionTimer.current = setTimeout(() => {
          setStage("complete");
          track("trial_completed", { surface });
        }, 400);
      },
      onError: () => {
        reset();
        setNotice("입력을 완료하지 못했어요. 다시 시작해 주세요.");
      },
    });
  };
  return (
    <div ref={root} className={styles.trial}>
      {notice && (
        <p role="alert" className={experiment.notice}>
          {notice}
        </p>
      )}
      <div className={`${demo.workspace} ${experiment.workspace}`}>
        <ApplicationForm key={attempt} headingLevel={2} />
        <aside
          className={`${demo.sidebar} ${experiment.sidebar} ${styles.sidebar}`}
          aria-label="커리어폼 패널"
          data-trial-stage={guide ? "guide" : stage}
        >
          <div className={demo.panelLocation}>확장 프로그램 · 사이드패널</div>
          {guide && (
            <section
              className={styles.guide}
              role="dialog"
              aria-labelledby="trial-guide-title"
            >
              <div className={styles.guideCard}>
                <p className={styles.guideEyebrow}>설치하면 쓸 수 있어요</p>
                <h2 id="trial-guide-title" ref={guideHeading} tabIndex={-1}>
                  {guides[guide].title}
                </h2>
                <p>{guides[guide].body}</p>
                <div className={styles.completionActions}>
                  {install}
                  <button type="button" onClick={() => setGuide(null)}>
                    체험으로 돌아가기
                  </button>
                </div>
              </div>
            </section>
          )}
          <PanelPreview
            repository={experimentRepository}
            onAutofill={start}
            onReturn={reset}
            openOptions={() => setGuide("profile")}
            openPostings={async () => setGuide("postings")}
            autofillView={
              stage === "running" ? (
                <LoadingVariant
                  variant="B"
                  completed={completed}
                  reducedMotion={reducedMotion}
                />
              ) : stage === "complete" ? (
                <section
                  className={`${experiment.card} ${experiment.completionCard}`}
                >
                  <span
                    className={experiment.completionIcon}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <h2 ref={heading} tabIndex={-1}>
                    입력이 완료됐어요
                  </h2>
                  <p>
                    {scenarioFields.length}개 칸을 채웠어요. 지원서를 확인해
                    보세요.
                  </p>
                  <div className={styles.completionActions}>
                    {install}
                    <button type="button" onClick={reset}>
                      다시 체험하기
                    </button>
                  </div>
                </section>
              ) : undefined
            }
          />
        </aside>
      </div>
    </div>
  );
}
