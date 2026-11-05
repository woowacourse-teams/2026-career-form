import type { ReactNode } from "react";
import { daysUntil, deadlineLabel, isUrgent } from "./saved-postings";
import styles from "./JobPostings.module.css";

export interface PostingRow {
  key: string;
  company: string;
  role: string;
  url: string;
  deadline: number;
  /** Closed rows (expired or completed) never draw the urgent color. */
  closed: boolean;
  action: ReactNode;
  remove?: ReactNode;
}
interface Props {
  rows: PostingRow[];
  now: number;
}

function dDay(deadline: number, now: number): string {
  return deadline <= now ? "마감" : `D-${daysUntil(deadline, now)}`;
}

export function PostingTable({ rows, now }: Props) {
  const removable = rows.some((row) => row.remove);
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.colDeadline} scope="col">
            마감
          </th>
          <th scope="col">회사</th>
          <th className={styles.colRole} scope="col">
            직무
          </th>
          <th className={styles.colWhen} scope="col">
            마감일
          </th>
          <th className={styles.colAction} scope="col">
            <span className={styles.srOnly}>동작</span>
          </th>
          {removable && (
            <th className={styles.colRemove} scope="col">
              <span className={styles.srOnly}>삭제</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const urgent =
            !row.closed && row.deadline > now && isUrgent(row.deadline, now);
          return (
            <tr key={row.key}>
              <td
                className={styles.dDay}
                data-urgent={urgent}
                data-closed={row.deadline <= now}
              >
                {dDay(row.deadline, now)}
              </td>
              <td className={styles.company}>
                <a
                  className={styles.companyLink}
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className={styles.companyName}>{row.company}</span>{" "}
                  <span className={styles.open}>
                    열기<span aria-hidden="true"> ↗</span>
                  </span>
                </a>
              </td>
              <td className={`${styles.secondary} ${styles.role}`}>
                {row.role}
              </td>
              <td className={`${styles.secondary} ${styles.when}`}>
                <time dateTime={new Date(row.deadline).toISOString()}>
                  {deadlineLabel(row.deadline)}
                </time>
              </td>
              <td className={styles.action}>{row.action}</td>
              {removable && <td className={styles.remove}>{row.remove}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
