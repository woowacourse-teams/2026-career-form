import logo from "../../../../site/landing/assets/logo.webp";
import styles from "./Scene.module.css";

// What the in-page Career Form panel shows; wording follows the real panel.
export type PanelView =
  | { kind: "home"; menu?: boolean }
  | { kind: "matching" }
  | { kind: "writing"; percent: number }
  | { kind: "results"; done: number }
  | { kind: "import"; confirmed: boolean }
  | { kind: "saved"; count: number };

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

function ImportBody({
  confirmed,
  pressed,
}: {
  confirmed: boolean;
  pressed?: string;
}) {
  const count = confirmed ? 6 : 5;
  return (
    <>
      <div className={styles.pBack}>
        <span>‹</span>
        <b>프로필 가져오기</b>
        {!confirmed && <small>확인 1 / 1</small>}
      </div>
      <div className={styles.pBody}>
        <p className={styles.pCount}>
          <strong>{count}</strong>
          <span>개 가져오기</span>
        </p>
        <p className={styles.pChips}>
          <span data-tone="new">새로 추가 {count}</span>
          <span data-tone="new">기존 값 변경 0</span>
          <span data-tone="same">이미 같음 2</span>
        </p>
        {confirmed ? (
          <p className={styles.pRow}>
            <span>영문 이름</span>
            <b>성 Kim, 이름 Haneul</b>
            <em>수정</em>
          </p>
        ) : (
          <>
            <p className={styles.pAsk}>
              확인해 주세요 <i>1</i>
            </p>
            <div className={styles.pConfirm}>
              <small>영문 이름: Kim Haneul</small>
              <b>이렇게 나눌까요?</b>
              <span className={styles.pSplit}>
                <span>
                  <small>성</small>Kim
                </span>
                <span>
                  <small>이름</small>Haneul
                </span>
              </span>
              <span className={styles.pAnswers}>
                <span
                  className={styles.pYes}
                  data-cursor="confirm-yes"
                  data-pressed={pressed === "confirm-yes"}
                >
                  맞아요
                </span>
                <span className={styles.pNo}>아니에요</span>
                <em>나중에</em>
              </span>
            </div>
          </>
        )}
        <span
          className={styles.pSave}
          data-ready={confirmed}
          data-cursor="save"
          data-pressed={pressed === "save"}
        >
          프로필에 저장 <b>{count}</b>
        </span>
        {!confirmed && (
          <small className={styles.pNote}>
            확인하지 않은 1개는 빼고 저장해요
          </small>
        )}
      </div>
    </>
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
  const importing = view.kind === "import" || view.kind === "saved";
  return (
    <div className={styles.panel} data-panel data-open={open}>
      <div className={styles.pHead}>
        <img src={logo} alt="" />
        <span
          className={styles.pGear}
          data-cursor="gear"
          data-pressed={pressed === "gear"}
          data-on={view.kind === "home" && view.menu === true}
        >
          <Gear />
        </span>
        <span className={styles.pClose}>×</span>
      </div>
      {view.kind === "home" && view.menu && (
        <div className={styles.pMenu}>
          <span
            data-cursor="menu-import"
            data-pressed={pressed === "menu-import"}
          >
            프로필 가져오기
          </span>
          <span>프로필 관리</span>
        </div>
      )}
      {!importing && <Tabs />}
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
      {view.kind === "import" && (
        <ImportBody confirmed={view.confirmed} pressed={pressed} />
      )}
      {view.kind === "saved" && (
        <>
          <div className={styles.pBack}>
            <span>‹</span>
            <b>프로필 가져오기</b>
          </div>
          <div className={`${styles.pBody} ${styles.pSaved}`}>
            <span className={styles.pCheck} />
            <strong>프로필에 {view.count}개를 저장했어요</strong>
            <small>이제 다른 지원서에서도 자동 기입에 쓰여요</small>
          </div>
        </>
      )}
    </div>
  );
}
