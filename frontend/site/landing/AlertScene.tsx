import { useCallback, useRef } from "react";
import {
  ALERT_PLAYBACK,
  drawAlertFrame,
  measureAlertLayout,
  ringBell,
  type AlertElements,
  type AlertLayout,
} from "./alert-frame";
import { SAMPLE_COMPANY } from "./sample-form";
import { usePrefersReducedMotion } from "./scroll";
import { useSteppedScene } from "./useSteppedScene";
import bellCharacter from "./assets/C4.webp";
import logo from "./assets/logo.webp";
import bellArt from "./assets/O3.webp";
import clockArt from "./assets/O4.webp";
import stampArt from "./assets/O6.webp";
import styles from "./AlertScene.module.css";

const TICKS = [
  { label: "하루 전", time: "11/19 18:00" },
  { label: "2시간 전", time: "11/20 16:00" },
  { label: "마감", time: "11/20 18:00" },
];

/**
 * Posting card, deadline axis and the two notifications, pinned while the
 * visitor scrolls. Scrolling picks the beat; each beat then plays through.
 */
export function AlertScene() {
  const reduced = usePrefersReducedMotion();
  const track = useRef<HTMLElement>(null);
  const els = useRef<AlertElements>({ ticks: [], labels: [] });
  const layoutRef = useRef<AlertLayout | null>(null);
  const rang = useRef(false);
  const put =
    <K extends keyof AlertElements>(key: K) =>
    (el: AlertElements[K] | null) => {
      els.current[key] = el as AlertElements[K];
    };

  const layout = useCallback(() => {
    layoutRef.current = measureAlertLayout(els.current);
  }, []);
  const render = useCallback(
    (p: number) => {
      if (!layoutRef.current) return;
      const arrived = drawAlertFrame(
        els.current,
        layoutRef.current,
        p,
        reduced,
      );
      const character = els.current.character;
      if (arrived && !rang.current && !reduced && character)
        ringBell(character);
      rang.current = arrived;
    },
    [reduced],
  );
  useSteppedScene(track, ALERT_PLAYBACK, render, layout, reduced);

  return (
    <section
      ref={track}
      id="alerts"
      className={styles.track}
      aria-labelledby="alerts-title"
    >
      <div ref={put("stage")} className={styles.stage}>
        <div ref={put("caption")} className={styles.caption}>
          <h2 id="alerts-title">
            관심 공고는
            <br />
            마감 전에 다시 알려드려요.
          </h2>
          <p>하루 전, 2시간 전. 알림 시간은 바꿀 수 있어요.</p>
        </div>
        <div ref={put("axis")} className={styles.axis} aria-hidden="true" />
        {TICKS.map((tick, i) => (
          <div
            key={tick.label}
            ref={(el) => {
              els.current.ticks[i] = el;
            }}
            className={i === 2 ? styles.tickEnd : styles.tick}
            aria-hidden="true"
          />
        ))}
        {TICKS.map((tick, i) => (
          <div
            key={tick.label}
            ref={(el) => {
              els.current.labels[i] = el;
            }}
            className={styles.label}
          >
            <b>{tick.label}</b>
            {tick.time}
          </div>
        ))}
        <img
          ref={put("clock")}
          className={styles.clock}
          src={clockArt}
          alt=""
        />

        <div ref={put("post")} className={styles.post}>
          <img className={styles.postLogo} src={logo} alt="" />
          <b>{SAMPLE_COMPANY}</b>
          <span>백엔드 개발자 신입</span>
          <div className={styles.deadline}>
            <span>마감</span>
            <em>11월 20일 (금) 18:00</em>
          </div>
          <div className={styles.applied}>
            지원 완료로 표시
            <span ref={put("applied")}>지원 완료</span>
          </div>
        </div>
        <img
          ref={put("stamp")}
          className={styles.stamp}
          src={stampArt}
          alt=""
        />

        <div ref={put("firstAlert")} className={styles.toast}>
          <img src={bellArt} alt="" />
          <b>{SAMPLE_COMPANY} (~11/20 18:00)</b>
          <span>마감까지 하루 남았어요. 지금 지원하기</span>
        </div>
        <div
          ref={put("cancelled")}
          className={`${styles.toast} ${styles.toastCancelled}`}
        >
          <img src={bellArt} alt="" />
          <b>2시간 전 알림 취소</b>
          <span>지원 완료라서 더 알리지 않아요</span>
        </div>

        <div ref={put("character")} className={styles.character}>
          <img src={bellCharacter} alt="벨을 든 카피바라" />
        </div>
      </div>
    </section>
  );
}
