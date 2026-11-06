import { useState, type ReactNode } from "react";
import logo from "../../../site/landing/assets/logo.webp";
import styles from "./Flow.module.css";

/** Pause state for a looping scene; reduced motion is handled in CSS. */
export function usePause() {
  const [paused, setPaused] = useState(false);
  return { paused, toggle: () => setPaused((value) => !value) };
}

export function LoopBar({
  label,
  paused,
  onToggle,
}: {
  label: string;
  paused: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.loopbar}>
      <span>{label}</span>
      <button
        type="button"
        className={`${styles.btn} ${styles.soft} ${styles.small}`}
        aria-pressed={paused}
        onClick={onToggle}
      >
        {paused ? "계속 재생" : "일시정지"}
      </button>
    </div>
  );
}

const Cursor = () => (
  <svg className={styles.cur} viewBox="0 0 28 36">
    <path
      d="M2 2v27l7-7 6 12 5-3-6-11h11Z"
      fill="#111111"
      stroke="#ffffff"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

// Every value in the scenes is made up.
const sampleRows: readonly [string, string][] = [
  ["이름", "김하늘"],
  ["이메일", "haneul@example.com"],
  ["전화번호", "010-1234-5678"],
  ["생년월일", "2000-02-23"],
  ["학교", "하늘대학교"],
];

function SampleWindow({
  title,
  rows,
  panel,
}: {
  title: string;
  rows: ReactNode;
  panel: ReactNode;
}) {
  return (
    <div className={styles.win} aria-hidden="true">
      <div className={styles.winbar}>
        <i />
        <i />
        <i />
        <span>{title}</span>
      </div>
      <div className={styles.winbody}>
        <div className={styles.form}>
          <p className={styles.ft}>입사지원서 · 인적사항</p>
          <div className={styles.rows}>{rows}</div>
        </div>
        <div className={styles.pnl}>{panel}</div>
      </div>
    </div>
  );
}

/** Autofill: the pointer presses 자동 기입 and the form fills row by row. */
export function FillScene() {
  return (
    <SampleWindow
      title="가상 지원서"
      rows={
        <>
          {sampleRows.map(([label, value]) => (
            <div key={label} className={styles.row}>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
          <div className={`${styles.row} ${styles.rev}`}>
            <span>병역</span>
            <b>직접 확인 필요</b>
          </div>
        </>
      }
      panel={
        <>
          <p className={styles.ph}>
            <img src={logo} alt="" />
            Career Form
          </p>
          <span className={styles.fill}>자동 기입</span>
          <div className={styles.stbox}>
            <span className={styles.st1}>지원서를 채우는 중이에요</span>
            <span className={styles.st2}>입력 완료 5 · 확인 필요 1</span>
          </div>
          <Cursor />
        </>
      }
    />
  );
}

/** Greeting import: gear, 프로필 가져오기, then the saved confirmation. */
export function ImportScene() {
  return (
    <SampleWindow
      title="써 둔 지원서"
      rows={[...sampleRows, ["전공", "컴퓨터공학"] as const].map(
        ([label, value]) => (
          <div key={label} className={`${styles.row} ${styles.ok}`}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ),
      )}
      panel={
        <>
          <p className={styles.ph}>
            <img src={logo} alt="" />
            Career Form
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
            </svg>
          </p>
          <div className={styles.gbox}>
            <div className={styles.menu}>
              <span className={styles.hi}>프로필 가져오기</span>
              <span>프로필 관리</span>
            </div>
            <div className={styles.got}>
              <span>이름·연락처</span>
              <span>생년월일</span>
              <span>학교·전공</span>
              <b>프로필에 저장했어요</b>
            </div>
          </div>
          <Cursor />
        </>
      }
    />
  );
}
