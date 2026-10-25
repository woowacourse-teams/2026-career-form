import { isPostingPage } from "./messages";
import { PushApiError, type PushApi } from "./push-api";
import {
  parsePushMessage,
  PUSH_MESSAGE,
  type PushResponse,
  type PushStateView,
} from "./push-messages";
import type { PushSubscriptionService } from "./push-subscription";
import { isRecord } from "./repository";

export function createPushHandler(
  service: PushSubscriptionService,
  api: PushApi,
  extensionId: string,
) {
  const state = async (): Promise<PushStateView> => ({
    enabled: await service.isEnabled(),
    supported: service.supported(),
    status: (await service.status()) ?? null,
  });
  return (
    message: unknown,
    sender: { id?: string; url?: string },
  ): Promise<PushResponse> | undefined => {
    if (!isRecord(message) || message.type !== PUSH_MESSAGE) return undefined;
    const command = parsePushMessage(message);
    // Only the management page may read or change the subscription.
    if (!command || !isPostingPage(sender, extensionId))
      return Promise.resolve({ ok: false, code: "UNAVAILABLE" });
    const execute = async (): Promise<PushResponse> => {
      switch (command.action) {
        case "status":
          return { ok: true, state: await state() };
        case "enable":
        case "disable":
          await service.setEnabled(command.action === "enable");
          return { ok: true, state: await state() };
        case "inbox":
          return { ok: true, postings: await api.openPostings() };
      }
    };
    return execute().catch((error: unknown): PushResponse => ({
      ok: false,
      code: error instanceof PushApiError ? error.code : "UNAVAILABLE",
    }));
  };
}
