import { useEffect, useId, useRef, useState } from "react";
import styles from "./QuickStart.module.css";

function dateError(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000")) {
    const date = new Date(`${value}T00:00:00Z`);
    if (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    )
      return "";
  }
  return "날짜를 확인해 주세요. 예: 20240302 또는 2024-03-02. 모르면 비우거나 이 질문을 건너뛰세요.";
}

export function QuickStartDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const calendar = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [showError, setShowError] = useState(false);
  const error = dateError(draft);
  useEffect(() => {
    input.current?.setCustomValidity(error);
  }, [error]);
  function change(raw: string) {
    const text = raw.trim();
    const next = /^\d{8}$/.test(text)
      ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`
      : text;
    const problem = dateError(next);
    setDraft(next);
    setShowError(false);
    input.current?.setCustomValidity(problem);
    if (!problem) onChange(next);
  }
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.dateControl}>
        <input
          ref={input}
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          maxLength={10}
          data-date-input
          value={draft}
          aria-invalid={showError && !!error}
          aria-describedby={`${id}-hint`}
          onChange={(event) => change(event.target.value)}
          onBlur={() => setShowError(true)}
          onInvalid={(event) => {
            event.preventDefault();
            setShowError(true);
          }}
        />
        <button
          type="button"
          aria-label={`${label} 달력 열기`}
          onClick={() => calendar.current?.showPicker()}
        >
          달력
        </button>
        <input
          ref={calendar}
          className={styles.calendarInput}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          min="0001-01-01"
          max="9999-12-31"
          value={error ? "" : draft}
          onChange={(event) => {
            change(event.target.value);
            input.current?.focus();
          }}
        />
      </div>
      <span
        id={`${id}-hint`}
        className={showError && error ? styles.error : styles.note}
        role={showError && error ? "alert" : undefined}
      >
        {showError && error
          ? error
          : "숫자 8자리로 입력하거나 달력에서 고르세요."}
      </span>
    </div>
  );
}
