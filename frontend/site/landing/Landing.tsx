import { useEffect } from "react";
import type { TrackEvent } from "../../src/analytics/events";
import { faqs } from "../content";
import { AiScene } from "./AiScene";
import { AlertScene } from "./AlertScene";
import {
  BrandFooter,
  BrandHeader,
  ClosingCta,
  type InstallHandler,
} from "./BrandChrome";
import { TrialScene } from "./TrialScene";
import profileArt from "./assets/O1.webp";
import lockArt from "./assets/O5.webp";
import checkArt from "./assets/O6.webp";
import brand from "./brand.module.css";
import styles from "./Landing.module.css";

const assurances = [
  [
    lockArt,
    "내 정보는 내 브라우저에만",
    "프로필은 사용 중인 Chrome에 저장돼요.",
  ],
  [checkArt, "제출은 언제나 직접", "채운 내용을 확인하고 직접 저장·제출해요."],
  [profileArt, "이름만 넣어도 시작", "학력과 경력은 필요할 때 더하면 돼요."],
] as const;

/** Lets the trial section catch the scroll; removed when the landing unmounts. */
function useScrollSnap() {
  useEffect(() => {
    const root = document.documentElement;
    root.style.scrollSnapType = "y proximity";
    return () => {
      root.style.scrollSnapType = "";
    };
  }, []);
}

export function Landing({
  onInstall,
  track,
}: {
  onInstall: InstallHandler;
  track: TrackEvent;
}) {
  useScrollSnap();
  return (
    <div className={`${brand.brand} ${styles.landing}`}>
      <BrandHeader onInstall={onInstall} fixed />
      <main id="main">
        <AiScene onInstall={onInstall} />
        <TrialScene track={track} onInstall={onInstall} />
        <AlertScene />
        <section className={styles.assurance} aria-labelledby="assurance-title">
          <h2 id="assurance-title">안심하고 쓰세요.</h2>
          <div className={styles.cards}>
            {assurances.map(([art, title, body]) => (
              <article key={title} className={styles.card}>
                <img src={art} alt="" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <div className={styles.closing}>
          <ClosingCta onInstall={onInstall} />
        </div>
        <section className={styles.faq} aria-labelledby="faq-title">
          <h2 id="faq-title">자주 묻는 질문</h2>
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
      </main>
      <BrandFooter current="/" />
    </div>
  );
}
