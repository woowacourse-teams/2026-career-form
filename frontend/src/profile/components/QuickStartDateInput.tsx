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
  return "날짜를 확인해 주세요. 숫자 8자리를 입력하면 2024-03-02처럼 바뀌어요. 모르면 칸을 비워 주세요.";
}

/**
 * Adds the dashes after the year and the month while digits are typed. A
 * deletion never gets a trailing dash back, so backspace is not trapped, and
 * anything that is not digits and dashes is kept as typed for the error.
 */
export function formatDateDraft(raw: string, previous: string): string {
  const text = raw.trim();
  const digits = text.replace(/-/g, "");
  if (!/^\d{0,8}$/.test(digits)) return text;
  const deleting = text.length < previous.length;
  const [year, month, day] = [
    digits.slice(0, 4),
    digits.slice(4, 6),
    digits.slice(6),
  ];
  const trailing = !deleting || text.endsWith("-");
  if (digits.length < 4) return year;
  if (digits.length === 4) return trailing ? `${year}-` : year;
  if (digits.length < 6) return `${year}-${month}`;
  if (digits.length === 6)
    return trailing ? `${year}-${month}-` : `${year}-${month}`;
  return `${year}-${month}-${day}`;
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
    const next = formatDateDraft(raw, draft);
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
          aria-describedby={showError && error ? `${id}-hint` : undefined}
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
      {showError && error && (
        <span id={`${id}-hint`} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
