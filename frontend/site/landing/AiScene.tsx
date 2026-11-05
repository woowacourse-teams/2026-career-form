import { useCallback, useRef } from "react";
import {
  collectAiElements,
  drawAiFrame,
  measureAiLayout,
  type AiElements,
  type AiLayout,
} from "./ai-frame";
import { InstallLink, type InstallHandler } from "./BrandChrome";
import { useHandoff } from "./handoff";
import { JevConsole } from "./JevConsole";
import {
  AI_PLAYBACK,
  CERTAINTY_WORD,
  FIELD_GROUPS,
  JEV_CAPTIONS,
  certainty,
  percent,
} from "./jev";
import { SampleForm } from "./SampleForm";
import { SendToPc } from "./SendToPc";
import { filledCount, reviewCount, sampleFields } from "./sample-form";
import { usePrefersReducedMotion } from "./scroll";
import { useSteppedScene } from "./useSteppedScene";
import heroArt from "./assets/C1.webp";
import inspectArt from "./assets/C2.webp";
import sparkleArt from "./assets/O2.webp";
import brand from "./brand.module.css";
import styles from "./AiScene.module.css";

const LINES = [0, 1, 2, 3];

/**
 * Hero plus the seven 의사결정 AI(JEV) steps, pinned while the visitor scrolls.
 * Scrolling picks the step; each step then plays through on its own.
 */
export function AiScene({ onInstall }: { onInstall: InstallHandler }) {
  const reduced = usePrefersReducedMotion();
  const track = useRef<HTMLElement>(null);
  const els = useRef<AiElements | null>(null);
  const layoutRef = useRef<AiLayout | null>(null);
  const layout = useCallback(() => {
    if (!track.current) return;
    els.current = collectAiElements(track.current);
    layoutRef.current = measureAiLayout(els.current);
  }, []);
  const render = useCallback(
    (p: number) => {
      if (els.current && layoutRef.current)
        drawAiFrame(els.current, layoutRef.current, p, reduced);
    },
    [reduced],
  );
  useSteppedScene(track, AI_PLAYBACK, render, layout, reduced);

  return (
    <section
      ref={track}
      className={styles.track}
      aria-label="의사결정 AI 자동 기입"
    >
      <div className={styles.stage} data-ai="stage">
        <div className={styles.dotGrid} data-ai="dotGrid" aria-hidden="true" />
        <Hero onInstall={onInstall} />
        <div className={styles.captions} data-ai="captions">
          {JEV_CAPTIONS.map(([title, body], i) => (
            <div key={title} className={styles.caption} data-ai-caption>
              <span>
                {i + 1} / {JEV_CAPTIONS.length}
              </span>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <div className={styles.status} data-ai="status" aria-hidden="true">
          <img src={sparkleArt} alt="" />
          <span data-ai="statusLabel">JEV</span>
          <b data-ai="statusCount" />
        </div>
        <div className={styles.sparkle} data-ai="sparkle" aria-hidden="true">
          <img src={sparkleArt} alt="" />
        </div>
        <AiForm />
        <svg className={styles.links} aria-hidden="true">
          {LINES.map((k) => (
            <g key={k}>
              <path data-ai-line />
              <circle r="4" data-ai-line-end />
            </g>
          ))}
        </svg>
        <JevConsole />
        <svg
          className={styles.cursor}
          data-ai="cursor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M5 2.5v17.2l4.6-4.3 2.9 6.6 3-1.3-2.9-6.5h6.2z" />
        </svg>
        <div className={styles.summary} data-ai="summary">
          <span>채움 {filledCount}칸</span>
          <span className={styles.summaryReview}>
            확인 필요 {reviewCount}칸
          </span>
        </div>
        <div className={styles.dots} data-ai="dots" aria-hidden="true">
          {JEV_CAPTIONS.map(([title]) => (
            <i key={title} />
          ))}
        </div>
        <div className={styles.flyLayer} aria-hidden="true">
          {sampleFields
            .filter((f) => f.value)
            .map((f) => (
              <span key={f.label} className={styles.fly} data-ai-fly>
                {f.value}
              </span>
            ))}
        </div>
        <div className={styles.heroCharacter} data-ai="heroCharacter">
          <img src={heroArt} alt="지원서를 든 카피바라" />
        </div>
        <div className={styles.inspector} data-ai="inspector">
          <img src={inspectArt} alt="돋보기로 살펴보는 카피바라" />
        </div>
      </div>
    </section>
  );
}

function Hero({ onInstall }: { onInstall: InstallHandler }) {
  const handoff = useHandoff();
  return (
    <div className={styles.hero} data-ai="hero">
      <h1>
        지원서 칸,
        <br />
        <em>AI가 읽고</em> 채워요.
      </h1>
      <p>한 번 등록한 내 정보로, 지원서마다 알아서.</p>
      {handoff ? (
        <div className={styles.actions}>
          <SendToPc />
          <small className={styles.handoffNote}>
            커리어폼은 PC Chrome 확장 프로그램이에요. 링크를 보내 두고 PC에서
            이어서 써보세요.
          </small>
        </div>
      ) : (
        <div className={styles.actions}>
          <a className={brand.primary} href="#try">
            직접 해보기
          </a>
          <InstallLink onInstall={onInstall} className={brand.soft} />
        </div>
      )}
      <span className={styles.hint}>
        <i aria-hidden="true" />
        내려서 AI가 채우는 모습을 보세요
      </span>
    </div>
  );
}

/** The sample form with group labels, brackets and confidence pills. */
function AiForm() {
  return (
    <div data-ai="form" className={styles.formSlot}>
      <SampleForm
        idPrefix="ai-field"
        className={styles.form}
        fieldExtra={(i) => {
          const c = sampleFields[i].confidence;
          return (
            <span
              className={styles.confidence}
              data-certainty={certainty(c)}
              data-ai-confidence
            >
              {CERTAINTY_WORD[certainty(c)]} {percent(c)}
            </span>
          );
        }}
      >
        <div className={styles.scan} data-ai="scan" aria-hidden="true" />
        <span
          data-ai="rowsBox"
          className={styles.rowsAnchor}
          aria-hidden="true"
        />
        {FIELD_GROUPS.map((g) => (
          <div key={g.name} className={styles.group} data-ai-group>
            <span>
              {g.name} · {g.to - g.from + 1}칸
            </span>
            <b>AI 판단 · {CERTAINTY_WORD[certainty(g.confidence)]}</b>
          </div>
        ))}
        {FIELD_GROUPS.map((g) => (
          <div
            key={g.name}
            className={styles.bracket}
            data-ai-bracket
            aria-hidden="true"
          />
        ))}
      </SampleForm>
    </div>
  );
}
