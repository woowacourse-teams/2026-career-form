import { useCallback, useEffect, useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [form, setForm] = useState<Posting | "new" | null>(
    initialCreate ? "new" : null,
  );
  const [time, setTime] = useState(now);
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
    closeForm = false,
  ) => {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      setSnapshot(await action());
      setFeedback(message);
      if (closeForm) setForm(null);
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
      () => client.save(input, p?.id, p?.version),
      "공고가 저장되었습니다.",
      true,
    );
  };
  const rows = [...(snapshot?.postings ?? [])].sort(
    (a, b) => a.deadline - b.deadline,
  );
  const selected = rows.filter((p) => (p.status === "completed") === completed);
  const list = (postings: Posting[]) => (
    <PostingList
      postings={postings}
      now={time}
      busy={busy}
      onEdit={(p) => {
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
      onRemove={(p) => {
        if (window.confirm("이 공고를 삭제하고 남은 알림을 취소할까요?"))
          void mutate(
            () => client.remove(p.id, p.version),
            "공고를 삭제했습니다.",
          );
      }}
    />
  );
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CAREER FORM / MY APPLICATIONS</p>
          <h1>지원 공고</h1>
          <p>지원할 곳을 모으고, 마감 전에 다시 만나요.</p>
        </div>
        {!form && (
          <button
            className={styles.primary}
            onClick={() => {
              setForm("new");
              setError("");
              setFeedback("");
            }}
            disabled={!snapshot}
          >
            공고 추가
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
      {feedback && <p role="status">{feedback}</p>}
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
            onCancel={() => setForm(null)}
          />
        ) : (
          <>
            <nav className={styles.tabs} aria-label="지원 상태">
              <button
                aria-pressed={!completed}
                onClick={() => setCompleted(false)}
              >
                지원 예정 ({rows.filter((p) => p.status === "planned").length})
              </button>
              <button
                aria-pressed={completed}
                onClick={() => setCompleted(true)}
              >
                지원 완료 ({rows.filter((p) => p.status === "completed").length}
                )
              </button>
            </nav>
            {!rows.length ? (
              <p className={styles.empty}>지원할 공고를 저장해보세요.</p>
            ) : completed ? (
              list(selected)
            ) : (
              <>
                <section aria-label="다가오는 마감">
                  {list(selected.filter((p) => p.deadline > time))}
                </section>
                {selected.some((p) => p.deadline <= time) && (
                  <section aria-label="지난 마감">
                    <h2>지난 마감</h2>
                    <p>마감이 지나도 지원 완료로 자동 변경하지 않습니다.</p>
                    {list(selected.filter((p) => p.deadline <= time))}
                  </section>
                )}
              </>
            )}
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
