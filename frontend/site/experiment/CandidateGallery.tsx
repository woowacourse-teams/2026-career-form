import { useEffect, useRef, useState } from "react";
import { ApplicationForm } from "./ApplicationForm";
import { CandidatePanel, type CandidateId } from "./CandidatePanel";
import { startScenario } from "./scenario";
import styles from "./CandidateGallery.module.css";
const candidates: {
  id: CandidateId;
  title: string;
  question: string;
  difference: string;
}[] = [
  {
    id: "reassurance",
    title: "안심 안내형",
    question: "직접 확인하고 결정할 수 있다는 안내가 안심을 줄까요?",
    difference: "사용자의 통제권 안내",
  },
  {
    id: "live",
    title: "입력 미리보기형",
    question: "방금 입력된 값을 보면 진행 상황을 더 신뢰할까요?",
    difference: "실제 입력 결과 한 항목",
  },
  {
    id: "distraction",
    title: "시선 분산형",
    question: "캐릭터의 움직임을 보는 동안 기다림이 짧게 느껴질까요?",
    difference: "기다리는 동안의 볼거리",
  },
  {
    id: "next",
    title: "다음 행동 안내형",
    question: "완료 후 할 일을 미리 알면 기다리기가 편해질까요?",
    difference: "다음 행동 안내",
  },
];
export function CandidateGallery() {
  const root = useRef<HTMLElement>(null);
  const cancel = useRef(() => {});
  const [completed, setCompleted] = useState(0);
  const [state, setState] = useState<
    "ready" | "running" | "paused" | "complete" | "error"
  >("ready");
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media?.matches ?? false);
    update();
    media?.addEventListener("change", update);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        cancel.current();
        setState((current) => (current === "running" ? "paused" : current));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancel.current();
      media?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const replay = () => {
    if (!root.current) return;
    cancel.current();
    setState("running");
    cancel.current = startScenario({
      root: root.current,
      onProgress: setCompleted,
      onComplete: () => setState("complete"),
      onError: () => setState("error"),
    });
  };
  const status = {
    ready: "재생 준비",
    running: "함께 재생 중",
    paused: "일시 정지",
    complete: "재생 완료",
    error: "재생에 실패했어요. 다시 재생해 주세요.",
  }[state];
  return (
    <main className={styles.page} ref={root}>
      <header className={styles.header}>
        <a href="/experiment/">← 기존 체험으로</a>
        <p className={styles.eyebrow}>커리어폼 · 디자인 후보</p>
        <h1>같은 기다림, 네 가지 아이디어</h1>
        <p>
          네 번째 체험으로 넣을 후보를 골라보세요. 캐릭터·공통 문구·색상은
          맞추고, 기다림을 돕는 방식만 다르게 구성했어요.
        </p>
      </header>
      <div className={styles.toolbar}>
        <div>
          <button type="button" onClick={replay}>
            4개 함께 재생
          </button>
          <button
            className={styles.secondary}
            type="button"
            disabled={state !== "running"}
            onClick={() => {
              cancel.current();
              setState("paused");
            }}
          >
            멈추기
          </button>
        </div>
        <p role="status">
          {status}
          <span>동일한 예제 입력 · 약 6.6초</span>
        </p>
      </div>
      <div className={styles.grid}>
        {candidates.map((candidate, index) => (
          <article
            key={candidate.id}
            className={styles.card}
            aria-labelledby={`candidate-${candidate.id}`}
          >
            <div className={styles.cardHeader}>
              <span className={styles.number}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 id={`candidate-${candidate.id}`}>{candidate.title}</h2>
                <p>{candidate.difference}</p>
              </div>
            </div>
            <div className={styles.panelChrome}>
              <span>커리어폼</span>
              <span>자동 기입</span>
            </div>
            <CandidatePanel
              candidate={candidate.id}
              completed={completed}
              running={state === "running"}
              reducedMotion={reducedMotion}
            />
            <p className={styles.question}>{candidate.question}</p>
          </article>
        ))}
      </div>
      <p className={styles.note}>
        디자인 선택용 미리보기예요. 설문 응답으로 저장되지 않아요. 시선 분산형의
        움직임은 실제 입력 진도를 뜻하지 않아요.
      </p>
      <details className={styles.application}>
        <summary>함께 채워지는 예제 지원서 보기</summary>
        <div className={styles.formFrame}>
          <ApplicationForm />
        </div>
      </details>
    </main>
  );
}
