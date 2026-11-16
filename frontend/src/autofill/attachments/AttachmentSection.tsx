import { useEffect, useMemo, useRef, useState } from "react";

import {
  evidenceEntries,
  type EvidenceEntry,
} from "../../attachments/evidence-entries";
import {
  ATTACHMENT_LABEL,
  evidenceSlot,
  formatAttachmentSize,
  isLinkKind,
  type AttachmentLinks,
  type AttachmentList,
  type AttachmentMeta,
  type AttachmentSlot,
  type AttachmentStore,
} from "../../attachments/model";
import type { Profile } from "../../profile/model";
import styles from "../../autofill-demo/AutofillDemo.module.css";
import { attachFile as defaultAttachFile } from "./attach-file";
import { fillUrl as defaultFillUrl } from "./fill-url";
import {
  acceptMismatchReason,
  acceptsFile,
  FILLED_FIELD_REASON,
  findAttachmentFields,
  type AttachmentField,
} from "./file-fields";

type RowState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "attached"; message: string }
  | { status: "linked"; message: string }
  | { status: "failed"; message: string };

export interface AttachmentSectionProps {
  pageDocument: Document;
  store: AttachmentStore;
  profile?: Profile;
  attach?: typeof defaultAttachFile;
  fill?: typeof defaultFillUrl;
}

const LINKED_MESSAGE =
  "등록한 파일이 없어 링크를 입력했어요. 사이트의 URL 추가 버튼은 직접 눌러 주세요.";
const UNREADABLE_FILE =
  "프로필 파일을 읽지 못했어요. 프로필에서 다시 등록해 주세요.";

function compact(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/** Suggest an entry only when exactly one stored evidence is named nearby. */
function suggestedEvidence(
  field: AttachmentField,
  candidates: readonly EvidenceEntry[],
): string {
  const context = compact(`${field.label} ${field.context}`);
  const named = candidates.filter((entry) =>
    context.includes(compact(entry.label.split(" ")[0] ?? "")),
  );
  return named.length === 1 ? named[0]!.entryId : "";
}

interface RowPlan {
  choice: string;
  slot?: AttachmentSlot;
  meta?: AttachmentMeta;
  detail: string;
  ready: boolean;
  /** Stored link to type into the paired URL box when no file can be used. */
  link?: string;
}

/**
 * Lists profile-file fields of the application form and attaches each stored
 * file as soon as its field is confirmed. Undecided fields (no file, unclear
 * meaning, evidence without a single named entry) keep a manual button.
 */
export function AttachmentSection({
  pageDocument,
  store,
  profile,
  attach = defaultAttachFile,
  fill = defaultFillUrl,
}: AttachmentSectionProps) {
  const [fields] = useState<AttachmentField[]>(() =>
    findAttachmentFields(pageDocument),
  );
  const entries = useMemo(
    () => (profile ? evidenceEntries(profile) : []),
    [profile],
  );
  const [stored, setStored] = useState<AttachmentList | "error" | null>(null);
  const [links, setLinks] = useState<AttachmentLinks>({});
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [choices, setChoices] = useState<Record<number, string>>({});
  const autoAttached = useRef(false);

  useEffect(() => {
    if (fields.length === 0) return;
    let active = true;
    Promise.all([
      store.list(entries.map((entry) => entry.entryId)),
      store.loadLinks().catch(() => ({})),
    ])
      .then(([list, savedLinks]) => {
        if (!active) return;
        setLinks(savedLinks);
        setStored(list);
      })
      .catch(() => active && setStored("error"));
    return () => {
      active = false;
    };
  }, [fields, store, entries]);

  const storedEvidence = useMemo(
    () =>
      stored && stored !== "error"
        ? entries.filter((entry) => stored[evidenceSlot(entry.entryId)])
        : [],
    [entries, stored],
  );

  const planFor = (field: AttachmentField, index: number): RowPlan => {
    const plan = filePlanFor(field, index);
    const link = isLinkKind(field.kind) ? links[field.kind] : undefined;
    // A usable file always wins; the link only fills a paired URL box.
    if (
      !plan.ready &&
      link &&
      field.urlInput &&
      !field.blockedReason &&
      stored &&
      stored !== "error" &&
      (!plan.meta || !acceptsFile(field.element, plan.meta))
    )
      return { ...plan, link };
    return plan;
  };

  const filePlanFor = (field: AttachmentField, index: number): RowPlan => {
    const kindLabel = field.kind ? ATTACHMENT_LABEL[field.kind] : undefined;
    const evidence = field.kind === "evidence";
    const choice = evidence
      ? (choices[index] ?? suggestedEvidence(field, storedEvidence))
      : "";
    const slot: AttachmentSlot | undefined =
      field.kind === "evidence"
        ? choice
          ? evidenceSlot(choice)
          : undefined
        : field.kind;
    const meta =
      slot && stored && stored !== "error" ? stored[slot] : undefined;
    if (field.blockedReason)
      return {
        choice,
        detail: `입력 불가: ${field.blockedReason}`,
        ready: false,
      };
    if (stored === null)
      return {
        choice,
        detail: "프로필 파일을 확인하는 중이에요.",
        ready: false,
      };
    if (evidence && storedEvidence.length === 0)
      return {
        choice,
        detail: "프로필에 등록한 증빙 파일이 없어요.",
        ready: false,
      };
    if (evidence && !choice)
      return { choice, detail: "첨부할 증빙을 골라 주세요.", ready: false };
    if (!meta)
      return {
        choice,
        detail: `프로필에 등록한 ${kindLabel} 파일이 없어요.`,
        ready: false,
      };
    if (!acceptsFile(field.element, meta))
      return {
        choice,
        slot,
        meta,
        detail: `입력 불가: ${acceptMismatchReason(meta.type)}`,
        ready: false,
      };
    return {
      choice,
      slot,
      meta,
      detail: `첨부할 파일: ${meta.name} (${formatAttachmentSize(meta.size)})`,
      ready: true,
    };
  };

  const setRow = (index: number, state: RowState) =>
    setRows((current) => ({ ...current, [index]: state }));

  const run = async (
    index: number,
    slot: AttachmentSlot,
    field: AttachmentField,
  ) => {
    setRow(index, { status: "working" });
    try {
      const file = await store.loadFile(slot);
      if (!file) {
        setRow(index, { status: "failed", message: UNREADABLE_FILE });
        return;
      }
      const result = attach(currentElement(field), file);
      setRow(
        index,
        result.status === "attached"
          ? {
              status: "attached",
              message: `첨부했어요: ${file.name}. 사이트의 업로드·저장 버튼은 직접 눌러 주세요.`,
            }
          : { status: "failed", message: result.reason },
      );
    } catch {
      setRow(index, { status: "failed", message: UNREADABLE_FILE });
    }
  };

  // Sites often re-render an upload area after a nearby change; follow the
  // same field (same kind and label) instead of failing on the old node.
  const currentElement = (field: AttachmentField): HTMLInputElement => {
    if (field.element.isConnected) return field.element;
    const same = findAttachmentFields(pageDocument).filter(
      (candidate) =>
        candidate.kind === field.kind && candidate.label === field.label,
    );
    return same.length === 1 ? same[0]!.element : field.element;
  };

  const runLink = (index: number, field: AttachmentField, link: string) => {
    if (!field.urlInput) return;
    const result = fill(field.urlInput, link);
    setRow(
      index,
      result.status === "filled"
        ? { status: "linked", message: LINKED_MESSAGE }
        : { status: "failed", message: result.reason },
    );
  };

  useEffect(() => {
    if (!stored || stored === "error" || autoAttached.current) return;
    autoAttached.current = true;
    const ready = fields
      .map((field, index) => ({ field, index, plan: planFor(field, index) }))
      .filter(({ plan }) => plan.ready && plan.slot);
    const linkOnly = fields
      .map((field, index) => ({ field, index, plan: planFor(field, index) }))
      .filter(({ plan }) => plan.link);
    void (async () => {
      for (const { field, index, plan } of ready)
        await run(index, plan.slot!, field);
      for (const { field, index, plan } of linkOnly)
        runLink(index, field, plan.link!);
    })();
    // Runs once, when the stored files are first known.
  }, [stored]);

  // Successful and pending attachments stay silent; only fields that need
  // the user (unclear meaning, wrong format, a failure, an evidence choice).
  const needsUser = (field: AttachmentField, index: number): boolean => {
    const row = rows[index] ?? { status: "idle" };
    if (row.status === "failed" || row.status === "linked") return true;
    if (row.status !== "idle") return false;
    if (field.blockedReason) return field.blockedReason !== FILLED_FIELD_REASON;
    if (stored === null || stored === "error") return false;
    const plan = planFor(field, index);
    if (field.kind === "evidence")
      return (
        storedEvidence.length > 0 &&
        (choices[index] !== undefined ||
          !plan.choice ||
          (!!plan.meta && !plan.ready))
      );
    return !!plan.meta && !plan.ready && !plan.link;
  };
  const visible = fields
    .map((field, index) => ({ field, index }))
    .filter(({ field, index }) => needsUser(field, index));

  if (visible.length === 0 && stored !== "error") return null;

  return (
    <section aria-label="첨부 파일">
      <h3>첨부 파일</h3>
      {stored === "error" && (
        <p role="alert">프로필 첨부 파일을 불러오지 못했어요.</p>
      )}
      <ul className={styles.attachmentList}>
        {visible.map(({ field, index }) => {
          const row = rows[index] ?? { status: "idle" };
          const kindLabel = field.kind
            ? ATTACHMENT_LABEL[field.kind]
            : undefined;
          const evidence = field.kind === "evidence";
          const plan = planFor(field, index);
          const canAttach =
            plan.ready && (row.status === "idle" || row.status === "failed");
          return (
            <li key={index} className={styles.attachmentRow}>
              <div>
                <strong>{field.label}</strong>
                {kindLabel && <span> · {kindLabel} 칸</span>}
                {evidence &&
                  !field.blockedReason &&
                  storedEvidence.length > 0 && (
                    <label className={styles.attachmentChoice}>
                      첨부할 증빙
                      <select
                        value={plan.choice}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setChoices((current) => ({
                            ...current,
                            [index]: value,
                          }));
                        }}
                      >
                        <option value="">선택</option>
                        {storedEvidence.map((entry) => (
                          <option key={entry.entryId} value={entry.entryId}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                {row.status === "failed" ? (
                  <p role="alert">{row.message}</p>
                ) : row.status === "linked" ? (
                  <p role="status">{row.message}</p>
                ) : (
                  <p>{plan.detail}</p>
                )}
              </div>
              {field.kind && row.status !== "linked" && (
                <button
                  className={styles.grayButton}
                  type="button"
                  disabled={!canAttach}
                  aria-label={`${field.label}에 ${kindLabel} 첨부`}
                  onClick={() => plan.slot && void run(index, plan.slot, field)}
                >
                  {row.status === "failed" ? "다시 첨부" : "첨부"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
