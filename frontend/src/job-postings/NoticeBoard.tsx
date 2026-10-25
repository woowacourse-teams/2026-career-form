import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { TrackEvent } from "../analytics/events";
import { trackExtensionEvent } from "../analytics/extension-tracker";
import styles from "./JobPostings.module.css";
import { remainingTime } from "./model";
import {
  PushApiError,
  type PushApiErrorCode,
  type ServerPosting,
} from "./push-api";
import { pushClient, type PushClient } from "./push-client";
import type { PushStateView } from "./push-messages";
import { MINIMUM_CHROME_VERSION } from "./push-subscription";
import { formatPostingPeriod } from "./server-posting";

interface Props {
  client?: PushClient;
  savedUrls: ReadonlySet<string>;
  busy: boolean;
  now: number;
  onSave(posting: ServerPosting): void;
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
const unsupportedText = `Chrome ${MINIMUM_CHROME_VERSION} 이상에서만 새 공고 알림을 받을 수 있습니다. 현재 Chrome에서는 구독하지 않습니다.`;

export function subscriptionStatusText(state: PushStateView | undefined) {
  if (!state) return "구독 상태를 확인하는 중입니다.";
  if (!state.supported) return unsupportedText;
  if (!state.enabled) return "꺼짐 · 새 공고 알림을 받지 않습니다.";
  switch (state.status?.code) {
    case "registered":
      return "등록됨 · 새 공고가 등록되면 알림이 옵니다.";
    case "failed":
      return "등록 실패 · 잠시 후 자동으로 다시 시도합니다.";
    case "not_configured":
      return "백엔드 없음 · 이 빌드에는 알림 서버가 설정되지 않았습니다.";
    case "endpoint_unavailable":
      return "서버 미지원 · 서버가 아직 공고 알림을 지원하지 않습니다.";
    case "unsupported":
      return unsupportedText;
    default:
      return "등록 확인 중 · 구독을 서버에 등록하고 있습니다.";
  }
}

export function NoticeBoard({
  client = pushClient,
  savedUrls,
  busy,
  now,
  onSave,
  track = trackExtensionEvent,
}: Props) {
  const id = useId();
  const [state, setState] = useState<PushStateView>();
  const [stateFailed, setStateFailed] = useState(false);
  const [postings, setPostings] = useState<ServerPosting[]>();
  const [inboxError, setInboxError] = useState<PushApiErrorCode>();
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
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
  const loadState = useCallback(async () => {
    try {
      setState(await client.state());
      setStateFailed(false);
    } catch {
      setStateFailed(true);
    }
  }, [client]);
  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);
  useEffect(() => {
    void loadState();
    return client.subscribe(() => void loadState());
  }, [client, loadState]);
  const changeEnabled = async (
    enabled: boolean,
    event?: "push_subscription_enabled" | "push_subscription_disabled",
  ) => {
    setToggling(true);
    try {
      setState(await client.setEnabled(enabled));
      setStateFailed(false);
      if (event) track(event, { surface: "options" });
    } catch {
      setStateFailed(true);
    } finally {
      setToggling(false);
    }
  };
  return (
    <>
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
        {postings && !inboxError && postings.length > 0 && (
          <ul className={styles.list}>
            {postings.map((posting) => {
              const saved = savedUrls.has(posting.link);
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
                      >
                        공고 열기 <span aria-hidden="true">↗</span>
                      </a>
                      <button
                        disabled={busy || saved}
                        aria-label={`${posting.company} 마감 알림 저장`}
                        onClick={() => onSave(posting)}
                      >
                        {saved ? "저장됨" : "마감 알림 저장"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section
        className={styles.subscription}
        aria-labelledby={`${id}-subscription`}
      >
        <div className={styles.sectionHeading}>
          <h2 id={`${id}-subscription`}>공고 알림 구독</h2>
        </div>
        <div className={styles.subscriptionPanel}>
          <label className={styles.switch}>
            <input
              type="checkbox"
              role="switch"
              checked={state?.enabled ?? true}
              disabled={!state || toggling || !state.supported}
              onChange={(event) =>
                void changeEnabled(
                  event.target.checked,
                  event.target.checked
                    ? "push_subscription_enabled"
                    : "push_subscription_disabled",
                )
              }
            />
            새 공고를 Chrome 알림으로 받기
          </label>
          <p className={styles.subscriptionStatus} role="status">
            {subscriptionStatusText(state)}
          </p>
          {stateFailed && (
            <p className={styles.subscriptionStatus}>
              구독 상태를 불러오지 못했습니다.
            </p>
          )}
          {state?.enabled && state.status?.code === "failed" && (
            <div className={styles.subscriptionActions}>
              <button
                disabled={toggling}
                onClick={() => void changeEnabled(true)}
              >
                다시 등록
              </button>
            </div>
          )}
          <ul className={styles.subscriptionNotes}>
            <li>
              Chrome이 완전히 종료된 동안에는 알림이 도착하지 않으며, OS 알림
              설정에 따라 차단되거나 늦게 표시될 수 있습니다. 놓친 공고는
              공지함에서 다시 볼 수 있습니다.
            </li>
            <li>
              구독을 켜면 이 브라우저의 푸시 구독 주소가 서버에 저장되고, 끄면
              서버에 삭제를 요청합니다. 프로필 값과 지원서 내용은 보내지
              않습니다.
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
