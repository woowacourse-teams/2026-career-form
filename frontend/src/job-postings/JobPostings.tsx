import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { TrackEvent } from "../analytics/events";
import { trackExtensionEvent } from "../analytics/extension-tracker";
import { postingClient, type PostingClient } from "./client";
import { matchesSelectedRoles } from "./job-roles";
import type { PushApiErrorCode, ServerPosting } from "./push-api";
import {
  pushClient as defaultPushClient,
  type PushClient,
} from "./push-client";
import type { PushStateView } from "./push-messages";
import { PostingTable, type PostingRow } from "./PostingTable";
import { isUrgent } from "./saved-postings";
import { CHOOSE_ROLES_TEXT } from "./RoleSelector";
import { postingInput, reminderOutcome } from "./server-posting";
import type { PostingSnapshot } from "./service";
import {
  SubscriptionSettings,
  SubscriptionSwitch,
} from "./SubscriptionSettings";
import { useInbox } from "./use-inbox";
import { useJobCategories } from "./use-job-categories";
import { usePushState } from "./use-push-state";
import { VisibilityCheck, type VisibilityVariant } from "./VisibilityCheck";
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
  message: "공고를 불러오지 못했어요",
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
type View = "inbox" | "planned" | "expired" | "completed";
const VIEWS: readonly View[] = ["inbox", "planned", "expired", "completed"];
const TAB_LABELS: Record<View, string> = {
  inbox: "새 공고",
  planned: "지원 예정",
  expired: "마감 지남",
  completed: "지원 완료",
};
const EMPTY_LABELS: Record<View, string> = {
  inbox: "새 공고 없음",
  planned: "저장한 공고 없음",
  expired: "마감 지난 공고 없음",
  completed: "지원 완료 없음",
};
const INBOX_FAILURES: Partial<Record<PushApiErrorCode, string>> = {
  NOT_CONFIGURED: "알림 서버 없음",
  ENDPOINT_UNAVAILABLE: "서버 미지원",
};
// Which visibility card to ask with, decided once per page visit.
function cardFor(state: PushStateView): VisibilityVariant | undefined {
  const { visibility } = state;
  if (visibility.result !== "unknown") return undefined;
  if (visibility.shownAt !== undefined) return "confirm";
  if (state.enabled && state.supported && visibility.askLaterAt === undefined)
    return "question";
  return undefined;
}
function problemText(problems: PostingSnapshot["problems"]): string {
  if (problems.includes("permission"))
    return "알림 권한 차단됨 (Chrome·OS 설정 확인)";
  const parts = [
    problems.includes("schedule") && "알림 예약 실패",
    problems.includes("notification") && "알림 표시 실패",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "알림 처리 실패";
}
export function JobPostings({
  client = postingClient,
  pushClient = defaultPushClient,
  now = Date.now,
  track = trackExtensionEvent,
}: Props) {
  const id = useId();
  const [snapshot, setSnapshot] = useState<PostingSnapshot>();
  const [error, setError] = useState<Failure>();
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const [busy, setBusy] = useState(false);
  const [chosenView, setChosenView] = useState<View>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [card, setCard] = useState<VisibilityVariant>();
  const panel = useRef<HTMLDivElement>(null);
  const tabs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({});
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsDialog = useRef<HTMLDivElement>(null);
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
  const inbox = useInbox(pushClient, track);
  const categories = useJobCategories(pushClient);
  useEffect(() => {
    if (push.state && card === undefined) setCard(cardFor(push.state));
  }, [push.state, card]);
  useEffect(() => {
    if (settingsOpen) settingsDialog.current?.focus();
  }, [settingsOpen]);
  const closeSettings = () => {
    setSettingsOpen(false);
    settingsButton.current?.focus();
  };
  // The scrim makes the page behind unavailable, so Tab stays in the dialog.
  // Roving tabs (tabindex -1) are reached with arrow keys, not Tab.
  const keepTabInSettings = (event: KeyboardEvent<HTMLDivElement>) => {
    const controls = event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled)',
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (
      event.shiftKey &&
      (active === first || active === event.currentTarget)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  const savedUrls = new Set((snapshot?.postings ?? []).map((p) => p.url));
  const savedMessage = (posting: ServerPosting) => (next: PostingSnapshot) => {
    const saved = next.postings.find((p) => p.url === posting.link);
    return saved && reminderOutcome(saved) === "no_future_reminders"
      ? "공고를 저장했지만 예약할 미래 알림이 없습니다. 이미 지난 알림은 보내지 않습니다."
      : "공고를 마감 알림에 저장했습니다.";
  };
  // Server postings become ordinary local postings with the default reminders.
  // The saved posting stays in the inbox tab, marked as saved.
  const saveFromInbox = (posting: ServerPosting) => {
    if (savedUrls.has(posting.link)) return;
    void mutate(
      async () => {
        const next = await client.save(postingInput(posting));
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
  const sorted = [...(snapshot?.postings ?? [])].sort(
    (a, b) => a.deadline - b.deadline,
  );
  const groups = {
    planned: sorted.filter((p) => p.status === "planned" && p.deadline > time),
    expired: sorted
      .filter((p) => p.status === "planned" && p.deadline <= time)
      .reverse(),
    completed: sorted.filter((p) => p.status === "completed"),
  };
  const urgentCount = groups.planned.filter((p) =>
    isUrgent(p.deadline, time),
  ).length;
  // Role-tagged postings need an overlap with the selection; legacy postings
  // without roles reach everyone. Until the selection is known the inbox keeps
  // loading, unless the background is unreachable, where nothing is hidden.
  const selectedRoles = push.state?.roles;
  const visibleInbox =
    inbox.postings && (selectedRoles || push.failed)
      ? inbox.postings.filter((p) =>
          matchesSelectedRoles(p.roles, selectedRoles ?? []),
        )
      : undefined;
  const hiddenCount =
    inbox.postings && visibleInbox
      ? inbox.postings.length - visibleInbox.length
      : 0;
  // Ask for a selection only where one can be made: the server (or its
  // cached list) offers categories, or it already tagged a posting.
  const needsRoles =
    selectedRoles !== undefined &&
    selectedRoles.length === 0 &&
    (!!categories.view?.categories || hiddenCount > 0);
  const counts: Record<View, number | undefined> = {
    inbox: visibleInbox?.length,
    planned: snapshot && groups.planned.length,
    expired: snapshot && groups.expired.length,
    completed: snapshot && groups.completed.length,
  };
  const view: View =
    chosenView ?? (visibleInbox?.length || needsRoles ? "inbox" : "planned");
  const select = (next: View, focus = false) => {
    setChosenView(next);
    setFeedback("");
    if (focus) tabs.current[next]?.focus();
  };
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = VIEWS.indexOf(view);
    const target = {
      ArrowRight: VIEWS[(index + 1) % VIEWS.length],
      ArrowLeft: VIEWS[(index + VIEWS.length - 1) % VIEWS.length],
      Home: VIEWS[0],
      End: VIEWS[VIEWS.length - 1],
    }[event.key];
    if (!target) return;
    event.preventDefault();
    select(target, true);
  };
  const toggleCompleted = (p: (typeof sorted)[number]) =>
    void mutate(
      () => client.setCompleted(p.id, p.version, p.status !== "completed"),
      p.status === "completed"
        ? "지원 예정으로 되돌렸습니다."
        : "지원 완료로 표시하고 남은 알림을 취소했습니다.",
      "공고 상태를 바꾸지 못했습니다. 다시 시도해 주세요.",
    );
  const remove = (p: (typeof sorted)[number]) =>
    void mutate(
      async () => {
        const next = await client.remove(p.id, p.version);
        panel.current?.focus();
        return next;
      },
      "공고를 삭제했습니다.",
      "공고를 삭제하지 못했습니다. 다시 시도해 주세요.",
    );
  const inboxRows: PostingRow[] = (visibleInbox ?? []).map((posting) => ({
    key: posting.id,
    company: posting.company,
    role: posting.role,
    url: posting.link,
    deadline: posting.closesAt,
    closed: false,
    action: savedUrls.has(posting.link) ? (
      <span className={styles.savedMark}>✓ 저장됨</span>
    ) : (
      <button
        className={styles.outline}
        aria-label={`${posting.company} 저장`}
        disabled={busy || !snapshot}
        onClick={() => saveFromInbox(posting)}
      >
        저장
      </button>
    ),
  }));
  const savedRows = (key: Exclude<View, "inbox">): PostingRow[] =>
    groups[key].map((p) => {
      const done = p.status === "completed";
      const label = done ? "되돌리기" : "지원 완료";
      return {
        key: p.id,
        company: p.company,
        role: p.role,
        url: p.url,
        deadline: p.deadline,
        closed: key !== "planned",
        action: (
          <button
            className={styles.outline}
            aria-label={`${p.company} ${label}`}
            disabled={busy}
            onClick={() => toggleCompleted(p)}
          >
            {label}
          </button>
        ),
        remove: (
          <button
            className={styles.quiet}
            aria-label={`${p.company} 삭제`}
            disabled={busy}
            onClick={() => remove(p)}
          >
            삭제
          </button>
        ),
      };
    });
  const rows = view === "inbox" ? inboxRows : savedRows(view);
  const inboxBlocked = view === "inbox" && !!inbox.error;
  const roleNotice = (asBanner: boolean) => (
    <div
      className={asBanner ? styles.panelNotice : styles.panelMessage}
      role="status"
    >
      <span>
        {CHOOSE_ROLES_TEXT}. 고르기 전에는 직무가 있는 새 공고를 받지 않아요.
      </span>
      <button type="button" onClick={() => setSettingsOpen(true)}>
        받을 직무 고르기
      </button>
    </div>
  );
  const panelBody = () => {
    if (view === "inbox") {
      if (inbox.error)
        return (
          <div className={styles.panelMessage} role="status">
            <span>
              {INBOX_FAILURES[inbox.error] ?? "새 공고를 불러오지 못했어요"}
            </span>
            {inbox.error !== "NOT_CONFIGURED" && (
              <button
                disabled={inbox.loading}
                onClick={() => void inbox.reload()}
              >
                다시 시도
              </button>
            )}
          </div>
        );
      if (!visibleInbox)
        return (
          <p className={styles.panelMessage} role="status">
            불러오는 중
          </p>
        );
    } else if (!snapshot) {
      return null;
    }
    const askRoles = view === "inbox" && needsRoles;
    if (!rows.length)
      return askRoles ? (
        roleNotice(false)
      ) : (
        <p className={styles.panelMessage}>{EMPTY_LABELS[view]}</p>
      );
    return (
      <>
        {askRoles && roleNotice(true)}
        <PostingTable rows={rows} now={time} />
      </>
    );
  };
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.title}>
          <h1>지원 공고</h1>
          {urgentCount > 0 && (
            <span className={styles.urgentCount}>
              3일 내 마감 {urgentCount}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          <SubscriptionSwitch
            state={push.state}
            busy={push.busy}
            onEnabledChange={push.setEnabled}
            track={track}
          />
          <button
            ref={settingsButton}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() =>
              settingsOpen ? closeSettings() : setSettingsOpen(true)
            }
          >
            알림 설정
          </button>
          {settingsOpen && (
            <div className={styles.scrim} onClick={closeSettings} />
          )}
          {settingsOpen && (
            <div
              ref={settingsDialog}
              className={styles.settings}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-settings`}
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  closeSettings();
                } else if (event.key === "Tab") {
                  keepTabInSettings(event);
                }
              }}
            >
              <div className={styles.settingsHeading}>
                <h2 id={`${id}-settings`}>알림 설정</h2>
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={closeSettings}
                >
                  닫기
                </button>
              </div>
              <SubscriptionSettings
                state={push.state}
                failed={push.failed}
                busy={push.busy}
                categories={categories}
                onEnabledChange={push.setEnabled}
                onRolesChange={push.setRoles}
                onTest={push.test}
                onAnswer={push.record}
                track={track}
              />
            </div>
          )}
        </div>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          <span>{error.message}</span>
          {error.reload && (
            <button onClick={() => void load()} disabled={busy}>
              다시 시도
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
          <span>{problemText(snapshot.problems)}</span>
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
      {card && (
        <VisibilityCheck
          variant={card}
          state={push.state}
          busy={busy || push.busy}
          onTest={push.test}
          onAnswer={push.record}
          onLater={push.later}
          track={track}
          surface="options"
        />
      )}
      {!snapshot && !error && (
        <p className={styles.loadingStatus} role="status">
          불러오는 중
        </p>
      )}
      <section className={styles.listCard} aria-label="공고 목록">
        <div className={styles.tabBar}>
          <div
            role="tablist"
            aria-label="공고 분류"
            className={styles.tabs}
            onKeyDown={onTabKey}
          >
            {VIEWS.map((key) => (
              <button
                key={key}
                ref={(element) => {
                  tabs.current[key] = element;
                }}
                id={`${id}-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={view === key}
                aria-controls={`${id}-panel`}
                tabIndex={view === key ? 0 : -1}
                onClick={() => select(key)}
              >
                {TAB_LABELS[key]}
                {counts[key] !== undefined && (
                  <>
                    {" "}
                    <span className={styles.tabCount}>{counts[key]}</span>
                  </>
                )}
              </button>
            ))}
          </div>
          {!inboxBlocked && (
            <span className={styles.sort}>
              {view === "expired" ? "최근 마감순" : "마감순"}
            </span>
          )}
        </div>
        <div
          ref={panel}
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${view}`}
          tabIndex={-1}
          className={styles.panel}
        >
          {panelBody()}
        </div>
      </section>
    </main>
  );
}
