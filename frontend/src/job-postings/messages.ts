import type { PostingInput } from "./model";
import { isRecord } from "./repository";
export const POSTING_MESSAGE = "careerForm.postings";
export const OPEN_POSTINGS = "careerForm.openPostings";
export type PostingCommand =
  | { type: typeof POSTING_MESSAGE; action: "list" | "retry" }
  | {
      type: typeof POSTING_MESSAGE;
      action: "save";
      input: PostingInput;
      id?: string;
      version?: number;
    }
  | {
      type: typeof POSTING_MESSAGE;
      action: "remove";
      id: string;
      version: number;
    }
  | {
      type: typeof POSTING_MESSAGE;
      action: "complete";
      id: string;
      version: number;
      completed: boolean;
    };
function validIdentity(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === "string" &&
    /^[\w-]+$/.test(value.id) &&
    Number.isSafeInteger(value.version) &&
    (value.version as number) > 0
  );
}
function validInput(value: unknown): value is PostingInput {
  return (
    isRecord(value) &&
    [value.company, value.role, value.url, value.timeZone].every(
      (v) => typeof v === "string",
    ) &&
    typeof value.deadline === "number" &&
    Number.isFinite(value.deadline) &&
    Array.isArray(value.minutes) &&
    value.minutes.length <= 2 &&
    value.minutes.every((v) => Number.isSafeInteger(v) && v > 0)
  );
}
export function parsePostingMessage(
  value: unknown,
): PostingCommand | undefined {
  if (!isRecord(value) || value.type !== POSTING_MESSAGE) return undefined;
  if (value.action === "list" || value.action === "retry")
    return { type: POSTING_MESSAGE, action: value.action };
  if (
    value.action === "save" &&
    validInput(value.input) &&
    ((value.id === undefined && value.version === undefined) ||
      validIdentity(value))
  )
    return value as unknown as PostingCommand;
  if (
    validIdentity(value) &&
    (value.action === "remove" ||
      (value.action === "complete" && typeof value.completed === "boolean"))
  )
    return value as unknown as PostingCommand;
  return undefined;
}
export function isPostingPage(
  sender: { id?: string; url?: string },
  extensionId: string,
): boolean {
  if (sender.id !== extensionId || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return (
      url.protocol === "chrome-extension:" &&
      url.hostname === extensionId &&
      url.pathname === "/options.html"
    );
  } catch {
    return false;
  }
}
