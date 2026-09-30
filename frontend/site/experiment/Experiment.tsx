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
  const [introduced, setIntroduced] = useState(false);
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
  if (!introduced && study.trials.length === 0)
    return (
      <main className={`${styles.page} ${styles.onboarding}`}>
        <div className={styles.introCard}>
          <p className={styles.eyebrow}>커리어폼 · 사용자 경험 조사</p>
          <h1>
            지원서가 채워지는 동안,
            <br />
            어떤 화면이 편안한가요?
          </h1>
          <p>
            자동입력을 기다릴 때 보이는 <strong>패널의 표현 방식</strong>을
            비교하는 조사예요. 세 가지 화면을 체험하고 느낀 점을 알려주세요.
          </p>
          <div className={styles.focusDemo} aria-hidden="true">
            <div>
              지원서
              <br />
              <span>예제 정보가 자동으로 채워져요</span>
            </div>
            <div>
              <strong>커리어폼 패널</strong>
              <br />
              <span>이쪽을 중심으로 봐주세요</span>
              <i />
            </div>
          </div>
          <ol className={styles.introSteps}>
            <li>
              <strong>패널 살펴보기</strong>
              <span>
                ‘자동 기입’을 누른 뒤 오른쪽 패널에 집중해 주세요. 좁은
                화면에서는 지원서 아래에 있어요.
              </span>
            </li>
            <li>
              <strong>매번 짧게 평가하기</strong>
              <span>
                편안함, 진행에 대한 신뢰감, 기다림이 어떻게 느껴졌는지 답해
                주세요.
              </span>
            </li>
            <li>
              <strong>마지막에 하나 선택하기</strong>
              <span>
                세 화면 중 가장 선호하는 것을 골라주세요. 차이 없어도 괜찮아요.
              </span>
            </li>
          </ol>
          <p className={styles.introNote}>
            약 2~3분 · 정답 없음 · 예제 정보만 사용 · 실제 지원서 제출 없음
          </p>
          <button type="button" onClick={() => setIntroduced(true)}>
            안내를 읽었어요 · 체험 시작
          </button>
        </div>
      </main>
    );
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
        <p className={styles.notice}>
          자동 기입을 누른 뒤 커리어폼 패널을 중심으로 살펴봐 주세요.
        </p>
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
                  <section
                    className={`${styles.card} ${styles.completionCard}`}
                  >
                    <span className={styles.completionIcon} aria-hidden="true">
                      ✓
                    </span>
                    <h2 ref={heading} tabIndex={-1}>
                      입력이 완료됐어요
                    </h2>
                    <p>지원서의 입력 결과를 확인한 뒤 체험을 평가해 주세요.</p>
                    <button
                      className={styles.evaluateButton}
                      type="button"
                      onClick={() => setStage("survey")}
                    >
                      평가하기 <span aria-hidden="true">→</span>
                    </button>
                    <small className={styles.evaluationHint}>
                      방금 체험에 대한 세 가지 질문이에요
                    </small>
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
