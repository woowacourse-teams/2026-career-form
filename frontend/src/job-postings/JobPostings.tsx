import { useCallback, useEffect, useRef, useState } from "react";
import { postingClient, type PostingClient } from "./client";
import type { Posting, PostingInput } from "./model";
import type { PostingSnapshot } from "./service";
import { PostingForm } from "./PostingForm";
import { PostingList } from "./PostingList";
import styles from "./JobPostings.module.css";
interface Props {
  client?: PostingClient;
  initialCreate?: boolean;
  now?: () => number;
}
export function JobPostings({
  client = postingClient,
  initialCreate = false,
  now = Date.now,
}: Props) {
  const [snapshot, setSnapshot] = useState<PostingSnapshot>();
  const [error, setError] = useState("");
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
  const addButton = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<string | null>(null);
  const restoreFocus = useRef(false);
  const page = useRef<HTMLElement>(null);
  const [form, setForm] = useState<Posting | "new" | null>(
    initialCreate ? "new" : null,
  );
  const [time, setTime] = useState(now);
  useEffect(() => {
    if (!form && restoreFocus.current) {
      const trigger = returnTo.current
        ? [
            ...(page.current?.querySelectorAll<HTMLButtonElement>(
              "button[data-edit-posting]",
            ) ?? []),
          ].find((button) => button.dataset.editPosting === returnTo.current)
        : undefined;
      (trigger ?? addButton.current)?.focus();
      restoreFocus.current = false;
    }
  }, [form]);
  const closeForm = () => {
    restoreFocus.current = true;
    setForm(null);
  };
  const openNew = () => {
    returnTo.current = null;
    setForm("new");
    setError("");
    setFeedback("");
  };
  const load = useCallback(async () => {
    try {
      setSnapshot(await client.list());
      setError("");
    } catch {
      setError("공고를 불러오지 못했습니다. 다시 시도해 주세요.");
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
            setError("");
          }
        })
        .catch(() => {
          if (active)
            setError("공고를 불러오지 못했습니다. 다시 시도해 주세요.");
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
    message: string,
    dismissForm = false,
  ) => {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      setSnapshot(await action());
      setFeedback(message);
      if (dismissForm) closeForm();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "공고 저장에 실패했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  };
  const save = async (input: PostingInput) => {
    const p = form && form !== "new" ? form : undefined;
    await mutate(
      async () => {
        const next = await client.save(input, p?.id, p?.version);
        const saved = p
          ? next.postings.find((row) => row.id === p.id)
          : undefined;
        setView(
          saved?.status === "completed"
            ? "completed"
            : input.deadline > now()
              ? "planned"
              : "expired",
        );
        return next;
      },
      "공고가 저장되었습니다.",
      true,
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
    planned: "관심 있는 공고를 추가하고 마감 전에 알림을 받아보세요.",
    expired: "마감이 지난 공고는 이곳에서 따로 확인할 수 있어요.",
    completed: "지원을 마친 공고를 완료로 표시하면 여기에 모아볼 수 있어요.",
  };
  const list = (postings: Posting[]) => (
    <PostingList
      postings={postings}
      now={time}
      busy={busy}
      onEdit={(p) => {
        returnTo.current = p.id;
        setFeedback("");
        setForm(p);
        setError("");
      }}
      onComplete={(p) =>
        void mutate(
          () => client.setCompleted(p.id, p.version, p.status !== "completed"),
          p.status === "completed"
            ? "지원 예정으로 되돌렸습니다."
            : "지원 완료로 표시하고 남은 알림을 취소했습니다.",
        )
      }
      onRemove={(p) =>
        void mutate(async () => {
          const next = await client.remove(p.id, p.version);
          addButton.current?.focus({ preventScroll: true });
          return next;
        }, "공고를 삭제했습니다.")
      }
    />
  );
  return (
    <main className={styles.page} ref={page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MY APPLICATIONS</p>
          <h1>지원 공고</h1>
          <p className={styles.subtitle}>
            관심 있는 공고부터 지원 완료까지, 한곳에서 챙기세요.
          </p>
        </div>
        {!form && (
          <button
            className={styles.primary}
            ref={addButton}
            onClick={openNew}
            disabled={!snapshot}
          >
            <span aria-hidden="true">＋</span> 공고 추가
          </button>
        )}
      </header>
      {error && (
        <div className={styles.error} role="alert">
          {error}{" "}
          <button onClick={() => void load()} disabled={busy}>
            목록 다시 불러오기
          </button>
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
              )
            }
          >
            알림 다시 시도
          </button>
        </div>
      ) : null}
      {!snapshot && !error && <p role="status">공고를 불러오는 중입니다.</p>}
      {snapshot &&
        (form ? (
          <PostingForm
            key={typeof form === "string" ? form : form.id}
            posting={form === "new" ? undefined : form}
            now={time}
            busy={busy}
            onSave={save}
            onCancel={closeForm}
          />
        ) : (
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
                  "공고를 저장해 두면 설정한 시간에 알려드려요."
                )}
              </p>
            </div>
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
                <h2>{headings[view]}</h2>
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
                    {view === "completed" ? "✓" : "+"}
                  </span>
                  <h3>
                    {!rows.length && view === "planned"
                      ? "지원할 공고를 저장해보세요."
                      : emptyTitles[view]}
                  </h3>
                  <p>{emptyDescriptions[view]}</p>
                  {view === "planned" && (
                    <button className={styles.primary} onClick={openNew}>
                      공고 저장하기
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        ))}
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
