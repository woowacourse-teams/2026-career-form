import type {
  NotificationPermission,
  VisibilityAnswer,
  VisibilityState,
} from "./notification-check";
import type { JobCategoriesView } from "./job-roles";
import {
  isRoleCode,
  type PushApiErrorCode,
  type ServerPosting,
} from "./push-api";
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
  "categories",
  "roles",
] as const;
export type PushAction = (typeof pushActions)[number];
const visibilityAnswers: readonly VisibilityAnswer[] = ["seen", "not_seen"];
const recordSources = ["test", "card"] as const;
export type RecordSource = (typeof recordSources)[number];
export type PushCommand =
  | {
      type: typeof PUSH_MESSAGE;
      action: Exclude<PushAction, "record" | "roles">;
    }
  | {
      type: typeof PUSH_MESSAGE;
      action: "record";
      answer: VisibilityAnswer;
      source: RecordSource;
    }
  | {
      type: typeof PUSH_MESSAGE;
      action: "roles";
      roles: string[];
    };
export interface PushStateView {
  enabled: boolean;
  supported: boolean;
  status: PushStatus | null;
  permission: NotificationPermission;
  visibility: VisibilityState;
  unread: number;
  // Selected role codes; empty until the user picks some.
  roles: string[];
}
export type PushResponse =
  | { ok: true; state: PushStateView }
  | { ok: true; postings: ServerPosting[] }
  | { ok: true; categories: JobCategoriesView }
  | { ok: false; code: PushApiErrorCode | "UNAVAILABLE" };

// The onboarding page sets alerts up end to end: switch on or off, test, and
// choose roles. The inbox and "later" stay with the management page.
export const ONBOARDING_PUSH_ACTIONS: readonly PushAction[] = [
  "status",
  "enable",
  "disable",
  "test",
  "record",
  "categories",
  "roles",
];
// The side panel and the in-page panel (a content script) read the state,
// switch alerts back on and look up the categories; nothing else.
export const PANEL_PUSH_ACTIONS: readonly PushAction[] = [
  "status",
  "enable",
  "categories",
];
export type PushSenderPage = "options" | "onboarding" | "panel";

export function pushSenderPage(
  sender: { id?: string; url?: string },
  extensionId: string,
): PushSenderPage | undefined {
  if (sender.id !== extensionId || !sender.url) return undefined;
  try {
    const url = new URL(sender.url);
    // A content script reports the host page; only the in-page panel sends.
    if (url.protocol === "http:" || url.protocol === "https:") return "panel";
    if (url.protocol !== "chrome-extension:" || url.hostname !== extensionId)
      return undefined;
    if (url.pathname === "/options.html") return "options";
    if (url.pathname === "/onboarding.html") return "onboarding";
    if (url.pathname === "/sidepanel.html") return "panel";
    return undefined;
  } catch {
    return undefined;
  }
}
export function isPushActionAllowed(
  page: PushSenderPage,
  action: PushAction,
): boolean {
  if (page === "options") return true;
  const allowed =
    page === "onboarding" ? ONBOARDING_PUSH_ACTIONS : PANEL_PUSH_ACTIONS;
  return allowed.includes(action);
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
  if (action === "roles") {
    // Every entry must be a role code; a malformed list is rejected whole
    // rather than silently saved in part.
    if (!Array.isArray(value.roles) || !value.roles.every(isRoleCode))
      return undefined;
    return { type: PUSH_MESSAGE, action, roles: [...new Set(value.roles)] };
  }
  return { type: PUSH_MESSAGE, action };
}
