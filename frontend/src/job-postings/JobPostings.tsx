import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackEvent } from "../analytics/events";
import { trackExtensionEvent } from "../analytics/extension-tracker";
import { postingClient, type PostingClient } from "./client";
import type { Posting } from "./model";
import { NoticeBoard } from "./NoticeBoard";
import type { ServerPosting } from "./push-api";
import {
  pushClient as defaultPushClient,
  type PushClient,
} from "./push-client";
import { postingInput, reminderOutcome } from "./server-posting";
import type { PostingSnapshot } from "./service";
import { SubscriptionSettings } from "./SubscriptionSettings";
import { usePushState } from "./use-push-state";
import { PostingList } from "./PostingList";
import styles from "./JobPostings.module.css";
interface Props {
  client?: PostingClient;
  pushClient?: PushClient;
  now?: () => number;
  track?: TrackEvent;
}
interface Failure {
  message: string;
  reload: boolean;
}
const LIST_FAILURE: Failure = {
  message: "공고를 불러오지 못했습니다. 다시 시도해 주세요.",
  reload: true,
};
// Exact messages the domain layers raise on purpose (model, service,
// repository, client, background-handler). Anything else may carry storage or
// runtime details, so it is replaced by the action's own message.
const VALIDATION_MESSAGES: ReadonlySet<string> = new Set([
  "회사명을 입력해 주세요.",
  "HTTP(S) 공고 링크를 입력해 주세요. 계정 정보가 포함된 링크는 사용할 수 없습니다.",
  "앞으로 남은 마감 날짜·시간을 입력해 주세요.",
  "알림은 최대 2개이며 마감 전 1분 이상의 간격이어야 합니다.",
  "시간대를 확인해 주세요.",
  "공고 저장소에 연결하지 못했습니다. 다시 시도해 주세요.",
  "공고 요청에 실패했습니다.",
  "공고 응답을 읽지 못했습니다.",
]);
const RELOAD_MESSAGES: ReadonlySet<string> = new Set([
  "다른 화면에서 공고가 변경되었습니다. 목록을 새로 불러와 주세요.",
  "저장된 공고 형식을 읽을 수 없습니다. 데이터를 덮어쓰지 않았습니다.",
  "공고 저장 또는 조회에 실패했습니다. 목록을 다시 불러온 뒤 시도해 주세요.",
]);
function writeFailure(error: unknown, fallback: string): Failure {
  const message = error instanceof Error ? error.message : "";
  if (RELOAD_MESSAGES.has(message)) return { message, reload: true };
  if (VALIDATION_MESSAGES.has(message)) return { message, reload: false };
  return { message: fallback, reload: false };
}
export function JobPostings({
  client = postingClient,
  pushClient = defaultPushClient,
  now = Date.now,
  track = trackExtensionEvent,
}: Props) {
  const [snapshot, setSnapshot] = useState<PostingSnapshot>();
  const [error, setError] = useState<Failure>();
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"planned" | "expired" | "completed">(
    "planned",
  );
  const listHeading = useRef<HTMLHeadingElement>(null);
  const [time, setTime] = useState(now);
  const load = useCallback(async () => {
    try {
      setSnapshot(await client.list());
      setError(undefined);
    } catch {
      setError(LIST_FAILURE);
    }
  }, [client]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void client
        .list()
        .then((s) => {
          if (active) {
            setSnapshot(s);
            setError(undefined);
          }
        })
        .catch(() => {
          if (active) setError(LIST_FAILURE);
        });
    };
    refresh();
    const unsubscribe = client.subscribe(refresh);
    const visible = () => {
      if (document.visibilityState === "visible") {
        setTime(now());
        refresh();
      }
    };
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(() => setTime(now()), 30000);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client, now]);
  const mutate = async (
    action: () => Promise<PostingSnapshot>,
    message: string | ((next: PostingSnapshot) => string),
    failureMessage = "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
  ) => {
    setBusy(true);
    setError(undefined);
    setFeedback("");
    try {
      const next = await action();
      setSnapshot(next);
      setFeedback(typeof message === "string" ? message : message(next));
    } catch (e) {
      setError(writeFailure(e, failureMessage));
    } finally {
      setBusy(false);
    }
  };
  const push = usePushState(pushClient);
  const savedUrls = new Set((snapshot?.postings ?? []).map((p) => p.url));
  const savedMessage = (posting: ServerPosting) => (next: PostingSnapshot) => {
    const saved = next.postings.find((p) => p.url === posting.link);
    return saved && reminderOutcome(saved) === "no_future_reminders"
      ? "공고를 저장했지만 예약할 미래 알림이 없습니다. 이미 지난 알림은 보내지 않습니다."
      : "공고를 마감 알림에 저장했습니다.";
  };
  // Server postings become ordinary local postings with the default reminders.
  const saveFromInbox = (posting: ServerPosting) => {
    if (savedUrls.has(posting.link)) return;
    void mutate(
      async () => {
        const next = await client.save(postingInput(posting));
        setView("planned");
        track("posting_inbox_saved", {
          surface: "options",
          posting_id: posting.id,
          trigger: "button",
        });
        return next;
      },
      savedMessage(posting),
      "공고를 마감 알림에 저장하지 못했습니다. 다시 시도해 주세요.",
    );
  };
  const rows = [...(snapshot?.postings ?? [])].sort(
    (a, b) => a.deadline - b.deadline,
  );
  const groups = {
    planned: rows.filter((p) => p.status === "planned" && p.deadline > time),
    expired: rows
      .filter((p) => p.status === "planned" && p.deadline <= time)
      .reverse(),
    completed: rows.filter((p) => p.status === "completed"),
  };
  const selected = groups[view];
  const urgentCount = groups.planned.filter(
    (p) => p.deadline - time <= 86400000,
  ).length;
  const headings = {
    planned: "다가오는 마감",
    expired: "지난 마감",
    completed: "완료한 지원",
  };
  const emptyTitles = {
    planned: "다가오는 마감이 없어요",
    expired: "지난 마감이 없어요",
    completed: "아직 완료한 지원이 없어요",
  };
  const emptyDescriptions = {
    planned: "공지함에서 공고를 저장하면 마감 전에 알려드려요.",
    expired: "마감이 지난 공고는 이곳에서 따로 확인할 수 있어요.",
    completed: "지원을 마친 공고를 완료로 표시하면 여기에 모아볼 수 있어요.",
  };
  const list = (postings: Posting[]) => (
    <PostingList
      postings={postings}
      now={time}
      busy={busy}
      onComplete={(p) =>
        void mutate(
          () => client.setCompleted(p.id, p.version, p.status !== "completed"),
          p.status === "completed"
            ? "지원 예정으로 되돌렸습니다."
            : "지원 완료로 표시하고 남은 알림을 취소했습니다.",
          "공고 상태를 바꾸지 못했습니다. 다시 시도해 주세요.",
        )
      }
      onRemove={(p) =>
        void mutate(
          async () => {
            const next = await client.remove(p.id, p.version);
            listHeading.current?.focus();
            return next;
          },
          "공고를 삭제했습니다.",
          "공고를 삭제하지 못했습니다. 다시 시도해 주세요.",
        )
      }
    />
  );
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MY APPLICATIONS</p>
          <h1>지원 공고</h1>
          <p className={styles.subtitle}>
            관심 있는 공고부터 지원 완료까지, 한곳에서 챙기세요.
          </p>
        </div>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          {error.message}{" "}
          {error.reload && (
            <button onClick={() => void load()} disabled={busy}>
              목록 다시 불러오기
            </button>
          )}
        </div>
      )}
      {feedback && (
        <div className={styles.feedback}>
          <span role="status">{feedback}</span>
          <button
            type="button"
            aria-label="알림 닫기"
            onClick={() => setFeedback("")}
          >
            ×
          </button>
        </div>
      )}
      {snapshot?.problems.length ? (
        <div className={styles.warning} role="status">
          <p>
            {snapshot.problems.includes("permission")
              ? "Chrome 알림이 차단되었거나 권한을 확인할 수 없습니다. Chrome과 OS의 알림 설정을 확인해 주세요."
              : "공고는 저장되었지만 알림 처리에 문제가 있습니다."}
          </p>
          {snapshot.problems.includes("schedule") && (
            <p>알림 예약에 실패했습니다.</p>
          )}
          {snapshot.problems.includes("notification") && (
            <p>알림 표시 또는 이전 알림 정리에 실패했습니다.</p>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void mutate(
                () => client.retry(),
                "알림 상태를 다시 확인했습니다.",
                "알림 상태를 확인하지 못했습니다. 다시 시도해 주세요.",
              )
            }
          >
            알림 다시 시도
          </button>
        </div>
      ) : null}
      {!snapshot && !error && <p role="status">공고를 불러오는 중입니다.</p>}
      {snapshot && (
        <>
          <div className={styles.overview}>
            <span className={styles.localNote}>
              <span aria-hidden="true">●</span> 이 브라우저에 저장됨
            </span>
            <p>
              {urgentCount > 0 ? (
                <>
                  24시간 안에 마감되는 공고가 <strong>{urgentCount}개</strong>{" "}
                  있어요.
                </>
              ) : (
                "공고를 저장해 두면 마감 24시간·2시간 전에 알려드려요."
              )}
            </p>
          </div>
          <NoticeBoard
            client={pushClient}
            state={push.state}
            savedUrls={savedUrls}
            busy={busy || push.busy}
            now={time}
            onSave={saveFromInbox}
            onTest={push.test}
            onAnswer={push.record}
            onLater={push.later}
            track={track}
          />
          <nav className={styles.tabs} aria-label="지원 상태">
            {(["planned", "expired", "completed"] as const).map((key) => (
              <button
                key={key}
                aria-pressed={view === key}
                onClick={() => {
                  setView(key);
                  setFeedback("");
                }}
              >
                {
                  {
                    planned: "지원 예정",
                    expired: "마감 지남",
                    completed: "지원 완료",
                  }[key]
                }{" "}
                ({groups[key].length})
              </button>
            ))}
          </nav>
          <section aria-label={headings[view]} className={styles.results}>
            <div className={styles.sectionHeading}>
              <h2 ref={listHeading} tabIndex={-1}>
                {headings[view]}
              </h2>
              <span>{view === "expired" ? "최근 마감순" : "마감일순"}</span>
            </div>
            {view === "expired" && selected.length > 0 && (
              <p className={styles.sectionNote}>
                마감이 지나도 지원 완료로 자동 변경하지 않습니다. 지원했다면
                완료로 표시해 주세요.
              </p>
            )}
            {selected.length ? (
              list(selected)
            ) : (
              <div className={styles.empty}>
                <span className={styles.emptyIcon} aria-hidden="true">
                  {view === "completed" ? "✓" : "○"}
                </span>
                <h3>
                  {!rows.length && view === "planned"
                    ? "지원할 공고를 저장해보세요."
                    : emptyTitles[view]}
                </h3>
                <p>{emptyDescriptions[view]}</p>
              </div>
            )}
          </section>
          <SubscriptionSettings
            state={push.state}
            failed={push.failed}
            busy={push.busy}
            onEnabledChange={push.setEnabled}
            onTest={push.test}
            onAnswer={push.record}
            track={track}
          />
        </>
      )}
      <details className={styles.notice}>
        <summary>알림과 로컬 저장 안내</summary>
        <p>
          Chrome이 완전히 종료된 동안에는 알림이 표시되지 않습니다. 절전 상태나
          OS 알림 설정에 따라 늦게 표시되거나 차단될 수 있습니다.
        </p>
        <p>
          다시 실행하면 놓친 알림은 공고당 하나로 안내하고, 이미 지난 마감은
          목록에서 구분합니다.
        </p>
        <p>
          공고는 이 Chrome 프로필에만 저장됩니다. 확장 프로그램을 삭제하면
          공고도 사라질 수 있습니다. 서버 동기화는 제공하지 않습니다.
        </p>
      </details>
    </main>
  );
}
