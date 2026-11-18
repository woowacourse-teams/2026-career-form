import { useCallback, useEffect, useRef, useState } from "react";

import {
  ATTACHMENT_LABEL,
  ATTACHMENT_RULES,
  AttachmentValidationError,
  attachmentFileError,
  formatAttachmentSize,
  isLinkKind,
  SINGLE_ATTACHMENT_KINDS,
  type LinkKind,
  slotKind,
  type AttachmentMeta,
  type AttachmentSlot,
  type AttachmentStore,
} from "../../src/attachments/model";
import styles from "./App.module.css";

interface AttachmentManagerProps {
  store: AttachmentStore;
  confirmDelete(message: string): boolean;
}

type Feedback = { kind: "status" | "error"; message: string };

const SAVE_FAILED =
  "파일을 저장하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

interface AttachmentSlotControlProps {
  store: AttachmentStore;
  slot: AttachmentSlot;
  /** Name used in buttons and messages, e.g. "포트폴리오" or "TOEIC 증빙". */
  label: string;
  confirmDelete(message: string): boolean;
  heading?: boolean;
}

/** Register, replace or delete the one file kept in a slot. */
export function AttachmentSlotControl({
  store,
  slot,
  label,
  confirmDelete,
  heading = false,
}: AttachmentSlotControlProps) {
  const kind = slotKind(slot);
  const [meta, setMeta] = useState<AttachmentMeta | null | "error">();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const entryId = kind === "evidence" ? slot.slice("evidence:".length) : "";
      const list = await store.list(entryId ? [entryId] : []);
      setMeta(list[slot] ?? null);
    } catch {
      setMeta("error");
    }
  }, [store, slot, kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = async (file: File) => {
    const invalid = attachmentFileError(file, kind);
    if (invalid) {
      setFeedback({ kind: "error", message: invalid });
      return;
    }
    setBusy(true);
    try {
      await store.save(slot, file);
      setFeedback({ kind: "status", message: `${label} 파일을 등록했어요.` });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof AttachmentValidationError
            ? error.message
            : SAVE_FAILED,
      });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const remove = async () => {
    if (!confirmDelete(`등록한 ${label} 파일을 삭제할까요?`)) return;
    setBusy(true);
    try {
      await store.remove(slot);
      setFeedback({ kind: "status", message: `${label} 파일을 삭제했어요.` });
    } catch {
      setFeedback({
        kind: "error",
        message: "파일을 삭제하지 못했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const stored = meta && meta !== "error" ? meta : undefined;
  return (
    <div className={styles.attachmentItem}>
      <div className={styles.attachmentInfo}>
        {heading && <h3>{label}</h3>}
        {stored ? (
          <p>
            <span className={styles.attachmentName}>{stored.name}</span>
            <span>
              {formatAttachmentSize(stored.size)} ·{" "}
              {formatDate(stored.updatedAt)} 등록
            </span>
          </p>
        ) : (
          <p className={meta === "error" ? styles.attachmentError : undefined}>
            {meta === undefined
              ? "불러오는 중"
              : meta === "error"
                ? "첨부 파일을 불러오지 못했어요."
                : "등록된 파일이 없어요."}
          </p>
        )}
        {feedback && (
          <p
            className={
              feedback.kind === "error" ? styles.attachmentError : undefined
            }
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        )}
      </div>
      <div className={styles.attachmentActions}>
        <button
          className={styles.transferButton}
          type="button"
          disabled={busy || meta === undefined}
          onClick={() => input.current?.click()}
        >
          {stored ? `${label} 교체` : `${label} 등록`}
        </button>
        {stored && (
          <button
            className={styles.transferButton}
            type="button"
            disabled={busy}
            onClick={() => void remove()}
          >
            {label} 삭제
          </button>
        )}
        <input
          ref={input}
          className={styles.importInput}
          type="file"
          tabIndex={-1}
          accept={ATTACHMENT_RULES[kind].accept}
          aria-label={`${label} 파일`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void register(file);
          }}
        />
      </div>
    </div>
  );
}

/** Optional link used only where an application field takes a URL instead of a file. */
export function AttachmentLinkControl({
  store,
  kind,
  label,
}: {
  store: AttachmentStore;
  kind: LinkKind;
  label: string;
}) {
  const [saved, setSaved] = useState<string>();
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();

  useEffect(() => {
    let active = true;
    store
      .loadLinks()
      .then((links) => {
        if (!active) return;
        setSaved(links[kind]);
        setDraft(links[kind] ?? "");
      })
      .catch(() => undefined)
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [store, kind]);

  const save = async () => {
    setBusy(true);
    try {
      const value = await store.saveLink(kind, draft);
      setSaved(value);
      setDraft(value);
      setFeedback({ kind: "status", message: `${label} 링크를 저장했어요.` });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof AttachmentValidationError
            ? error.message
            : "링크를 저장하지 못했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await store.removeLink(kind);
      setSaved(undefined);
      setDraft("");
      setFeedback({ kind: "status", message: `${label} 링크를 삭제했어요.` });
    } catch {
      setFeedback({
        kind: "error",
        message: "링크를 삭제하지 못했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.attachmentLink}>
      <label>
        <span>링크(선택)</span>
        <input
          type="url"
          inputMode="url"
          aria-label={`${label} 링크`}
          placeholder="https://"
          value={draft}
          disabled={!loaded || busy}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
      </label>
      <div className={styles.attachmentActions}>
        <button
          className={styles.transferButton}
          type="button"
          disabled={!loaded || busy || draft.trim() === (saved ?? "")}
          onClick={() => void save()}
        >
          {label} 링크 저장
        </button>
        {saved && (
          <button
            className={styles.transferButton}
            type="button"
            disabled={busy}
            onClick={() => void remove()}
          >
            {label} 링크 삭제
          </button>
        )}
      </div>
      <p className={styles.attachmentLinkHint}>
        파일을 넣을 수 있는 칸에는 파일을 우선 첨부하고, 등록한 파일이 없을 때만
        지원서의 URL 칸에 이 링크를 넣어요.
      </p>
      {feedback && (
        <p
          className={
            feedback.kind === "error" ? styles.attachmentError : undefined
          }
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}

/** Resume, portfolio and photo files kept in this browser, apart from the profile JSON. */
export function AttachmentManager({
  store,
  confirmDelete,
}: AttachmentManagerProps) {
  return (
    <div>
      <p className={styles.attachmentsGuide}>
        이력서·경력기술서와 포트폴리오는 PDF 20MB, 증명사진은 JPG·PNG 5MB
        이하예요. 파일과 링크는 이 브라우저에만 저장되고 프로필 내보내기에는
        포함되지 않아요. 어학·자격 증빙은 각 항목의 증빙 첨부에서 등록해요.
      </p>
      <ul className={styles.attachmentItems}>
        {SINGLE_ATTACHMENT_KINDS.map((kind) => (
          <li key={kind}>
            <AttachmentSlotControl
              store={store}
              slot={kind}
              label={ATTACHMENT_LABEL[kind]}
              confirmDelete={confirmDelete}
              heading
            />
            {isLinkKind(kind) && (
              <AttachmentLinkControl
                store={store}
                kind={kind}
                label={ATTACHMENT_LABEL[kind]}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
