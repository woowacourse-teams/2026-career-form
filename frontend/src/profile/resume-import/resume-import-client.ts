import { browser } from "wxt/browser";
import type {
  RepeatedProfileCategoryId,
  SingleProfileCategoryId,
} from "../model";

export const RESUME_IMPORT_MESSAGE = "careerForm.profile.resumeImport";

export type ResumeDraftErrorCode =
  | "EMPTY"
  | "INVALID_INPUT"
  | "TOO_LONG"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "NETWORK";

export interface ResumeDraftEntry {
  sectionId: string;
  values: Record<string, string>;
}
/**
 * The #469 response profile: no entry ids or identities. Date fields are
 * "YYYY-MM-DD", or "YYYY-MM" when the resume gave no day (draft-candidates
 * stores those as "YYYY-MM-01" and marks them); other date text is dropped.
 */
export type ResumeDraft = Record<
  SingleProfileCategoryId,
  Record<string, string>
> &
  Record<RepeatedProfileCategoryId, ResumeDraftEntry[]>;

export type ResumeDraftResult =
  | { ok: true; profile: ResumeDraft }
  | { ok: false; code: ResumeDraftErrorCode; retryAfterSeconds?: number };

export const SINGLE_DRAFT_CATEGORIES: readonly SingleProfileCategoryId[] = [
  "personal",
  "contact",
  "compensation",
  "military",
  "veteran",
  "disability",
];
export const REPEATED_DRAFT_CATEGORIES: readonly RepeatedProfileCategoryId[] = [
  "education",
  "languages",
  "certifications",
  "careers",
  "projects",
  "publications",
  "health",
];

const ERROR_CODES: readonly unknown[] = [
  "EMPTY",
  "INVALID_INPUT",
  "TOO_LONG",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "NOT_CONFIGURED",
  "NETWORK",
] satisfies ResumeDraftErrorCode[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const isStringValues = (value: unknown): value is Record<string, string> =>
  isRecord(value) &&
  Object.values(value).every((field) => typeof field === "string");

/** All thirteen categories in the documented shape; values are only strings. */
export function isResumeDraft(value: unknown): value is ResumeDraft {
  return (
    isRecord(value) &&
    SINGLE_DRAFT_CATEGORIES.every((id) => isStringValues(value[id])) &&
    REPEATED_DRAFT_CATEGORIES.every((id) => {
      const entries = value[id];
      return (
        Array.isArray(entries) &&
        entries.every(
          (entry) =>
            isRecord(entry) &&
            typeof entry.sectionId === "string" &&
            isStringValues(entry.values),
        )
      );
    })
  );
}

function isResult(value: unknown): value is ResumeDraftResult {
  if (!isRecord(value)) return false;
  if (value.ok === true) return isResumeDraft(value.profile);
  return (
    value.ok === false &&
    ERROR_CODES.includes(value.code) &&
    (value.retryAfterSeconds === undefined ||
      (Number.isSafeInteger(value.retryAfterSeconds) &&
        (value.retryAfterSeconds as number) >= 0))
  );
}

/** The resume text is personal data: it only travels in this message and is never stored. */
export async function requestResumeDraft(
  text: string,
  send: (message: unknown) => Promise<unknown> = (message) =>
    browser.runtime.sendMessage(message),
): Promise<ResumeDraftResult> {
  let reply: unknown;
  try {
    reply = await send({ type: RESUME_IMPORT_MESSAGE, text });
  } catch {
    return { ok: false, code: "NETWORK" };
  }
  return isResult(reply) ? reply : { ok: false, code: "UNAVAILABLE" };
}
