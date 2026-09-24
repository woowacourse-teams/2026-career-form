import { useEffect, useRef, useState } from "react";
import { WorkflowResults } from "../../src/autofill/workflow/WorkflowResults";
import styles from "./ReviewPreview.module.css";

const value = "101동 1001호";
const item = {
  candidateId: "example-detail-address",
  fieldLabel: "상세주소",
  profileFieldKey: "contact.contact.addressLine2",
  profileValue: value,
  previewValue: value,
  currentValue: "",
  status: "unavailable" as const,
  selected: false,
  disabled: true,
  revealed: true,
  reason: "직접 입력 필요",
};

/** A single synthetic scene; never reads a profile or the system clipboard. */
export function ReviewPreview() {
  const root = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const [width, setWidth] = useState(window.innerWidth);
  const scale = Math.min(1, width / 760);
  const [run, setRun] = useState(0);
  const [pasted, setPasted] = useState(false);
  const [cursor, setCursor] = useState({
    x: 560,
    y: 80,
    visible: false,
    pressed: false,
  });
  const start = () => {
    if (running.current) return;
    running.current = true;
    setPasted(false);
    setRun((current) => current + 1);
  };
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!run) return;
    const move = (selector: string) => {
      const target = root.current
        ?.querySelector(selector)
        ?.getBoundingClientRect();
      const origin = root.current?.getBoundingClientRect();
      if (target && origin)
        setCursor({
          x: (target.left - origin.left + target.width / 2) / scale,
          y: (target.top - origin.top + target.height / 2) / scale,
          visible: true,
          pressed: false,
        });
    };
    const timers = [
      window.setTimeout(() => move('[aria-label="상세주소 복사"]'), 100),
      window.setTimeout(() => {
        root.current
          ?.querySelector<HTMLButtonElement>('[aria-label="상세주소 복사"]')
          ?.click();
        setCursor((current) => ({ ...current, pressed: true }));
      }, 750),
      window.setTimeout(() => move("#example-address-detail"), 1300),
      window.setTimeout(() => {
        setPasted(true);
        setCursor((current) => ({ ...current, pressed: true }));
      }, 2000),
      window.setTimeout(() => {
        running.current = false;
      }, 3000),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [run, scale]);
  return (
    <div
      ref={root}
      className={styles.preview}
      style={{ width: Math.max(760, width), zoom: scale }}
      onPointerEnter={start}
      onPointerDown={start}
      onFocus={start}
      tabIndex={0}
      aria-label="복사해서 지원서에 붙여넣는 시연"
    >
      <div className={styles.caption}>
        <strong>남은 항목은 복사해서 마무리하세요.</strong>
        <span>{run ? "가상 정보로 만든 예시" : "마우스를 올려보세요"}</span>
      </div>
      <div className={styles.form} aria-label="예시 지원서">
        <span className={styles.eyebrow}>지원서 작성</span>
        <h3>연락처와 주소</h3>
        <label htmlFor="example-address">기본주소</label>
        <input
          id="example-address"
          value="예시시 가상로 100"
          readOnly
          tabIndex={-1}
        />
        <label htmlFor="example-address-detail">상세주소</label>
        <input
          id="example-address-detail"
          value={pasted ? value : ""}
          readOnly
          tabIndex={-1}
          placeholder="상세주소를 입력하세요"
          data-filled={pasted}
        />
        <p className={styles.feedback} role="status">
          {pasted ? "붙여넣었어요" : "\u00a0"}
        </p>
      </div>
      <div className={styles.panel} aria-label="지원서 패널 예시" inert>
        <div className={styles.panelHeading}>
          CAREER FORM <span>지원서 패널</span>
        </div>
        <WorkflowResults
          key={run}
          reviewItems={[item]}
          results={[
            {
              candidateId: item.candidateId,
              status: "skipped",
              reason: "직접 입력 필요",
            },
          ]}
          copyText={async () => {
            /* Simulated copying stays inside this scene. */
          }}
        />
      </div>
      <svg
        className={styles.cursor}
        aria-hidden="true"
        data-visible={cursor.visible}
        data-pressed={cursor.pressed}
        style={{ left: cursor.x, top: cursor.y }}
        width="32"
        height="40"
        viewBox="0 0 32 40"
      >
        <path
          d="M3 2 L3 29 L10 23 L16 36 L22 33 L16 21 L27 21 Z"
          fill="#594637"
          stroke="white"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
