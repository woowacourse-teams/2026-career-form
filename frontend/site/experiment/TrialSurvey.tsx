import { useEffect, useRef, useState } from "react";
import type { Ratings } from "./study";
import styles from "./Experiment.module.css";
const questions = [
  ["comfort", "기다리는 동안 편안했다"],
  ["trust", "자동입력이 잘 진행되고 있다고 느꼈다"],
  ["wait", "기다리는 시간이 길게 느껴졌다"],
] as const;
export function TrialSurvey({
  onSave,
}: {
  onSave: (ratings: Ratings) => void;
}) {
  const [ratings, setRatings] = useState<Partial<Ratings>>({});
  const answered = Object.keys(ratings).length;
  const scoreLabels = [
    "전혀 아니다",
    "아니다",
    "보통이다",
    "그렇다",
    "매우 그렇다",
  ];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <form
      className={`${styles.card} ${styles.survey} ${styles.trialSurvey}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (ratings.comfort && ratings.trust && ratings.wait)
          onSave(ratings as Ratings);
      }}
    >
      <header className={styles.ratingHeader}>
        <span className={styles.ratingEyebrow}>체험 돌아보기</span>
        <h2 tabIndex={-1} ref={heading}>
          방금 체험은 어땠나요?
        </h2>
        <p id="rating-scale">방금 느낀 점에 가까운 답을 골라주세요.</p>
      </header>
      {questions.map(([key, label], index) => (
        <fieldset key={key} className={styles.questionCard}>
          <legend>
            <span aria-hidden="true" className={styles.questionNumber}>
              0{index + 1}
            </span>
            {label}
          </legend>
          <div className={styles.scale}>
            {[1, 2, 3, 4, 5].map((score) => (
              <label key={score}>
                <input
                  type="radio"
                  aria-label={String(score)}
                  aria-describedby={`${key}-${score}-meaning`}
                  name={key}
                  value={score}
                  required
                  checked={ratings[key] === score}
                  onChange={() =>
                    setRatings((current) => ({ ...current, [key]: score }))
                  }
                />
                <span className={styles.scoreNumber} aria-hidden="true">
                  {score}
                </span>
                <span
                  className={styles.scoreMeaning}
                  id={`${key}-${score}-meaning`}
                >
                  {scoreLabels[score - 1]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className={styles.ratingFooter}>
        <p aria-live="polite">
          <strong>{answered}</strong> / 3개 응답
          <span>
            {answered === 3
              ? "모두 답했어요. 평가를 저장해 주세요."
              : "세 문항에 모두 답해 주세요."}
          </span>
        </p>
        <button
          type="submit"
          disabled={!ratings.comfort || !ratings.trust || !ratings.wait}
        >
          평가 저장
        </button>
      </div>
    </form>
  );
}
