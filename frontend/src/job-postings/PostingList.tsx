import { formatDeadline, remainingTime, type Posting } from "./model";
import { PostingIcon } from "./PostingIcon";
import styles from "./JobPostings.module.css";
interface Props {
  postings: Posting[];
  now: number;
  busy: boolean;
  onEdit(p: Posting): void;
  onComplete(p: Posting): void;
  onRemove(p: Posting): void;
}
function reminderStatus(p: Posting, now: number): string {
  if (p.status === "completed") return "지원 완료 · 알림 종료";
  if (p.deadline <= now) return "마감된 공고 · 알림 종료";
  if (!p.reminders.length) return "알림 없이 저장";
  const upcoming = p.reminders.filter(
    (r) => r.state === "pending" && r.at > now,
  );
  if (upcoming.length) return `알림 ${upcoming.length}개 설정됨`;
  if (p.reminders.some((r) => r.state === "pending")) return "알림 확인 중";
  return "남은 알림 없음";
}
export function PostingList({
  postings,
  now,
  busy,
  onEdit,
  onComplete,
  onRemove,
}: Props) {
  return (
    <ul className={styles.list}>
      {postings.map((p) => {
        const completed = p.status === "completed";
        const expired = !completed && p.deadline <= now;
        const urgent = !completed && !expired && p.deadline - now <= 86400000;
        return (
          <li
            key={p.id}
            className={`${styles.posting} ${urgent ? styles.urgentPosting : ""}`}
          >
            <div className={styles.postingHeading}>
              <div className={styles.company}>
                <PostingIcon key={p.url} company={p.company} url={p.url} />
                <div className={styles.companyText}>
                  <h3>{p.company}</h3>
                  <p>{p.role}</p>
                </div>
              </div>
              <span
                className={`${styles.badge} ${completed ? styles.completed : expired ? styles.expired : urgent ? styles.urgent : ""}`}
              >
                {completed
                  ? "✓ 지원 완료"
                  : urgent
                    ? `마감 임박 · ${remainingTime(p.deadline, now)}`
                    : remainingTime(p.deadline, now)}
              </span>
            </div>
            <div className={styles.details}>
              <p className={styles.deadline}>
                <span>마감</span>
                <time dateTime={new Date(p.deadline).toISOString()}>
                  {formatDeadline(p.deadline, p.timeZone)}
                </time>
              </p>
              <p className={styles.reminderStatus}>{reminderStatus(p, now)}</p>
            </div>
            {p.reminders.some(
              (r) =>
                r.state === "sent" &&
                r.deliveredAt !== undefined &&
                r.deliveredAt - r.at > 60000,
            ) && (
              <p className={styles.lateNote}>놓친 알림을 다시 안내했습니다.</p>
            )}
            <div className={styles.cardFooter}>
              <div className={styles.actions}>
                <a
                  className={
                    !completed && !expired ? styles.openPosting : undefined
                  }
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  공고 열기 <span aria-hidden="true">↗</span>
                </a>
                <button disabled={busy} onClick={() => onComplete(p)}>
                  {completed ? "지원 예정으로 되돌리기" : "지원 완료로 표시"}
                </button>
              </div>
              <div className={styles.editActions}>
                <button
                  className={styles.quiet}
                  data-edit-posting={p.id}
                  aria-label={`${p.company} 수정`}
                  disabled={busy}
                  onClick={() => onEdit(p)}
                >
                  수정
                </button>
                <button
                  className={styles.quiet}
                  aria-label={`${p.company} 삭제`}
                  disabled={busy}
                  onClick={() => onRemove(p)}
                >
                  삭제
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
