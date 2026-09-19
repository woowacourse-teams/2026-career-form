import { useEffect, useRef, useState } from "react";
import { AutofillOverlay } from "../../src/autofill-demo/AutofillOverlay";
import { exampleFields, demoAnalysisClient } from "./fixtures";
import { PanelPreview, demoRepository } from "./PanelPreview";
import { scheduleSimulation } from "./simulation-controller";
import styles from "./Simulation.module.css";

function ExampleForm() {
  return (
    <div className={styles.application}>
      <div className={styles.company}>
        <b>EXAMPLE</b>
        <span>채용 지원서</span>
        <small>예시 화면</small>
      </div>
      <h1>지원서 작성</h1>
      <p>신입 · 소프트웨어 개발</p>
      <div className={styles.fields}>
        {exampleFields.map(([id, label], index) => (
          <label
            key={id}
            className={
              index === 4 || index === 8 ? styles.groupStart : undefined
            }
            htmlFor={id}
          >
            <span>{label}</span>
            <input
              id={id}
              name={id}
              autoComplete="off"
              tabIndex={-1}
              placeholder=""
            />
          </label>
        ))}
      </div>
      <p className={styles.formNote}>제출 전, 입력된 내용을 직접 확인하세요.</p>
    </div>
  );
}
export function Simulation() {
  const root = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [cursor, setCursor] = useState({ x: 25, y: 24, visible: false });
  useEffect(() => {
    let played = false;
    let dispose = () => {};
    const start = () => {
      if (played) return;
      played = true;
      dispose = scheduleSimulation({
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
        move: () => {
          const button = root.current?.querySelector<HTMLButtonElement>(
            "[data-demo-panel] footer button",
          );
          const bounds = button?.getBoundingClientRect();
          const frame = root.current?.getBoundingClientRect();
          if (bounds && frame)
            setCursor({
              x: bounds.left - frame.left + bounds.width * 0.65,
              y: bounds.top - frame.top + bounds.height * 0.6,
              visible: true,
            });
        },
        click: () =>
          root.current
            ?.querySelector<HTMLButtonElement>(
              "[data-demo-panel] footer button",
            )
            ?.click(),
        hide: () => setCursor((current) => ({ ...current, visible: false })),
      });
    };
    // Observe the iframe in its parent viewport; an inner viewport alone is always visible.
    const target = window.frameElement ?? root.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          start();
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    if (target) observer.observe(target);
    return () => {
      observer.disconnect();
      dispose();
    };
  }, []);
  return (
    <div ref={root} className={styles.simulation}>
      <div className={styles.browserBar}>
        <span>● ● ●</span>
        <div>채용사이트 / 지원서 작성</div>
        <span>⋮</span>
      </div>
      <div className={styles.workspace}>
        <ExampleForm />
        <PanelPreview onAutofill={async () => setStarted(true)} />
      </div>
      {started && (
        <div className={styles.result} inert>
          <AutofillOverlay
            onClose={() => {}}
            apiClient={demoAnalysisClient}
            repository={demoRepository}
          />
        </div>
      )}
      <svg
        className={styles.cursor}
        style={{
          left: cursor.x,
          top: cursor.y,
          opacity: cursor.visible ? 1 : 0,
        }}
        width="28"
        height="34"
        viewBox="0 0 28 34"
        aria-hidden="true"
      >
        <path
          d="M2 2v26l7-7 6 11 5-3-6-10h10Z"
          fill="#3d2b20"
          stroke="white"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
