import { browser } from "wxt/browser";
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
} from "./push-messages";
import {
  parsePushStatus,
  PUSH_ENABLED_KEY,
  PUSH_STATUS_KEY,
} from "./push-subscription";
import { isRecord } from "./repository";

export interface PushClient {
  state(): Promise<PushStateView>;
  setEnabled(enabled: boolean): Promise<PushStateView>;
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

function parseState(value: unknown): PushStateView | undefined {
  if (
    !isRecord(value) ||
    typeof value.enabled !== "boolean" ||
    typeof value.supported !== "boolean"
  )
    return undefined;
  const base = { enabled: value.enabled, supported: value.supported };
  if (value.status === null || value.status === undefined)
    return { ...base, status: null };
  const status = parsePushStatus(value.status);
  return status ? { ...base, status } : undefined;
}

export function createPushClient(ports: PushClientPorts): PushClient {
  const send = async (action: PushAction): Promise<Record<string, unknown>> => {
    let response: unknown;
    try {
      response = await ports.sendMessage({ type: PUSH_MESSAGE, action });
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
    inbox: async () => {
      const response = await send("inbox");
      if (!Array.isArray(response.postings))
        throw new PushApiError("INVALID_RESPONSE");
      return response.postings.filter(isServerPosting);
    },
    subscribe: (listener) => {
      const changed: ChangeListener = (changes, area) => {
        if (
          area === "local" &&
          (PUSH_STATUS_KEY in changes || PUSH_ENABLED_KEY in changes)
        )
          listener();
      };
      ports.onChanged.addListener(changed);
      return () => ports.onChanged.removeListener(changed);
    },
  };
}

export const pushClient: PushClient = createPushClient({
  sendMessage: (message) => browser.runtime.sendMessage(message),
  onChanged: {
    addListener: (listener) => browser.storage.onChanged.addListener(listener),
    removeListener: (listener) =>
      browser.storage.onChanged.removeListener(listener),
  },
});
