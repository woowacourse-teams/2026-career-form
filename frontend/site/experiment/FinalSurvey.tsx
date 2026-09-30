import { useEffect, useRef, useState } from "react";
import { LoadingVariant } from "./LoadingVariant";
import { exportStudy, type Preference, type Study } from "./study";
import styles from "./Experiment.module.css";
const ordinals = ["첫 번째", "두 번째"];
export function FinalSurvey({
  study,
  onChange,
}: {
  study: Study;
  onChange: (preference: Preference, reason: string) => void;
}) {
  const [preference, setPreference] = useState<Preference | "">(
    study.final?.preference ?? "",
  );
  const reason = "";
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const urls = useRef(new Set<string>());
  useEffect(() => {
    heading.current?.focus();
    const activeUrls = urls.current;
    return () => {
      activeUrls.forEach((url) => URL.revokeObjectURL(url));
      activeUrls.clear();
    };
  }, []);
  const download = () => {
    if (!preference) return;
    try {
      const result = exportStudy(study, preference, reason);
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `career-form-panel-study-${Date.now()}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Keep the URL alive until the browser has consumed the download.
      setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }, 1000);
      setMessage(
        "응답을 이 브라우저에 저장했어요. 결과 파일 다운로드도 시작했어요. 수집을 완료하려면 파일을 실험 진행자에게 전달해 주세요.",
      );
    } catch {
      setMessage(
        "응답 파일을 저장하지 못했어요. 응답 저장하기를 다시 눌러 주세요.",
      );
    }
  };
  return (
    <form
      className={`${styles.card} ${styles.survey} ${styles.finalSurvey}`}
      onSubmit={(event) => {
        event.preventDefault();
        download();
      }}
    >
      <h2 ref={heading} tabIndex={-1}>
        마지막으로, 어떤 체험이 가장 좋았나요?
      </h2>
      <p>
        체험했던 순서대로 두 화면을 나란히 보여드려요. 하나를 선택해 주세요.
      </p>
      <p className={styles.scrollHint}>
        좁은 화면에서는 좌우로 밀어 비교할 수 있어요.
      </p>
      <fieldset>
        <legend>가장 선호한 체험</legend>
        <div
          className={styles.previews}
          role="group"
          aria-label="체험 화면 비교"
          tabIndex={0}
        >
          {study.order.map((variant, index) => (
            <div className={styles.preview} key={variant}>
              <label>
                <input
                  type="radio"
                  name="preference"
                  value={variant}
                  checked={preference === variant}
                  onChange={() => {
                    setPreference(variant);
                    onChange(variant, reason);
                  }}
                />
                {ordinals[index]} 체험
              </label>
              <div aria-hidden="true" inert>
                <LoadingVariant
                  variant={variant}
                  completed={20}
                  reducedMotion
                />
              </div>
            </div>
          ))}
        </div>
        <label className={styles.none}>
          <input
            type="radio"
            name="preference"
            value="none"
            checked={preference === "none"}
            onChange={() => {
              setPreference("none");
              onChange("none", reason);
            }}
          />
          차이 없음
        </label>
      </fieldset>
      <p>
        현재 응답은 이 브라우저에 보관되며, 저장 버튼을 누르면 전달용 파일도
        내려받아요.
      </p>
      <button type="submit" disabled={!preference}>
        응답 저장하기
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
