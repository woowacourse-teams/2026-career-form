import { useId, useState } from "react";
import {
  createPosting,
  editPosting,
  deadlineInput,
  formatDeadline,
  parseDeadlineInput,
  POSTING_TIME_ZONE,
  type Posting,
  type PostingInput,
} from "./model";
import styles from "./PostingForm.module.css";
interface Props {
  posting?: Posting;
  busy: boolean;
  now: number;
  onSave(input: PostingInput): Promise<void>;
  onCancel(): void;
}
export function PostingForm({ posting, busy, now, onSave, onCancel }: Props) {
  const id = useId();
  const [company, setCompany] = useState(posting?.company ?? "");
  const [role, setRole] = useState(posting?.role ?? "");
  const [url, setUrl] = useState(posting?.url ?? "");
  const [deadline, setDeadline] = useState(
    posting ? deadlineInput(posting.deadline) : "",
  );
  const [slots, setSlots] = useState(() =>
    [0, 1].map((i) => {
      const total = posting?.reminders[i]?.minutes ?? (i ? 120 : 1440);
      return {
        enabled: posting ? Boolean(posting.reminders[i]) : true,
        hours: String(Math.floor(total / 60)),
        minutes: String(total % 60),
      };
    }),
  );
  const [error, setError] = useState("");
  const reminderMinutes = () =>
    slots
      .filter((s) => s.enabled)
      .map((s) => {
        const hours = Number(s.hours);
        const mins = Number(s.minutes);
        if (
          !s.hours.trim() ||
          !s.minutes.trim() ||
          !Number.isInteger(hours) ||
          hours < 0 ||
          hours > 87600 ||
          !Number.isInteger(mins) ||
          mins < 0 ||
          mins > 59 ||
          hours * 60 + mins === 0
        ) {
          throw new Error(
            "알림은 0 이상의 정수 시간과 0~59분으로, 최소 1분 전으로 설정해 주세요.",
          );
        }
        return hours * 60 + mins;
      });
  const input = (): PostingInput => ({
    company,
    role,
    url,
    deadline: parseDeadlineInput(deadline),
    timeZone: posting?.timeZone ?? POSTING_TIME_ZONE,
    minutes: reminderMinutes(),
  });
  const validate = (value: PostingInput) =>
    posting
      ? editPosting(posting, value, now)
      : createPosting(value, now, "preview");
  const reminderPreview = (): { times: number[]; message: string } => {
    if (posting?.status === "completed")
      return {
        times: [],
        message: "지원 완료한 공고에는 알림을 보내지 않습니다.",
      };
    let minutes: number[];
    try {
      minutes = reminderMinutes();
    } catch {
      return {
        times: [],
        message: "알림 시간을 1분 전 이상으로 설정해 주세요.",
      };
    }
    if (!minutes.length)
      return { times: [], message: "알림 없이 공고만 저장합니다." };
    if (!deadline)
      return {
        times: [],
        message: "마감 날짜·시간을 입력하면 알림 시각을 확인할 수 있어요.",
      };
    let deadlineAt: number;
    try {
      deadlineAt = parseDeadlineInput(deadline);
    } catch {
      return { times: [], message: "올바른 마감 날짜·시간을 입력해 주세요." };
    }
    const times = [...new Set(minutes)]
      .map((minutesBefore) => deadlineAt - minutesBefore * 60000)
      .filter((at) => at > now)
      .sort((a, b) => a - b);
    return {
      times,
      message: times.length
        ? "저장하면 다음 시각에 알림을 예약합니다."
        : "예약할 미래 알림이 없습니다. 이미 지난 알림은 보내지 않습니다.",
    };
  };
  const preview = reminderPreview();
  return (
    <form
      className={styles.form}
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          const value = input();
          validate(value);
          void onSave(value);
        } catch (e) {
          setError(e instanceof Error ? e.message : "입력값을 확인해 주세요.");
        }
      }}
    >
      <header className={styles.heading}>
        <h2 id={`${id}-title`}>{posting ? "공고 수정" : "새 공고 저장"}</h2>
        <p>지원할 공고와 마감을 등록하고, 알림을 설정하세요.</p>
      </header>
      <fieldset disabled={busy} className={styles.content}>
        <div className={styles.details}>
          <section aria-labelledby={`${id}-info`} className={styles.section}>
            <h3 id={`${id}-info`}>공고 정보</h3>
            <div className={styles.fields}>
              <label>
                회사명
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  required
                  maxLength={200}
                  placeholder="예: 올리브영"
                  autoFocus
                />
              </label>
              <label>
                직무
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                  maxLength={200}
                  placeholder="예: 백엔드 개발"
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
            </div>
          </section>
          <section
            aria-labelledby={`${id}-deadline`}
            className={styles.section}
          >
            <h3 id={`${id}-deadline`}>마감 일정</h3>
            <label className={styles.field}>
              마감 날짜·시간
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
                aria-describedby={`${id}-deadline-help`}
              />
            </label>
            <p id={`${id}-deadline-help`} className={styles.help}>
              한국 시간 기준 · 공고의 정확한 마감 시각을 직접 확인해 주세요.
            </p>
          </section>
        </div>
        <section
          aria-labelledby={`${id}-reminders`}
          className={styles.reminders}
        >
          <h3 id={`${id}-reminders`}>마감 알림</h3>
          <p className={styles.help}>최대 2번, 원하는 시간에 알려드려요.</p>
          {slots.map((slot, index) => (
            <div
              className={styles.reminder}
              data-enabled={slot.enabled}
              key={index}
            >
              <label className={styles.toggle}>
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
              <div className={styles.interval}>
                <label className={styles.unit}>
                  <span className={styles.visuallyHidden}>
                    마감 전 시간 {index + 1}
                  </span>
                  <input
                    type="number"
                    aria-label={`마감 전 시간 ${index + 1}`}
                    min="0"
                    step="1"
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
                  <span aria-hidden="true">시간</span>
                </label>
                <label className={styles.unit}>
                  <span className={styles.visuallyHidden}>
                    마감 전 분 {index + 1}
                  </span>
                  <input
                    type="number"
                    aria-label={`마감 전 분 ${index + 1}`}
                    min="0"
                    max="59"
                    step="1"
                    value={slot.minutes}
                    disabled={!slot.enabled}
                    onChange={(e) =>
                      setSlots(
                        slots.map((s, i) =>
                          i === index ? { ...s, minutes: e.target.value } : s,
                        ),
                      )
                    }
                  />
                  <span aria-hidden="true">분 전</span>
                </label>
              </div>
            </div>
          ))}
          <div className={styles.preview} aria-live="polite">
            <p>{preview.message}</p>
            {preview.times.length > 0 && (
              <ul className={styles.previewTimes}>
                {preview.times.map((at) => (
                  <li key={at}>
                    <time dateTime={new Date(at).toISOString()}>
                      {formatDeadline(
                        at,
                        posting?.timeZone ?? POSTING_TIME_ZONE,
                      )}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </fieldset>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={onCancel}>
          취소
        </button>
        <button type="submit" disabled={busy} className={styles.primary}>
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
