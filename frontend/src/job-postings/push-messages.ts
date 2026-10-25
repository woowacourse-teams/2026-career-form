import type { PushApiErrorCode, ServerPosting } from "./push-api";
import type { PushStatus } from "./push-subscription";
import { isRecord } from "./repository";

export const PUSH_MESSAGE = "careerForm.push";
const pushActions = ["status", "enable", "disable", "inbox"] as const;
export type PushAction = (typeof pushActions)[number];
export interface PushCommand {
  type: typeof PUSH_MESSAGE;
  action: PushAction;
}
export interface PushStateView {
  enabled: boolean;
  supported: boolean;
  status: PushStatus | null;
}
export type PushResponse =
  | { ok: true; state: PushStateView }
  | { ok: true; postings: ServerPosting[] }
  | { ok: false; code: PushApiErrorCode | "UNAVAILABLE" };

export function parsePushMessage(value: unknown): PushCommand | undefined {
  if (!isRecord(value) || value.type !== PUSH_MESSAGE) return undefined;
  const action = pushActions.find((candidate) => candidate === value.action);
  return action ? { type: PUSH_MESSAGE, action } : undefined;
}
