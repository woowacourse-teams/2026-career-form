import { useState, type RefObject } from "react";
import logo from "../../../site/landing/assets/logo.webp";
import styles from "./Flow.module.css";

const guides = [
  {
    label: "새 공고 알림 받기",
    title: "새 공고가 뜨면 알려드려요",
    body: "알림을 누르면 공고가 새 탭에서 열려요. 놓친 공고는 확장 아이콘의 숫자와 새 공고 탭에서 볼 수 있어요.",
  },
  {
    label: "마감 알림 저장",
    title: "마감 알림을 저장하세요",
    body: "새 공고 탭에서 ‘마감 알림 저장’을 누르면 마감 24시간 전과 2시간 전에 다시 알려드려요.",
  },
  {
    label: "지원 완료 표시",
    title: "지원했다면 완료로 표시하세요",
    body: "‘지원 완료로 표시’를 누르면 남은 알림이 취소되고 완료한 공고로 옮겨져요.",
  },
] as const;

// Illustrations only: the company and posting are made up.
function Figure({ index }: { index: number }) {
  if (index === 0)
    return (
      <div className={styles.toast}>
        <img src={logo} alt="" />
        <div>
          <small>Career Form · 지금</small>
          <b>하늘상사 (~11/20 18:00)</b>
          <span>백엔드 개발자 · 지금 바로 지원하기</span>
        </div>
      </div>
    );
  const done = index === 2;
  return (
    <div className={styles.post}>
      <div>
        <b>하늘상사</b>
        <span>
          {done
            ? "백엔드 개발자 · 지원을 마쳤어요"
            : "백엔드 개발자 · 11/20 18:00 마감"}
        </span>
      </div>
      <span className={done ? `${styles.mark} ${styles.ok}` : styles.mark}>
        {done ? "지원 완료" : "마감 알림 저장"}
      </span>
      <div className={styles.tags}>
        {["24시간 전 알림", "2시간 전 알림"].map((tag) => (
          <span
            key={tag}
            className={done ? `${styles.tg} ${styles.off}` : styles.tg}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Step 4: how alerts are used, three guides the side list jumps between. */
export function AlertsGuideStep({
  heading,
  onBack,
  onNext,
}: {
  heading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [index, setIndex] = useState(0);
  const guide = guides[index];
  return (
    <div className={`${styles.stage} ${styles.one}`}>
      <section className={styles.card}>
        <div className={styles.hg}>
          <p className={styles.eye}>
            알림 안내 {index + 1} / {guides.length}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {guide.title}
          </h1>
          <p className={styles.lead}>{guide.body}</p>
        </div>
        <div className={styles.tut}>
          <ol className={styles.nav} aria-label="알림 안내 단계">
            {guides.map((item, i) => (
              <li key={item.label}>
                <button
                  type="button"
                  className={
                    i === index ? `${styles.navb} ${styles.on}` : styles.navb
                  }
                  aria-current={i === index ? "step" : undefined}
                  onClick={() => setIndex(i)}
                >
                  <span>0{i + 1}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ol>
          <div className={styles.col}>
            <figure className={styles.fig} aria-hidden="true">
              <Figure index={index} />
            </figure>
            <div className={styles.foot}>
              <p className={styles.sm}>
                왼쪽의 번호나 글을 눌러도 그 단계로 이동해요.
              </p>
              <div className={styles.acts}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.ghost}`}
                  onClick={() => (index > 0 ? setIndex(index - 1) : onBack())}
                >
                  이전
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.pri}`}
                  onClick={() =>
                    index < guides.length - 1 ? setIndex(index + 1) : onNext()
                  }
                >
                  다음
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
