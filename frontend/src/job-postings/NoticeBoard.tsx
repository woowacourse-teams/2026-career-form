import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { TrackEvent } from "../analytics/events";
import { trackExtensionEvent } from "../analytics/extension-tracker";
import styles from "./JobPostings.module.css";
import { remainingTime } from "./model";
import type { VisibilityAnswer } from "./notification-check";
import {
  PushApiError,
  type PushApiErrorCode,
  type ServerPosting,
} from "./push-api";
import { pushClient, type PushClient } from "./push-client";
import type { PushStateView, RecordSource } from "./push-messages";
import { formatPostingPeriod } from "./server-posting";
import { VisibilityCheck, type VisibilityVariant } from "./VisibilityCheck";

const COLLAPSED_COUNT = 3;
interface Props {
  client?: PushClient;
  state: PushStateView | undefined;
  savedUrls: ReadonlySet<string>;
  autoSavedUrls: ReadonlySet<string>;
  busy: boolean;
  now: number;
  onSave(posting: ServerPosting): void;
  onOpen(posting: ServerPosting): void;
  onUndo(posting: ServerPosting): void;
  onTest(): Promise<void>;
  onAnswer(answer: VisibilityAnswer, source: RecordSource): Promise<void>;
  onLater(): Promise<void>;
  track?: TrackEvent;
}

const inboxMessages: Partial<Record<PushApiErrorCode, string>> = {
  NOT_CONFIGURED:
    "이 빌드에는 알림 서버가 설정되지 않아 공지함을 불러올 수 없습니다.",
  ENDPOINT_UNAVAILABLE:
    "서버가 아직 공고 알림을 지원하지 않습니다. 서버 업데이트 뒤 다시 확인해 주세요.",
};
const defaultInboxMessage =
  "공지함을 불러오지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.";

// Which visibility card to ask with, decided once per page visit.
function cardFor(state: PushStateView): VisibilityVariant | undefined {
  const { visibility } = state;
  if (visibility.result !== "unknown") return undefined;
  if (visibility.shownAt !== undefined) return "confirm";
  if (state.enabled && state.supported && visibility.askLaterAt === undefined)
    return "question";
  return undefined;
}

export function NoticeBoard({
  client = pushClient,
  state,
  savedUrls,
  autoSavedUrls,
  busy,
  now,
  onSave,
  onOpen,
  onUndo,
  onTest,
  onAnswer,
  onLater,
  track = trackExtensionEvent,
}: Props) {
  const id = useId();
  const [postings, setPostings] = useState<ServerPosting[]>();
  const [inboxError, setInboxError] = useState<PushApiErrorCode>();
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [card, setCard] = useState<VisibilityVariant>();
  const viewed = useRef(false);
  const trackRef = useRef(track);
  trackRef.current = track;
  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await client.inbox();
      setPostings([...rows].sort((a, b) => a.closesAt - b.closesAt));
      setInboxError(undefined);
      if (!viewed.current) {
        viewed.current = true;
        trackRef.current("posting_inbox_viewed", { surface: "options" });
      }
    } catch (error) {
      setInboxError(error instanceof PushApiError ? error.code : "NETWORK");
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);
  useEffect(() => {
    if (state && card === undefined) setCard(cardFor(state));
  }, [state, card]);
  const autoSave = state?.autoSave ?? true;
  const visible = expanded ? postings : postings?.slice(0, COLLAPSED_COUNT);
  const hidden = (postings?.length ?? 0) - (visible?.length ?? 0);
  return (
    <>
      {card && (
        <VisibilityCheck
          variant={card}
          state={state}
          busy={busy}
          onTest={onTest}
          onAnswer={onAnswer}
          onLater={onLater}
          track={track}
          surface="options"
        />
      )}
      <section className={styles.inbox} aria-labelledby={`${id}-inbox`}>
        <div className={styles.sectionHeading}>
          <h2 id={`${id}-inbox`}>공지함</h2>
          <span>팀이 등록한 진행 중 공고 · 마감순</span>
        </div>
        {loading && !postings && !inboxError && (
          <p role="status">공지함을 불러오는 중입니다.</p>
        )}
        {inboxError && (
          <div className={styles.warning} role="status">
            <p>{inboxMessages[inboxError] ?? defaultInboxMessage}</p>
            <button disabled={loading} onClick={() => void loadInbox()}>
              공지함 다시 불러오기
            </button>
          </div>
        )}
        {postings && !inboxError && postings.length === 0 && (
          <p className={styles.inboxEmpty}>지금 진행 중인 공고가 없습니다.</p>
        )}
        {visible && !inboxError && visible.length > 0 && (
          <ul className={styles.list}>
            {visible.map((posting) => {
              const saved = savedUrls.has(posting.link);
              const undoable = saved && autoSavedUrls.has(posting.link);
              const urgent = posting.closesAt - now <= 86400000;
              return (
                <li
                  key={posting.id}
                  className={`${styles.posting} ${urgent ? styles.urgentPosting : ""}`}
                >
                  <div className={styles.postingHeading}>
                    <div className={styles.company}>
                      <div className={styles.companyText}>
                        <h3>{posting.company}</h3>
                        <p>{posting.role}</p>
                      </div>
                    </div>
                    <span
                      className={`${styles.badge} ${saved ? styles.completed : urgent ? styles.urgent : ""}`}
                    >
                      {saved
                        ? "✓ 저장됨"
                        : urgent
                          ? `마감 임박 · ${remainingTime(posting.closesAt, now)}`
                          : remainingTime(posting.closesAt, now)}
                    </span>
                  </div>
                  <div className={styles.details}>
                    <p className={styles.deadline}>
                      <span>접수</span>
                      <span>
                        {formatPostingPeriod(posting.opensAt, posting.closesAt)}{" "}
                        · 한국 시간
                      </span>
                    </p>
                    <p className={styles.reminderStatus}>
                      {saved
                        ? "마감 알림에 저장한 공고"
                        : autoSave
                          ? "공고를 열면 마감 알림에 저장돼요 (24시간·2시간 전)"
                          : "저장하면 마감 24시간·2시간 전에 알려드려요"}
                    </p>
                  </div>
                  <div className={styles.cardFooter}>
                    <div className={styles.actions}>
                      <a
                        className={styles.openPosting}
                        href={posting.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${posting.company} 공고 열기`}
                        onClick={() => onOpen(posting)}
                      >
                        공고 열기 <span aria-hidden="true">↗</span>
                      </a>
                      {undoable ? (
                        <button
                          disabled={busy}
                          aria-label={`${posting.company} 저장 취소`}
                          onClick={() => onUndo(posting)}
                        >
                          취소
                        </button>
                      ) : (
                        <button
                          disabled={busy || saved}
                          aria-label={`${posting.company} 마감 알림 저장`}
                          onClick={() => onSave(posting)}
                        >
                          {saved ? "저장됨" : "마감 알림 저장"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {hidden > 0 && !inboxError && (
          <div className={styles.inboxMore}>
            <button onClick={() => setExpanded(true)}>
              {hidden}건 더 보기
            </button>
          </div>
        )}
      </section>
    </>
  );
}
