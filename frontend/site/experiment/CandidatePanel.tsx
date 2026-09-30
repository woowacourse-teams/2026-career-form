import writingMascot from "./capybara-writing.png";
import { scenarioFields } from "./scenario";
import styles from "./CandidatePanel.module.css";

export type CandidateId = "reassurance" | "live" | "distraction" | "next";

export function CandidatePanel({
  candidate,
  completed,
  running,
  reducedMotion,
}: {
  candidate: CandidateId;
  completed: number;
  running: boolean;
  reducedMotion: boolean;
}) {
  const latestField = scenarioFields[completed - 1];
  return (
    <section
      className={styles.panel}
      aria-label="대기 화면 후보"
      data-candidate={candidate}
      data-running={running}
      data-reduced-motion={reducedMotion}
    >
      <div className={styles.mascotStage}>
        <img
          className={styles.mascot}
          src={writingMascot}
          width={112}
          height={112}
          alt="지원서를 쓰는 카피바라"
        />
      </div>
      <p className={styles.caption}>지원서를 채우고 있어요</p>
      <div className={styles.detail}>
        {candidate === "reassurance" && (
          <div className={styles.message}>
            <span className={styles.symbol} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3 20 6v6c0 4-5 7-8 9-3-2-8-5-8-9V6l8-3Z" />
                <path d="m8.5 12 2.5 2.5 4.5-5" />
              </svg>
            </span>
            <p>
              자동으로 제출되지 않아요.
              <br />
              완료 후 직접 확인할 수 있어요.
            </p>
          </div>
        )}
        {candidate === "live" && (
          <div className={styles.liveCard}>
            <p className={styles.eyebrow}>방금 입력한 내용</p>
            {latestField ? (
              <div className={styles.liveEntry}>
                <dl>
                  <dt>{latestField.label}</dt>
                  <dd>{latestField.value}</dd>
                </dl>
                <span className={styles.check} aria-label="입력 완료">
                  ✓
                </span>
              </div>
            ) : (
              <p className={styles.placeholder}>
                시작하면 입력한 내용이 여기에 표시돼요.
              </p>
            )}
          </div>
        )}
        {candidate === "distraction" && (
          <div className={styles.paperScene} aria-hidden="true">
            <span className={`${styles.paper} ${styles.backPaper}`} />
            <span className={styles.paper}>
              <i />
              <i />
              <i />
            </span>
            <span className={styles.pencil} />
            <span className={styles.sparkle}>✦</span>
          </div>
        )}
        {candidate === "next" && (
          <div className={styles.message}>
            <span className={styles.symbol} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M14 21H5V3h10l4 4v6M14 3v5h5" />
                <circle cx="16" cy="16" r="3.5" />
                <path d="m18.5 18.5 3 3M8 12h3M8 16h2" />
              </svg>
            </span>
            <p>
              완료되면 입력된 내용을
              <br />
              확인해 주세요.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
