import { browser } from "wxt/browser";
import {
  parseVisibilityState,
  PUSH_VISIBILITY_KEY,
  type NotificationPermission,
  type VisibilityAnswer,
} from "./notification-check";
import {
  isPushApiErrorCode,
  isServerPosting,
  PushApiError,
  type ServerPosting,
} from "./push-api";
import {
  PUSH_MESSAGE,
  type PushAction,
  type PushStateView,
  type RecordSource,
} from "./push-messages";
import { PUSH_AUTO_SAVE_KEY } from "./push-settings";
import {
  parsePushStatus,
  PUSH_ENABLED_KEY,
  PUSH_STATUS_KEY,
} from "./push-subscription";
import { isRecord } from "./repository";
import { PUSH_UNREAD_KEY } from "./unread-postings";

export interface PushClient {
  state(): Promise<PushStateView>;
  setEnabled(enabled: boolean): Promise<PushStateView>;
  setAutoSave(enabled: boolean): Promise<PushStateView>;
  test(): Promise<PushStateView>;
  record(
    answer: VisibilityAnswer,
    source: RecordSource,
  ): Promise<PushStateView>;
  later(): Promise<PushStateView>;
  inbox(): Promise<ServerPosting[]>;
  subscribe(listener: () => void): () => void;
}
type ChangeListener = (changes: Record<string, unknown>, area: string) => void;
interface PushClientPorts {
  sendMessage(message: unknown): Promise<unknown>;
  onChanged: {
    addListener(listener: ChangeListener): void;
    removeListener(listener: ChangeListener): void;
  };
}
const permissions: readonly NotificationPermission[] = [
  "granted",
  "denied",
  "unknown",
];
const WATCHED_KEYS = [
  PUSH_STATUS_KEY,
  PUSH_ENABLED_KEY,
  PUSH_VISIBILITY_KEY,
  PUSH_AUTO_SAVE_KEY,
  PUSH_UNREAD_KEY,
];

function parseState(value: unknown): PushStateView | undefined {
  if (
    !isRecord(value) ||
    typeof value.enabled !== "boolean" ||
    typeof value.supported !== "boolean" ||
    !permissions.some((p) => p === value.permission) ||
    !isRecord(value.visibility) ||
    typeof value.autoSave !== "boolean" ||
    typeof value.unread !== "number" ||
    !Number.isFinite(value.unread)
  )
    return undefined;
  const status =
    value.status === null || value.status === undefined
      ? null
      : parsePushStatus(value.status);
  if (status === undefined) return undefined;
  return {
    enabled: value.enabled,
    supported: value.supported,
    status,
    permission: value.permission as NotificationPermission,
    visibility: parseVisibilityState(value.visibility),
    autoSave: value.autoSave,
    unread: Math.max(0, Math.floor(value.unread)),
  };
}

export function createPushClient(ports: PushClientPorts): PushClient {
  const send = async (
    action: PushAction,
    extra: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> => {
    let response: unknown;
    try {
      response = await ports.sendMessage({
        type: PUSH_MESSAGE,
        action,
        ...extra,
      });
    } catch {
      // The background is unreachable; the UI treats it like a connection issue.
      throw new PushApiError("NETWORK");
    }
    if (!isRecord(response)) throw new PushApiError("INVALID_RESPONSE");
    if (response.ok !== true)
      throw new PushApiError(
        isPushApiErrorCode(response.code) ? response.code : "NETWORK",
      );
    return response;
  };
  const stateOf = (response: Record<string, unknown>): PushStateView => {
    const state = parseState(response.state);
    if (!state) throw new PushApiError("INVALID_RESPONSE");
    return state;
  };
  return {
    state: async () => stateOf(await send("status")),
    setEnabled: async (enabled) =>
      stateOf(await send(enabled ? "enable" : "disable")),
    setAutoSave: async (enabled) =>
      stateOf(await send("autosave", { enabled })),
    test: async () => stateOf(await send("test")),
    record: async (answer, source) =>
      stateOf(await send("record", { answer, source })),
    later: async () => stateOf(await send("later")),
    inbox: async () => {
      const response = await send("inbox");
      if (!Array.isArray(response.postings))
        throw new PushApiError("INVALID_RESPONSE");
      return response.postings.filter(isServerPosting);
    },
    subscribe: (listener) => {
      const changed: ChangeListener = (changes, area) => {
        if (area === "local" && WATCHED_KEYS.some((key) => key in changes))
          listener();
      };
      ports.onChanged.addListener(changed);
      return () => ports.onChanged.removeListener(changed);
    },
  };
}

// Storage listeners are best-effort: without the extension runtime the UI
// simply stops refreshing instead of crashing.
export const pushClient: PushClient = createPushClient({
  sendMessage: (message) => browser.runtime.sendMessage(message),
  onChanged: {
    addListener: (listener) => {
      try {
        browser.storage.onChanged.addListener(listener);
      } catch {
        /* Extension storage is unavailable here. */
      }
    },
    removeListener: (listener) => {
      try {
        browser.storage.onChanged.removeListener(listener);
      } catch {
        /* Extension storage is unavailable here. */
      }
    },
  },
});
