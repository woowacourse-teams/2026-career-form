import logo from "../../../../site/landing/assets/logo.webp";
import styles from "./Scene.module.css";

// What the in-page Career Form panel shows; wording follows the real panel.
export type PanelView =
  | { kind: "home" }
  | { kind: "matching" }
  | { kind: "writing"; percent: number }
  | { kind: "results"; done: number };

const Gear = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);

function Tabs() {
  return (
    <div className={styles.pTabs}>
      <span data-current="true">자동 기입</span>
      <span>마감 공고</span>
      <span>내 정보</span>
    </div>
  );
}

/** The Career Form panel as it opens beside an application form. */
export function PanelReplica({
  open,
  view,
  pressed,
}: {
  open: boolean;
  view: PanelView;
  pressed?: string;
}) {
  return (
    <div className={styles.panel} data-panel data-open={open}>
      <div className={styles.pHead}>
        <img src={logo} alt="" />
        <span className={styles.pGear}>
          <Gear />
        </span>
        <span className={styles.pClose}>×</span>
      </div>
      <Tabs />
      {view.kind === "home" && (
        <div className={`${styles.pBody} ${styles.pHome}`}>
          <span
            className={styles.pFill}
            data-cursor="autofill"
            data-pressed={pressed === "autofill"}
          >
            자동 기입
          </span>
        </div>
      )}
      {(view.kind === "matching" || view.kind === "writing") && (
        <div className={`${styles.pBody} ${styles.pLoading}`}>
          <img src="/capybara-writing.png" alt="" />
          <b>
            {view.kind === "writing"
              ? "지원서를 채우고 있어요"
              : "지원서 항목과 프로필 정보를 맞추고 있어요"}
          </b>
          {view.kind === "writing" ? (
            <>
              <small>진행률</small>
              <strong>
                {view.percent}
                <small>%</small>
              </strong>
              <span className={styles.pTrack}>
                <span style={{ width: `${view.percent}%` }} />
              </span>
            </>
          ) : (
            <span className={`${styles.pTrack} ${styles.pIndeterminate}`}>
              <span />
            </span>
          )}
        </div>
      )}
      {view.kind === "results" && (
        <div className={styles.pBody}>
          <div className={styles.pTiles}>
            <span data-current="true">
              <span>확인 필요</span> <strong>1</strong>
            </span>
            <span>
              <span>입력 완료</span> <strong>{view.done}</strong>
            </span>
          </div>
          <small className={styles.pHint}>
            항목명으로 입력칸을 찾고, 값을 복사해 채워 주세요.
          </small>
          <p className={styles.pItem}>
            <b>사진</b>
            <span>파일은 직접 올려 주세요</span>
          </p>
        </div>
      )}
    </div>
  );
}
