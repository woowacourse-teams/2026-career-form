import { formatDeadline, remainingTime, type Posting } from "./model";
import styles from "./JobPostings.module.css";
interface Props {
  postings: Posting[];
  now: number;
  busy: boolean;
  onEdit(p: Posting): void;
  onComplete(p: Posting): void;
  onRemove(p: Posting): void;
}
export function PostingList({
  postings,
  now,
  busy,
  onEdit,
  onComplete,
  onRemove,
}: Props) {
  if (!postings.length)
    return <p className={styles.empty}>이 목록에 공고가 없습니다.</p>;
  return (
    <ul className={styles.list}>
      {postings.map((p) => (
        <li key={p.id} className={styles.posting}>
          <div className={styles.postingHeading}>
            <div>
              <h3>{p.company}</h3>
              <p>{p.role}</p>
            </div>
            <span className={p.deadline <= now ? styles.expired : styles.badge}>
              {p.status === "completed"
                ? "지원 완료"
                : remainingTime(p.deadline, now)}
            </span>
          </div>
          <p className={styles.deadline}>
            {formatDeadline(p.deadline, p.timeZone)}
          </p>
          {p.reminders.some(
            (r) =>
              r.state === "sent" &&
              r.deliveredAt !== undefined &&
              r.deliveredAt - r.at > 60000,
          ) && <p>놓친 알림을 다시 안내했습니다.</p>}
          <div className={styles.actions}>
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              공고 열기 ↗
            </a>
            <button disabled={busy} onClick={() => onComplete(p)}>
              {p.status === "completed"
                ? "지원 예정으로 되돌리기"
                : "지원 완료로 표시"}
            </button>
            <button disabled={busy} onClick={() => onEdit(p)}>
              수정
            </button>
            <button disabled={busy} onClick={() => onRemove(p)}>
              삭제
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
