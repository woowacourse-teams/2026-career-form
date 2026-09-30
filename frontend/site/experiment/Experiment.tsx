import { useEffect, useRef, useState } from "react";
import { PanelPreview } from "../demo/PanelPreview";
import { experimentRepository } from "./profile";
import { ApplicationForm } from "./ApplicationForm";
import { LoadingVariant } from "./LoadingVariant";
import { startScenario, SCENARIO_DURATION_MS } from "./scenario";
import {
  createStudy,
  loadStudy,
  saveStudy,
  recordTrial,
  VARIANT_COUNT,
  type Ratings,
} from "./study";
import { TrialSurvey } from "./TrialSurvey";
import { FinalSurvey } from "./FinalSurvey";
import demo from "../demo/Simulation.module.css";
import styles from "./Experiment.module.css";
const ordinals = ["첫 번째", "두 번째", "세 번째"];
export function Experiment() {
  const [study, setStudy] = useState(() => loadStudy() ?? createStudy());
  const [stage, setStage] = useState<
    "ready" | "running" | "complete" | "survey"
  >("ready");
  const [completed, setCompleted] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const running = useRef(false);
  const cancel = useRef(() => {});
  const duration = useRef(0);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const reset = () => {
    clearTimeout(completionTimer.current);
    cancel.current();
    running.current = false;
    duration.current = 0;
    setCompleted(0);
    setStage("ready");
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    saveStudy(study);
  }, [study]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && running.current) {
        reset();
        setNotice(
          "화면을 벗어나 체험을 중단했어요. 같은 체험을 다시 시작해 주세요.",
        );
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(completionTimer.current);
      cancel.current();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    if (stage === "complete" || stage === "survey") heading.current?.focus();
    if (stage === "ready")
      root.current
        ?.querySelector<HTMLButtonElement>("[data-autofill-start]")
        ?.focus();
  }, [stage, attempt, panelOpen]);
  const start = async () => {
    if (
      running.current ||
      stage !== "ready" ||
      !root.current ||
      document.visibilityState === "hidden"
    )
      return;
    running.current = true;
    setNotice("");
    setReducedMotion(
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    );
    setStage("running");
    cancel.current = startScenario({
      root: root.current,
      onProgress: setCompleted,
      onComplete: (ms) => {
        duration.current = ms;
        completionTimer.current = setTimeout(() => {
          running.current = false;
          setStage("complete");
        }, 400);
      },
      onError: () => {
        reset();
        setNotice("입력을 완료하지 못했어요. 같은 체험을 다시 시작해 주세요.");
      },
    });
  };
  const rate = (ratings: Ratings) => {
    if (stage !== "survey" || duration.current < SCENARIO_DURATION_MS) return;
    setStudy(
      recordTrial(study, {
        variant: study.order[study.trials.length]!,
        ratings,
        durationMs: duration.current,
        reducedMotion,
      }),
    );
    reset();
  };
  if (study.trials.length === VARIANT_COUNT)
    return (
      <div className={styles.page}>
        <FinalSurvey
          study={study}
          onChange={(preference, reason) =>
            setStudy((current) => ({
              ...current,
              final: { preference, reason },
            }))
          }
        />
      </div>
    );
  if (stage === "survey")
    return (
      <div className={styles.page}>
        <TrialSurvey onSave={rate} />
      </div>
    );
  return (
    <div className={styles.page} ref={root}>
      <header className={styles.studyHeader}>
        <div>
          <p>커리어폼 · 화면 체험</p>
          <h1>
            {ordinals[study.trials.length]} 체험{" "}
            <small>/ {VARIANT_COUNT}</small>
          </h1>
        </div>
        <p>
          가상 지원서·예제 데이터로 체험합니다.
          <br />
          패널의 ‘자동 기입’을 눌러 시작해 주세요.
        </p>
      </header>
      {stage === "ready" && (
        <section className={styles.guide} aria-label="실험 안내">
          <h2>자동입력을 기다리는 경험을 비교해요</h2>
          <p>
            지원서가 자동으로 채워지는 동안, 오른쪽 패널의 세 가지 표현 방식이
            어떻게 느껴지는지 알아보는 실험이에요. 정답은 없으니 직접 느낀
            그대로 평가해 주세요.
          </p>
          <ol>
            <li>
              ‘자동 기입’을 누르고 지원서가 채워지는 동안 화면을 살펴봐 주세요.
            </li>
            <li>
              각 체험이 끝나면 편안함, 신뢰감, 체감 대기 시간을 평가해 주세요.
            </li>
            <li>
              세 번 모두 체험한 뒤 가장 선호하는 방식과 이유를 알려주세요. 차이
              없음을 골라도 괜찮아요.
            </li>
          </ol>
          <p>
            전체 참여는 약 2~3분이에요. 예제 정보만 사용하며 실제 지원서는
            제출되지 않아요.
          </p>
        </section>
      )}
      {notice && (
        <p role="alert" className={styles.notice}>
          {notice}
        </p>
      )}
      <div className={`${demo.workspace} ${styles.workspace}`}>
        <ApplicationForm key={attempt} />
        <aside
          className={`${demo.sidebar} ${styles.sidebar}`}
          aria-label="지원서 패널"
        >
          <div className={demo.panelLocation}>커리어폼 · 지원서 패널</div>
          {panelOpen ? (
            <PanelPreview
              repository={experimentRepository}
              onAutofill={start}
              onReturn={reset}
              onClose={() => {
                reset();
                setPanelOpen(false);
              }}
              autofillView={
                stage === "running" ? (
                  <LoadingVariant
                    variant={study.order[study.trials.length]!}
                    completed={completed}
                    reducedMotion={reducedMotion}
                  />
                ) : stage === "complete" ? (
                  <section className={styles.card}>
                    <h2 ref={heading} tabIndex={-1}>
                      입력이 완료됐어요
                    </h2>
                    <p>지원서의 입력 결과를 확인한 뒤 체험을 평가해 주세요.</p>
                    <button type="button" onClick={() => setStage("survey")}>
                      평가하기
                    </button>
                  </section>
                ) : undefined
              }
            />
          ) : (
            <div className={styles.card}>
              <button type="button" onClick={() => setPanelOpen(true)}>
                패널 다시 열기
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
