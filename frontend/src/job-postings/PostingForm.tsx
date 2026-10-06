import { useState } from "react";
import {
  createPosting,
  deadlineInput,
  formatDeadline,
  parseDeadlineInput,
  pendingReminders,
  POSTING_TIME_ZONE,
  type Posting,
  type PostingInput,
} from "./model";
import styles from "./JobPostings.module.css";
interface Props {
  posting?: Posting;
  busy: boolean;
  now: number;
  onSave(input: PostingInput): Promise<void>;
  onCancel(): void;
}
export function PostingForm({ posting, busy, now, onSave, onCancel }: Props) {
  const [company, setCompany] = useState(posting?.company ?? "");
  const [role, setRole] = useState(posting?.role ?? "");
  const [url, setUrl] = useState(posting?.url ?? "");
  const [deadline, setDeadline] = useState(
    posting ? deadlineInput(posting.deadline) : "",
  );
  const [slots, setSlots] = useState(() =>
    [0, 1].map((i) => ({
      enabled: posting ? Boolean(posting.reminders[i]) : true,
      hours: String(
        posting
          ? (posting.reminders[i]?.minutes ?? (i ? 120 : 1440)) / 60
          : i
            ? 2
            : 24,
      ),
    })),
  );
  const [error, setError] = useState("");
  const input = (): PostingInput => ({
    company,
    role,
    url,
    deadline: parseDeadlineInput(deadline),
    timeZone: posting?.timeZone ?? POSTING_TIME_ZONE,
    minutes: slots.filter((s) => s.enabled).map((s) => Number(s.hours) * 60),
  });
  let times: number[] = [];
  try {
    times = pendingReminders(createPosting(input(), now, "preview")).map(
      (r) => r.at,
    );
  } catch {
    /* Incomplete form is expected before submit. */
  }
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          const value = input();
          createPosting(value, now, "validation");
          void onSave(value);
        } catch (e) {
          setError(e instanceof Error ? e.message : "입력값을 확인해 주세요.");
        }
      }}
    >
      <h2>{posting ? "공고 수정" : "새 공고 저장"}</h2>
      <fieldset disabled={busy} className={styles.fields}>
        <label>
          회사명
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label>
          직무
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label className={styles.full}>
          공고 링크
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://"
          />
        </label>
        <label className={styles.full}>
          마감 날짜·시간
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
          />
        </label>
        <p className={styles.full}>
          한국 시간(Asia/Seoul) 기준입니다. 공고의 마감 시각을 직접 확인해
          주세요.
        </p>
        <div className={styles.full}>
          <h3>마감 알림</h3>
          {slots.map((slot, index) => (
            <div className={styles.reminder} key={index}>
              <label>
                <input
                  type="checkbox"
                  checked={slot.enabled}
                  onChange={(e) =>
                    setSlots(
                      slots.map((s, i) =>
                        i === index ? { ...s, enabled: e.target.checked } : s,
                      ),
                    )
                  }
                />{" "}
                알림 {index + 1}
              </label>
              <label>
                마감 전 시간 {index + 1}
                <input
                  type="number"
                  min="0.05"
                  step="0.05"
                  max="87600"
                  value={slot.hours}
                  disabled={!slot.enabled}
                  onChange={(e) =>
                    setSlots(
                      slots.map((s, i) =>
                        i === index ? { ...s, hours: e.target.value } : s,
                      ),
                    )
                  }
                />
              </label>
              <span>시간 전</span>
            </div>
          ))}
        </div>
        {deadline && (
          <div className={styles.full} aria-live="polite">
            {times.length ? (
              <>
                <p>저장하면 다음 시각에 알림을 예약합니다.</p>
                <ul>
                  {times.map((at) => (
                    <li key={at}>{formatDeadline(at, POSTING_TIME_ZONE)}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                예약할 미래 알림이 없습니다. 이미 지난 알림은 보내지 않습니다.
              </p>
            )}
          </div>
        )}
      </fieldset>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" disabled={busy} className={styles.primary}>
          {busy ? "저장 중…" : "저장"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}
