import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalyticsEvent,
  AnalyticsProperties,
  TrackEvent,
} from "../../analytics/events";
import type { Profile } from "../model";
import {
  countCompletedCategories,
  type ProfileRepository,
} from "../profile-repository";
import { ImportCategoryList } from "../page-import/ImportCategoryList";
import { ImportConfirmCards } from "../page-import/ImportConfirmCards";
import { ImportSummary } from "../page-import/ImportSummary";
import {
  ImportConflictError,
  ImportSelectionError,
  saveImportSelection,
} from "../page-import/merge";
import type { ImportCandidate } from "../page-import/import-candidate";
import {
  buildReviewModel,
  defaultSelection,
  effectiveSelection,
  initialDecisions,
  rejectedGroups,
  toggleRows,
  toImportSelection,
  type ReviewDecisions,
} from "../page-import/review-model";
import pageStyles from "../page-import/PageImport.module.css";
import pageCss from "../page-import/PageImport.module.css?inline";
import reviewStyles from "../page-import/ImportReview.module.css";
import reviewCss from "../page-import/ImportReview.module.css?inline";
import { draftToCandidates, type DraftSkipReason } from "./draft-candidates";
import { readPdfText } from "./pdf-text";
import {
  readResumeText,
  RESUME_MAX_CHARS,
  type ResumeFileType,
  type ResumeRejection,
  type ResumeText,
} from "./resume-file";
import {
  requestResumeDraft,
  type ResumeDraftErrorCode,
  type ResumeDraftResult,
} from "./resume-import-client";
import { logResumeImport } from "./resume-log";
import styles from "./ResumeImport.module.css";
import css from "./ResumeImport.module.css?inline";

interface Props {
  file: File;
  repository: ProfileRepository;
  analytics?: { track: TrackEvent; properties: AnalyticsProperties };
  readText?: (file: File) => Promise<ResumeText>;
  requestDraft?: (text: string) => Promise<ResumeDraftResult>;
  /** Opens the OS file dialog again ("바꾸기", "다른 파일"). */
  onPickFile(): void;
  onSaved(profile: Profile, savedCount: number): void;
  onClose(): void;
}

interface Extracted {
  fileType: ResumeFileType;
  text: string;
  chars: number;
}
type Phase =
  | { kind: "reading" }
  | {
      kind: "rejected";
      reason: ResumeRejection;
      fileType?: ResumeFileType;
      chars?: number;
    }
  | ({ kind: "converting" } & Extracted)
  | ({
      kind: "failed";
      code: ResumeDraftErrorCode | "PROFILE_LOAD";
      retryAfterSeconds?: number;
    } & Extracted)
  | {
      kind: "review";
      fileType: ResumeFileType;
      chars: number;
      candidates: readonly ImportCandidate[];
      skipped: Partial<Record<DraftSkipReason, number>>;
    };

const NO_DECISIONS: ReviewDecisions = { names: {}, dates: {}, targets: {} };
const LIMIT = RESUME_MAX_CHARS.toLocaleString("ko-KR");
const count = (n: number) => n.toLocaleString("ko-KR");

const defaultReadText = (file: File) => readResumeText(file, readPdfText);

function rejectionMessage(reason: ResumeRejection, fileType?: ResumeFileType) {
  switch (reason) {
    case "unsupported_type":
      return "PDF · MD · TXT만 가져올 수 있어요";
    case "too_large":
      return "5MB까지 가져올 수 있어요";
    case "no_text":
      return fileType === "pdf"
        ? "글자를 읽을 수 없는 PDF예요"
        : "글자가 없는 파일이에요";
    case "too_long":
      return `${LIMIT}자까지 가져올 수 있어요`;
    case "read_failed":
      return "파일을 읽지 못했어요";
  }
}
function failureMessage(code: ResumeDraftErrorCode | "PROFILE_LOAD") {
  if (code === "TOO_LONG") return `${LIMIT}자까지 가져올 수 있어요`;
  if (code === "EMPTY") return "글자가 없는 파일이에요";
  if (code === "PROFILE_LOAD") return "프로필을 불러오지 못했어요";
  return "초안을 만들지 못했어요";
}
// Sending the same text again cannot change these answers.
const retryable = (code: ResumeDraftErrorCode | "PROFILE_LOAD") =>
  !["TOO_LONG", "EMPTY", "INVALID_INPUT"].includes(code);

const SKIPPED_TEXT: Record<DraftSkipReason, string> = {
  catalog_unmatched: "목록에 없어 비워 둠",
  invalid_value: "저장할 수 없는 형식",
};

function fileSize(bytes: number) {
  return `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)}MB`;
}
function fileLabel(file: File, fileType?: ResumeFileType) {
  if (fileType) return fileType.toUpperCase();
  const dot = file.name.lastIndexOf(".");
  return dot > 0 ? file.name.slice(dot + 1, dot + 6).toUpperCase() : "파일";
}

function FileRow({
  file,
  fileType,
  chars,
  bad = false,
  onChange,
}: {
  file: File;
  fileType?: ResumeFileType;
  chars?: number;
  bad?: boolean;
  onChange?: () => void;
}) {
  return (
    <div className={styles.fileRow}>
      <span className={styles.fileType} data-bad={bad}>
        {fileLabel(file, fileType)}
      </span>
      <span className={styles.fileName}>
        <b>{file.name}</b>
        <small>
          {fileSize(file.size)}
          {chars !== undefined && ` · ${count(chars)}자`}
        </small>
      </span>
      {onChange ? (
        <button
          type="button"
          className={reviewStyles.textButton}
          onClick={onChange}
        >
          바꾸기
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

/** Logs the local steps once per file; nothing here leaves the extension. */
async function readAndLog(
  file: File,
  readText: (file: File) => Promise<ResumeText>,
): Promise<ResumeText> {
  const result = await readText(file).catch((): ResumeText => ({
    ok: false,
    reason: "read_failed",
  }));
  if (
    !result.ok &&
    (result.reason === "unsupported_type" || result.reason === "too_large")
  ) {
    logResumeImport({
      stage: "file_read",
      outcome: "failed",
      fileType: result.fileType,
      reason: result.reason,
    });
    return result;
  }
  logResumeImport({
    stage: "file_read",
    outcome: "ok",
    fileType: result.fileType,
  });
  logResumeImport(
    result.ok
      ? {
          stage: "text_extract",
          outcome: "ok",
          fileType: result.fileType,
          chars: result.chars,
        }
      : {
          stage: "text_extract",
          outcome: "failed",
          fileType: result.fileType,
          reason: result.reason,
          chars: result.chars,
        },
  );
  return result;
}

/**
 * Resume file -> local text -> server draft (started on its own once the text is
 * read) -> the existing import review and merge. The file and its text stay in
 * memory only.
 */
export function ResumeImport({
  file,
  repository,
  analytics,
  readText = defaultReadText,
  requestDraft = requestResumeDraft,
  onPickFile,
  onSaved,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "reading" });
  const [wait, setWait] = useState(0);
  const [baseline, setBaseline] = useState<Profile>();
  const [decisions, setDecisions] = useState(NO_DECISIONS);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(false);
  const pending = useRef(false);
  // Survives StrictMode's effect replay so one file is read, logged and counted once.
  const reading = useRef<{ file: File; result: Promise<ResumeText> }>(
    undefined,
  );

  const track = useCallback(
    (event: AnalyticsEvent) => {
      try {
        analytics?.track(event, analytics.properties);
      } catch {
        // Telemetry must not change the import.
      }
    },
    [analytics],
  );

  // Callers may pass new functions each render; only a new file restarts the read.
  const latest = useRef({ readText, track });
  latest.current = { readText, track };
  // Same StrictMode guarantee as the read: one file starts one conversion.
  const converted = useRef<File>(undefined);
  const startConversion = useRef<(extracted: Extracted) => void>(() => {});
  useEffect(() => {
    alive.current = true;
    let active = true;
    if (reading.current?.file !== file) {
      const { readText: read, track: record } = latest.current;
      record("resume_import_viewed");
      const result = readAndLog(file, read);
      void result.then((text) => {
        if (!text.ok) record("resume_import_failed");
      });
      reading.current = { file, result };
    }
    void reading.current.result.then((read) => {
      if (!active) return;
      if (read.ok) {
        if (converted.current === file) return;
        converted.current = file;
        startConversion.current(read);
        return;
      }
      setPhase({
        kind: "rejected",
        reason: read.reason,
        fileType: read.fileType,
        chars: read.chars,
      });
    });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [file]);

  const retryAfter = phase.kind === "failed" ? phase.retryAfterSeconds : 0;
  useEffect(() => {
    if (!retryAfter) return;
    setWait(retryAfter);
    const timer = globalThis.setInterval(() => {
      setWait((left) => {
        if (left <= 1) globalThis.clearInterval(timer);
        return Math.max(0, left - 1);
      });
    }, 1000);
    return () => globalThis.clearInterval(timer);
  }, [phase, retryAfter]);

  const convert = async ({ fileType, text, chars }: Extracted) => {
    // Only the extracted fields move on; the caller's phase may carry its own kind.
    const extracted: Extracted = { fileType, text, chars };
    setPhase({ kind: "converting", ...extracted });
    const reply = await requestDraft(extracted.text);
    if (!alive.current) return;
    if (!reply.ok) {
      logResumeImport({
        stage: "server_request",
        outcome: "failed",
        reason: reply.code,
        chars: extracted.chars,
      });
      track("resume_import_failed");
      setPhase({
        kind: "failed",
        ...extracted,
        code: reply.code,
        retryAfterSeconds: reply.retryAfterSeconds,
      });
      return;
    }
    const conversion = draftToCandidates(reply.profile);
    logResumeImport({
      stage: "server_request",
      outcome: "ok",
      chars: extracted.chars,
      draftCounts: conversion.stats.draftCounts,
    });
    logResumeImport({
      stage: "catalog_match",
      outcome: "ok",
      catalogMatched: conversion.stats.catalogMatched,
      catalogEmptied: conversion.stats.catalogEmptied,
      invalid: conversion.skipped.invalid_value ?? 0,
      rows: conversion.candidates.length,
      monthDates: conversion.stats.monthDates,
    });
    let profile: Profile;
    try {
      profile = await repository.load();
    } catch {
      if (alive.current)
        setPhase({ kind: "failed", ...extracted, code: "PROFILE_LOAD" });
      return;
    }
    if (!alive.current) return;
    const start = initialDecisions(conversion.candidates, profile);
    setBaseline(profile);
    setDecisions(start);
    setSelected(
      defaultSelection(
        buildReviewModel(conversion.candidates, profile, start).rows,
      ),
    );
    setError("");
    // The text is not kept once the draft exists.
    setPhase({
      kind: "review",
      fileType: extracted.fileType,
      chars: extracted.chars,
      candidates: conversion.candidates,
      skipped: conversion.skipped,
    });
  };

  startConversion.current = (extracted) => void convert(extracted);

  const candidates = phase.kind === "review" ? phase.candidates : undefined;
  const model = useMemo(
    () =>
      candidates &&
      baseline &&
      buildReviewModel(candidates, baseline, decisions),
    [candidates, baseline, decisions],
  );
  const chosen =
    model && baseline ? effectiveSelection(model, selected, baseline) : {};
  const chosenCount = Object.keys(chosen).length;
  const duplicates =
    model && baseline ? rejectedGroups(model, selected, baseline).length : 0;

  const decide = (next: ReviewDecisions) => {
    if (!model || !baseline || !candidates) return;
    const after = buildReviewModel(candidates, baseline, next);
    const before = new Map(model.rows.map((row) => [row.key, row.status]));
    const moved = after.rows.filter((r) => before.get(r.key) !== r.status);
    // Same restart rule as the page import: new values on, the rest off.
    const on = moved.filter((r) => r.status === "new" && !r.sensitive);
    const off = moved.filter((r) => !on.includes(r));
    setDecisions(next);
    setSelected((current) =>
      toggleRows(
        after.rows,
        toggleRows(
          after.rows,
          current,
          off.map((r) => r.key),
          false,
        ),
        on.map((r) => r.key),
        true,
      ),
    );
    setError("");
  };
  const toggle = (keys: readonly string[], checked: boolean) => {
    if (model) setSelected(toggleRows(model.rows, selected, keys, checked));
  };

  const save = async () => {
    if (pending.current || !model || !baseline || !chosenCount || !candidates)
      return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await saveImportSelection(
        repository,
        baseline,
        toImportSelection(model, chosen),
      );
      logResumeImport({ stage: "save", outcome: "ok", saved: chosenCount });
      track("resume_import_saved");
      if (countCompletedCategories(saved) > 0 && analytics)
        try {
          analytics.track("profile_first_saved", analytics.properties);
        } catch {
          // Telemetry must not turn a completed save into a failure.
        }
      if (alive.current) onSaved(saved, chosenCount);
    } catch (failure) {
      const reason =
        failure instanceof ImportConflictError
          ? "conflict"
          : failure instanceof ImportSelectionError
            ? "invalid_selection"
            : "storage_error";
      logResumeImport({ stage: "save", outcome: "failed", reason });
      track("resume_import_failed");
      if (!alive.current) return;
      if (reason === "conflict") {
        try {
          const latest = await repository.load();
          if (!alive.current) return;
          const start = initialDecisions(candidates, latest);
          setBaseline(latest);
          setDecisions(start);
          setSelected(
            defaultSelection(buildReviewModel(candidates, latest, start).rows),
          );
          setError("프로필이 바뀌었어요. 다시 확인해 주세요");
        } catch {
          if (alive.current) setError("프로필을 불러오지 못했어요");
        }
      } else
        setError(
          reason === "invalid_selection"
            ? "저장할 수 없는 항목이 있어요"
            : "저장하지 못했어요. 다시 시도해 주세요",
        );
    } finally {
      pending.current = false;
      if (alive.current) setSaving(false);
    }
  };

  const skippedEntries = (
    phase.kind === "review" ? Object.entries(phase.skipped) : []
  ) as [DraftSkipReason, number][];
  const skippedTotal = skippedEntries.reduce((sum, [, n]) => sum + n, 0);

  return (
    <section
      className={pageStyles.importer}
      aria-label="이력서에서 프로필 가져오기"
    >
      <style>
        {pageCss}
        {reviewCss}
        {css}
      </style>
      {phase.kind === "reading" && (
        <p role="status" className={pageStyles.status}>
          글자를 읽고 있어요
        </p>
      )}

      {phase.kind === "rejected" && (
        <>
          <FileRow
            file={file}
            fileType={phase.fileType}
            chars={phase.chars}
            bad
          />
          <p role="alert" className={pageStyles.error}>
            {rejectionMessage(phase.reason, phase.fileType)}
          </p>
          <p className={styles.noSend}>서버로 보내지 않았어요</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={reviewStyles.secondaryButton}
              onClick={onPickFile}
            >
              다른 파일
            </button>
            <div className={`${pageStyles.exitActions} ${styles.exit}`}>
              <button type="button" onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
        </>
      )}

      {phase.kind === "converting" && (
        <>
          <FileRow file={file} fileType={phase.fileType} chars={phase.chars} />
          <p role="status" className={pageStyles.status}>
            이력서를 정리하고 있어요
          </p>
          <ol className={styles.steps} aria-label="진행 단계">
            <li data-state="done">
              <span className={styles.dot} aria-hidden="true" />
              글자 읽기
              <small>{count(phase.chars)}자</small>
            </li>
            <li data-state="now">
              <span className={styles.dot} aria-hidden="true" />
              초안 만들기
              <small />
            </li>
            <li data-state="next">
              <span className={styles.dot} aria-hidden="true" />
              항목 맞추기
              <small />
            </li>
          </ol>
          <p className={styles.noSend}>글자만 전송 · 저장 안 함</p>
          <div className={pageStyles.exitActions}>
            <button type="button" onClick={onClose}>
              취소
            </button>
          </div>
        </>
      )}

      {phase.kind === "failed" && (
        <>
          <FileRow file={file} fileType={phase.fileType} chars={phase.chars} />
          <p role="alert" className={pageStyles.error}>
            {failureMessage(phase.code)}
          </p>
          <p className={styles.noSend}>프로필은 그대로예요</p>
          <div className={styles.actions}>
            {retryable(phase.code) ? (
              <button
                type="button"
                className={reviewStyles.primaryButton}
                disabled={wait > 0}
                onClick={() => void convert(phase)}
              >
                {wait > 0 ? `다시 시도 · ${wait}초` : "다시 시도"}
              </button>
            ) : (
              <button
                type="button"
                className={reviewStyles.secondaryButton}
                onClick={onPickFile}
              >
                다른 파일
              </button>
            )}
            <div className={`${pageStyles.exitActions} ${styles.exit}`}>
              <button type="button" onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
        </>
      )}

      {phase.kind === "review" && (
        <>
          {error && (
            <p role="alert" className={pageStyles.error}>
              {error}
            </p>
          )}
          {model && model.rows.length > 0 ? (
            <fieldset disabled={saving} className={pageStyles.fields}>
              <legend hidden>가져올 정보 확인</legend>
              <ImportSummary rows={model.rows} chosen={chosen} />
              <ImportConfirmCards
                confirmations={model.confirmations}
                decisions={decisions}
                duplicateCount={duplicates}
                onDecide={decide}
                onPresent={() => {}}
              />
              <ImportCategoryList
                rows={model.rows}
                chosen={chosen}
                decisions={decisions}
                onToggle={toggle}
                onPresent={() => {}}
                onDecide={decide}
              />
            </fieldset>
          ) : (
            <p className={pageStyles.empty}>가져올 정보가 없어요</p>
          )}
          {skippedTotal > 0 && (
            <details className={pageStyles.skipped}>
              <summary>가져올 수 없는 {skippedTotal}개 보기</summary>
              <ul>
                {skippedEntries.map(([reason, n]) => (
                  <li key={reason}>
                    {SKIPPED_TEXT[reason]}: {n}개
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className={pageStyles.footer}>
            {model && model.rows.length > 0 && (
              <>
                <button
                  type="button"
                  className={pageStyles.saveButton}
                  disabled={!chosenCount || saving}
                  aria-busy={saving}
                  aria-label={`프로필에 저장하기 ${chosenCount}`}
                  onClick={() => void save()}
                >
                  프로필에 저장
                  <span className={pageStyles.badge}>{chosenCount}</span>
                </button>
                <p className={pageStyles.footNote}>고른 정보만 저장해요</p>
              </>
            )}
            <div className={pageStyles.exitActions}>
              {!model?.rows.length && (
                <button type="button" disabled={saving} onClick={onPickFile}>
                  다른 파일
                </button>
              )}
              <button type="button" disabled={saving} onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
