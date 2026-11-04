import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { Posting } from "../../src/job-postings/model";
import {
  daysUntil,
  deadlineSummary,
  isUrgent,
  upcomingPostings,
  type SavedPostingsReader,
} from "../../src/job-postings/saved-postings";
import styles from "./App.module.css";

type PostingsStatus = "loading" | "ready" | "error";

/** Open saved postings, kept current across storage changes and passing time. */
export function useDeadlinePostings(
  reader: SavedPostingsReader,
  now: () => number,
) {
  const [status, setStatus] = useState<PostingsStatus>("loading");
  const [saved, setSaved] = useState<Posting[]>([]);
  const [time, setTime] = useState(now);
  const generation = useRef(0);

  const refresh = useCallback(() => {
    const current = ++generation.current;
    reader
      .list()
      .then((postings) => {
        if (current !== generation.current) return;
        setSaved(postings);
        setStatus("ready");
      })
      .catch(() => {
        if (current !== generation.current) return;
        setSaved([]);
        setStatus("error");
      });
  }, [reader]);

  useEffect(() => {
    refresh();
    const unsubscribe = reader.subscribe(refresh);
    const timer = setInterval(() => setTime(now()), 30000);
    const visible = () => {
      if (document.visibilityState !== "visible") return;
      setTime(now());
      refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      ++generation.current;
      unsubscribe();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [reader, now, refresh]);

  const postings = upcomingPostings(saved, time);
  return {
    status,
    postings,
    time,
    urgentCount: postings.filter((p) => isUrgent(p.deadline, time)).length,
    retry: () => {
      setStatus("loading");
      refresh();
    },
  };
}

interface DeadlinePostingListProps {
  status: PostingsStatus;
  postings: readonly Posting[];
  time: number;
  onRetry: () => void;
  /** Shown instead of the plain "저장한 공고 없음" line when provided. */
  empty?: ReactNode;
}

export function DeadlinePostingList({
  status,
  postings,
  time,
  onRetry,
  empty,
}: DeadlinePostingListProps) {
  if (status === "loading")
    return <p className={styles.postingsMessage}>공고를 불러오는 중입니다.</p>;
  if (status === "error")
    return (
      <div className={styles.postingsMessage}>
        <p role="alert">공고를 불러오지 못했습니다.</p>
        <button
          className={styles.postingsRetry}
          type="button"
          onClick={onRetry}
        >
          다시 시도
        </button>
      </div>
    );
  if (postings.length === 0)
    return empty ?? <p className={styles.postingsMessage}>저장한 공고 없음</p>;
  return (
    <ul className={styles.postingsList}>
      {postings.map((posting) => (
        <li key={posting.id}>
          <a
            className={styles.postingRow}
            href={posting.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span
              className={`${styles.dDay} ${isUrgent(posting.deadline, time) ? styles.dDayUrgent : ""}`}
            >
              D-{daysUntil(posting.deadline, time)}
            </span>
            <span className={styles.postingText}>
              <span className={styles.postingCompany}>{posting.company}</span>
              <span className={styles.postingDetail}>
                {deadlineSummary(posting)}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
