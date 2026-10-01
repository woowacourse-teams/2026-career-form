import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AutofillOverlay } from "../../src/autofill-demo/AutofillOverlay";
import { exampleFields, demoAnalysisClient } from "./fixtures";
import { PanelPreview, demoRepository } from "./PanelPreview";
import { scheduleSimulation } from "./simulation-controller";
import styles from "./Simulation.module.css";

function ExampleForm({ started }: { started: boolean }) {
  return (
    <div className={`${styles.application} ${started ? styles.filling : ""}`}>
      <div className={styles.company}>
        <b>NEXT COMPANY</b>
        <span>CAREERS</span>
      </div>
      <p className={styles.breadcrumb}>채용 공고 / 지원서 작성</p>
      <h1>입사지원서</h1>
      <div className={styles.progress}>
        <strong>01 기본 정보</strong>
        <span>02 경력·경험</span>
        <span>03 최종 확인</span>
      </div>
      <h2 className={styles.sectionTitle}>기본 인적사항</h2>
      <div className={styles.fields}>
        {exampleFields.map(([id, label], index) => (
          <label
            key={id}
            style={{ "--delay": `${index * 0.12}s` } as CSSProperties}
            htmlFor={id}
          >
            <span>{label}</span>
            <input
              id={id}
              name={id}
              type={id === "graduated" || id === "acquired" ? "date" : "text"}
              autoComplete="off"
              tabIndex={-1}
              placeholder=""
            />
          </label>
        ))}
      </div>
      <p className={styles.formNote}>
        저장된 정보가 지원서에 자동으로 입력됩니다.
      </p>
    </div>
  );
}
export function Simulation() {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(window.innerWidth);
  const scale = Math.min(1, width / 900);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
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
            "[data-demo-panel] [data-autofill-start]",
          );
          const bounds = button?.getBoundingClientRect();
          const frame = root.current?.getBoundingClientRect();
          if (bounds && frame)
            setCursor({
              x:
                (bounds.left - frame.left + bounds.width * 0.65) /
                Math.min(1, window.innerWidth / 900),
              y:
                (bounds.top - frame.top + bounds.height * 0.6) /
                Math.min(1, window.innerWidth / 900),
              visible: true,
            });
        },
        click: () =>
          root.current
            ?.querySelector<HTMLButtonElement>(
              "[data-demo-panel] [data-autofill-start]",
            )
            ?.click(),
        hide: () => setCursor((current) => ({ ...current, visible: false })),
      });
    };
    // The inert iframe cannot receive pointer events; its figure owns activation.
    const target = window.frameElement?.parentElement ?? root.current;
    const events = ["pointerenter", "focusin", "pointerdown"];
    events.forEach((event) => target?.addEventListener(event, start));
    return () => {
      events.forEach((event) => target?.removeEventListener(event, start));
      dispose();
    };
  }, []);
  return (
    <div
      ref={root}
      className={styles.simulation}
      style={{ width: Math.max(900, width), height: 660, zoom: scale }}
    >
      <div className={styles.browserBar}>
        <span>● ● ●</span>
        <div>
          채용사이트 / 입사지원서 <small>예시 화면</small>
        </div>
        <b>커리어폼</b>
      </div>
      <div className={styles.workspace}>
        <ExampleForm started={started} />
        <aside className={styles.sidebar}>
          <div className={styles.panelLocation}>확장 프로그램 · 사이드패널</div>
          <PanelPreview
            onAutofill={async () => setStarted(true)}
            onReturn={() => setStarted(false)}
            autofillView={
              started ? (
                <AutofillOverlay
                  returnInHeader
                  passive
                  onClose={() => setStarted(false)}
                  apiClient={demoAnalysisClient}
                  repository={demoRepository}
                />
              ) : undefined
            }
          />
        </aside>
      </div>
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
