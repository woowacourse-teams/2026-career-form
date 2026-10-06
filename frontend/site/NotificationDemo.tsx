import { useEffect, useRef, useState } from "react";
import logo from "../public/side-panel-launcher-logo.png";
import styles from "./NotificationDemo.module.css";

export function NotificationDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={root}
      className={styles.demo}
      role="region"
      aria-label="마감 알림 동작 미리보기"
    >
      <div className={styles.toolbar}>
        <span>알림 도착 → 클릭 → 공고 확인</span>
        <div>
          <button type="button" onClick={() => setPaused(!paused)}>
            {paused ? "계속 재생" : "일시정지"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRun(run + 1);
              setVisible(true);
              setPaused(false);
            }}
          >
            다시 보기
          </button>
        </div>
      </div>
      <div
        key={run}
        className={styles.stage}
        data-paused={!visible || paused}
        aria-hidden="true"
      >
        <div className={styles.desktop}>
          <div className={styles.tabBar}>
            <div className={styles.windowControls}>
              <i />
              <i />
              <i />
            </div>
            <div className={styles.browserTab}>
              새 탭 <span>×</span>
            </div>
            <span className={styles.newTab}>＋</span>
          </div>
          <div className={styles.addressBar}>
            <span>←</span>
            <span>→</span>
            <span>⟳</span>
            <div className={styles.address}>검색 또는 URL 입력</div>
            <span>⋮</span>
          </div>
          <div className={styles.blankPage} />
        </div>
        <div className={styles.notice}>
          <img src={logo} alt="" />
          <div>
            <small>Career Form · 지금</small>
            <strong>🚨 올리브영 (~10/7 18:00)</strong>
            <span>지금 바로 지원하기 →</span>
          </div>
        </div>
        <svg className={styles.cursor} viewBox="0 0 28 36">
          <path
            d="M2 2v27l7-7 6 12 5-3-6-11h11Z"
            fill="#111"
            stroke="white"
            strokeWidth="1.5"
          />
        </svg>
        <span className={styles.click} />
        <div className={styles.result}>
          <span className={styles.brand}>OLIVE YOUNG</span>
          <small>저장한 공고가 열렸어요</small>
          <strong>백엔드 개발자 채용</strong>
          <p>공고 내용을 확인하고 지원을 이어가세요.</p>
          <span className={styles.apply}>지원하기 ↗</span>
        </div>
      </div>
      <p className={styles.caption}>
        동작을 설명하는 예시예요. 실제 알림 모양은 운영체제에 따라 달라요.
      </p>
    </div>
  );
}
