import { useEffect, useRef, useState } from "react";
import { PendingResultRow } from "../../src/autofill/workflow/PendingResultRow";
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
  const [phase, setPhase] = useState("idle");
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
    setPhase("copy");
    setRun((current) => current + 1);
  };
  useEffect(() => {
    if (!run) return;
    const move = (selector: string) => {
      const target = root.current
        ?.querySelector(selector)
        ?.getBoundingClientRect();
      const origin = root.current?.getBoundingClientRect();
      if (target && origin)
        setCursor({
          x: target.left - origin.left + target.width / 2,
          y: target.top - origin.top + target.height / 2,
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
        setPhase("copied");
      }, 900),
      window.setTimeout(() => {
        setPhase("paste");
        move("#example-address-detail");
      }, 2100),
      window.setTimeout(() => {
        setPasted(true);
        setPhase("done");
        running.current = false;
        setCursor((current) => ({ ...current, pressed: true }));
      }, 3100),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [run]);
  return (
    <div
      ref={root}
      className={styles.preview}
      data-phase={phase}
      onPointerEnter={start}
      onPointerDown={start}
      onFocus={start}
      tabIndex={0}
      aria-label="복사해서 지원서에 붙여넣는 시연"
    >
      <div className={styles.caption}>
        <strong>상세주소 한 칸이 남았어요.</strong>
        <span>자동 입력 후 · 가상 예시</span>
      </div>
      <div className={styles.scene}>
        <div className={styles.form} aria-label="예시 지원서">
          <h3>지원서</h3>
          <label htmlFor="example-address-detail">상세주소</label>
          <input
            id="example-address-detail"
            value={pasted ? value : ""}
            readOnly
            tabIndex={-1}
            placeholder="비어 있는 칸"
            data-filled={pasted}
          />
          <p className={styles.feedback}>
            {pasted ? "붙여넣기 완료" : "이 칸에 넣을 거예요"}
          </p>
        </div>
        <div className={styles.panel} aria-label="지원서 패널 예시" inert>
          <h3>커리어폼</h3>
          <div className={styles.pending}>
            확인 필요 <strong>1</strong>
          </div>
          <PendingResultRow
            key={run}
            entry={{
              id: item.candidateId,
              item,
              reason: item.reason,
              written: false,
            }}
            copyText={async () => {
              /* No access to the system clipboard. */
            }}
          />
        </div>
      </div>
      <div className={styles.playback}>
        <p role="status">
          {
            {
              idle: "오른쪽 값을 복사해 왼쪽 칸에 넣어볼게요.",
              copy: "패널에서 ‘복사’를 눌러요.",
              copied: "상세주소를 복사했어요.",
              paste: "지원서의 빈 칸에 붙여넣어요.",
              done: "남은 칸을 채웠어요.",
            }[phase]
          }
        </p>
        <button type="button" onClick={start}>
          {phase === "idle"
            ? "시연 보기"
            : phase === "done"
              ? "다시 보기"
              : "재생 중"}
        </button>
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
