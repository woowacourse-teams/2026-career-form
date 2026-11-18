import { PROFILE_CATEGORIES } from "../field-definitions";

/** One prefix for every record so a single Console filter follows an import. */
export const RESUME_IMPORT_LOG_PREFIX = "[CareerForm resume-import]";

export type ResumeImportStage =
  "file_read" | "text_extract" | "server_request" | "catalog_match" | "save";

const REASONS = [
  // Local file checks; none of these sends a request.
  "unsupported_type",
  "too_large",
  "no_text",
  "too_long",
  "read_failed",
  // Server and relay codes.
  "EMPTY",
  "INVALID_INPUT",
  "TOO_LONG",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "NOT_CONFIGURED",
  "NETWORK",
  // Save.
  "conflict",
  "invalid_selection",
  "storage_error",
] as const;
export type ResumeImportReason = (typeof REASONS)[number];
const FILE_TYPES = ["pdf", "md", "txt"] as const;
const COUNTS = [
  "chars",
  "catalogMatched",
  "catalogEmptied",
  "invalid",
  "rows",
  "monthDates",
  "saved",
] as const;

export interface ResumeImportRecord {
  stage: ResumeImportStage;
  outcome: "ok" | "failed";
  fileType?: (typeof FILE_TYPES)[number];
  reason?: ResumeImportReason;
  chars?: number;
  /** Values per single category and entries per repeated category. */
  draftCounts?: Partial<Record<string, number>>;
  catalogMatched?: number;
  catalogEmptied?: number;
  invalid?: number;
  rows?: number;
  /** Dates given as YYYY-MM whose day was filled with 01. */
  monthDates?: number;
  saved?: number;
}

const CATEGORY_IDS = new Set<string>(PROFILE_CATEGORIES.map((c) => c.id));
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/**
 * De-identified structure only: fixed stage, outcome, file type and reason codes,
 * counts, and per-category counts keyed by category id. Anything else is dropped,
 * so a value, file name or text cannot reach the Console through this function.
 */
export function logResumeImport(
  record: ResumeImportRecord,
  sink: (...data: unknown[]) => void = console.info,
): void {
  const safe: Record<string, unknown> = {
    outcome: record.outcome === "ok" ? "ok" : "failed",
  };
  if (REASONS.includes(record.reason as ResumeImportReason))
    safe.reason = record.reason;
  if (FILE_TYPES.includes(record.fileType as (typeof FILE_TYPES)[number]))
    safe.fileType = record.fileType;
  for (const key of COUNTS) if (isCount(record[key])) safe[key] = record[key];
  if (record.draftCounts) {
    const counts = Object.fromEntries(
      Object.entries(record.draftCounts).filter(
        ([id, count]) => CATEGORY_IDS.has(id) && isCount(count),
      ),
    );
    if (Object.keys(counts).length) safe.draftCounts = counts;
  }
  sink(RESUME_IMPORT_LOG_PREFIX, record.stage, safe);
}
