import { useCallback, useRef } from "react";
import { InstallLink, type InstallHandler } from "./BrandChrome";
import { SampleForm } from "./SampleForm";
import {
  drawAiFrame,
  measureAiLayout,
  STATUS_TEXT,
  type AiElements,
  type AiLayout,
} from "./ai-frame";
import { filledCount, reviewCount, sampleFields } from "./sample-form";
import { usePrefersReducedMotion, useScrollScene } from "./scroll";
import heroArt from "./assets/C1.webp";
import inspectArt from "./assets/C2.webp";
import profileArt from "./assets/O1.webp";
import sparkleArt from "./assets/O2.webp";
import brand from "./brand.module.css";
import styles from "./AiScene.module.css";

const captions = [
  ["칸을 읽어요", "지원서의 칸과 이름표를 하나씩 살펴봐요."],
  ["무슨 칸인지 이해해요", "칸마다 내 정보 중 무엇이 들어갈지 AI가 판단해요."],
  ["내 정보로 채워요", "등록한 프로필에서 맞는 값을 골라 넣어요."],
  ["애매한 칸은 물어봐요", "확실하지 않은 칸은 비워두고 확인을 요청해요."],
] as const;
const filledFields = sampleFields.filter((f) => f.value);

/** Hero plus the four AI steps, pinned while the visitor scrolls 460vh. */
export function AiScene({ onInstall }: { onInstall: InstallHandler }) {
  const reduced = usePrefersReducedMotion();
  const track = useRef<HTMLElement>(null);
  const els = useRef<AiElements>({ captions: [], flies: [], rows: [] });
  const layoutRef = useRef<AiLayout | null>(null);
  const put =
    <K extends keyof AiElements>(key: K) =>
    (el: AiElements[K] | null) => {
      els.current[key] = el as AiElements[K];
    };

  const layout = useCallback(() => {
    layoutRef.current = measureAiLayout(els.current);
  }, []);
  const render = useCallback(
    (p: number) => {
      if (layoutRef.current)
        drawAiFrame(els.current, layoutRef.current, p, reduced);
    },
    [reduced],
  );
  useScrollScene(track, render, layout);

  return (
    <section ref={track} className={styles.track} aria-label="AI 자동 기입">
      <div ref={put("stage")} className={styles.stage}>
        <div ref={put("hero")} className={styles.hero}>
          <h1>
            지원서 칸,
            <br />
            <em>AI가 읽고</em> 채워요.
          </h1>
          <p>한 번 등록한 내 정보로, 지원서마다 알아서.</p>
          <div className={styles.actions}>
            <a className={brand.primary} href="#try">
              직접 해보기
            </a>
            <InstallLink onInstall={onInstall} className={brand.soft} />
          </div>
          <span className={styles.hint}>
            <i aria-hidden="true" />
            내려서 AI가 채우는 모습을 보세요
          </span>
        </div>

        <div className={styles.captions}>
          {captions.map(([title, body], i) => (
            <div
              key={title}
              ref={(el) => {
                els.current.captions[i] = el;
              }}
              className={styles.caption}
            >
              <span>
                {i + 1} / {captions.length}
              </span>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          ))}
        </div>

        <div ref={put("status")} className={styles.status} aria-hidden="true">
          <img src={sparkleArt} alt="" />
          <span ref={put("statusLabel")}>{STATUS_TEXT[0]}</span>
          <b ref={put("statusCount")} />
        </div>
        <div ref={put("profile")} className={styles.profile}>
          <img src={profileArt} alt="" />
        </div>
        <div ref={put("sparkle")} className={styles.sparkle} aria-hidden="true">
          <img src={sparkleArt} alt="" />
        </div>

        <SampleForm
          idPrefix="ai-field"
          className={styles.form}
          formRef={put("form")}
          rowsRef={put("rowsBox")}
          rowRef={(i, el) => {
            els.current.rows[i] = el;
          }}
          withChips
        >
          <div ref={put("scan")} className={styles.scan} aria-hidden="true" />
        </SampleForm>
        <div ref={put("summary")} className={styles.summary}>
          <span>채움 {filledCount}칸</span>
          <span className={styles.summaryReview}>
            확인 필요 {reviewCount}칸
          </span>
        </div>
        <div ref={put("dots")} className={styles.dots} aria-hidden="true">
          {captions.map(([title]) => (
            <i key={title} />
          ))}
        </div>
        <div aria-hidden="true">
          {filledFields.map((field, i) => (
            <span
              key={field.label}
              ref={(el) => {
                els.current.flies[i] = el;
              }}
              className={styles.fly}
            >
              {field.value}
            </span>
          ))}
        </div>

        <div ref={put("heroCharacter")} className={styles.heroCharacter}>
          <img src={heroArt} alt="지원서를 든 카피바라" />
        </div>
        <div ref={put("inspector")} className={styles.inspector}>
          <img src={inspectArt} alt="돋보기로 살펴보는 카피바라" />
        </div>
      </div>
    </section>
  );
}
