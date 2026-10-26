import type {
  NotificationPermission,
  VisibilityAnswer,
  VisibilityState,
} from "./notification-check";
import type { PushApiErrorCode, ServerPosting } from "./push-api";
import type { PushStatus } from "./push-subscription";
import { isRecord } from "./repository";

export const PUSH_MESSAGE = "careerForm.push";
const pushActions = [
  "status",
  "enable",
  "disable",
  "inbox",
  "test",
  "record",
  "later",
  "autosave",
] as const;
export type PushAction = (typeof pushActions)[number];
const visibilityAnswers: readonly VisibilityAnswer[] = ["seen", "not_seen"];
const recordSources = ["test", "card"] as const;
export type RecordSource = (typeof recordSources)[number];
export type PushCommand =
  | {
      type: typeof PUSH_MESSAGE;
      action: Exclude<PushAction, "record" | "autosave">;
    }
  | {
      type: typeof PUSH_MESSAGE;
      action: "record";
      answer: VisibilityAnswer;
      source: RecordSource;
    }
  | { type: typeof PUSH_MESSAGE; action: "autosave"; enabled: boolean };
export interface PushStateView {
  enabled: boolean;
  supported: boolean;
  status: PushStatus | null;
  permission: NotificationPermission;
  visibility: VisibilityState;
  autoSave: boolean;
  unread: number;
}
export type PushResponse =
  | { ok: true; state: PushStateView }
  | { ok: true; postings: ServerPosting[] }
  | { ok: false; code: PushApiErrorCode | "UNAVAILABLE" };

// The onboarding page may check, test and switch off; everything else stays
// with the management page.
export const ONBOARDING_PUSH_ACTIONS: readonly PushAction[] = [
  "status",
  "disable",
  "test",
  "record",
];
export type PushSenderPage = "options" | "onboarding";

export function pushSenderPage(
  sender: { id?: string; url?: string },
  extensionId: string,
): PushSenderPage | undefined {
  if (sender.id !== extensionId || !sender.url) return undefined;
  try {
    const url = new URL(sender.url);
    if (url.protocol !== "chrome-extension:" || url.hostname !== extensionId)
      return undefined;
    if (url.pathname === "/options.html") return "options";
    if (url.pathname === "/onboarding.html") return "onboarding";
    return undefined;
  } catch {
    return undefined;
  }
}
export function isPushActionAllowed(
  page: PushSenderPage,
  action: PushAction,
): boolean {
  return page === "options" || ONBOARDING_PUSH_ACTIONS.includes(action);
}

export function parsePushMessage(value: unknown): PushCommand | undefined {
  if (!isRecord(value) || value.type !== PUSH_MESSAGE) return undefined;
  const action = pushActions.find((candidate) => candidate === value.action);
  if (!action) return undefined;
  if (action === "record") {
    const answer = visibilityAnswers.find((a) => a === value.answer);
    const source = recordSources.find((s) => s === value.source);
    return answer && source
      ? { type: PUSH_MESSAGE, action, answer, source }
      : undefined;
  }
  if (action === "autosave")
    return typeof value.enabled === "boolean"
      ? { type: PUSH_MESSAGE, action, enabled: value.enabled }
      : undefined;
  return { type: PUSH_MESSAGE, action };
}
