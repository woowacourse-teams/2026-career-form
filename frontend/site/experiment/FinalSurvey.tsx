import { useEffect, useRef, useState } from "react";
import { LoadingVariant } from "./LoadingVariant";
import { exportStudy, type Preference, type Study } from "./study";
import styles from "./Experiment.module.css";
const ordinals = ["첫 번째", "두 번째", "세 번째", "네 번째"];
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
  const [reason, setReason] = useState(study.final?.reason ?? "");
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
        "결과 파일 내려받기를 시작했어요. 파일을 실험 진행자에게 전달해 주세요.",
      );
    } catch {
      setMessage("파일을 만들지 못했어요. 다시 내려받기를 눌러 주세요.");
    }
  };
  return (
    <form
      className={`${styles.card} ${styles.survey}`}
      onSubmit={(event) => {
        event.preventDefault();
        download();
      }}
    >
      <h2 ref={heading} tabIndex={-1}>
        마지막으로, 어떤 체험이 가장 좋았나요?
      </h2>
      <p>체험했던 순서대로 화면 예시를 보여드려요. 하나를 선택해 주세요.</p>
      <fieldset>
        <legend>가장 선호한 체험</legend>
        <div className={styles.previews}>
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
                <LoadingVariant variant={variant} completed={5} reducedMotion />
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
      <label htmlFor="reason">선택 이유 (선택)</label>
      <p id="reason-help">이름, 연락처 등 개인정보는 적지 말아 주세요.</p>
      <textarea
        id="reason"
        maxLength={2000}
        aria-describedby="reason-help"
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          if (preference) onChange(preference, event.target.value);
        }}
      />
      <button type="submit" disabled={!preference}>
        결과 JSON 내려받기
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
