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
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <form
      className={`${styles.card} ${styles.survey}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (ratings.comfort && ratings.trust && ratings.wait)
          onSave(ratings as Ratings);
      }}
    >
      <h2 tabIndex={-1} ref={heading}>
        방금 체험은 어땠나요?
      </h2>
      <p id="rating-scale">1 = 전혀 그렇지 않다 · 5 = 매우 그렇다</p>
      {questions.map(([key, label]) => (
        <fieldset key={key} aria-describedby="rating-scale">
          <legend>{label}</legend>
          <div className={styles.scale}>
            {[1, 2, 3, 4, 5].map((score) => (
              <label key={score}>
                <input
                  type="radio"
                  name={key}
                  value={score}
                  required
                  checked={ratings[key] === score}
                  onChange={() =>
                    setRatings((current) => ({ ...current, [key]: score }))
                  }
                />
                {score}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button
        type="submit"
        disabled={!ratings.comfort || !ratings.trust || !ratings.wait}
      >
        평가 저장
      </button>
    </form>
  );
}
