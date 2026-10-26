import type { NotificationCheck } from "./notification-check";
import { PushApiError, type PushApi } from "./push-api";
import {
  isPushActionAllowed,
  parsePushMessage,
  PUSH_MESSAGE,
  pushSenderPage,
  type PushResponse,
  type PushStateView,
} from "./push-messages";
import type { AutoSaveSetting } from "./push-settings";
import type { PushSubscriptionService } from "./push-subscription";
import { isRecord } from "./repository";
import type { UnreadPostings } from "./unread-postings";

interface PushHandlerOptions {
  service: PushSubscriptionService;
  api: PushApi;
  check: Pick<
    NotificationCheck,
    "state" | "permission" | "sendTest" | "record" | "askLater"
  >;
  unread: Pick<UnreadPostings, "count" | "clear">;
  autoSave: AutoSaveSetting;
  extensionId: string;
}

export function createPushHandler({
  service,
  api,
  check,
  unread,
  autoSave,
  extensionId,
}: PushHandlerOptions) {
  const state = async (): Promise<PushStateView> => ({
    enabled: await service.isEnabled(),
    supported: service.supported(),
    status: (await service.status()) ?? null,
    permission: await check.permission(),
    visibility: await check.state(),
    autoSave: await autoSave.read(),
    unread: await unread.count(),
  });
  return (
    message: unknown,
    sender: { id?: string; url?: string },
  ): Promise<PushResponse> | undefined => {
    if (!isRecord(message) || message.type !== PUSH_MESSAGE) return undefined;
    const command = parsePushMessage(message);
    const page = pushSenderPage(sender, extensionId);
    if (!command || !page || !isPushActionAllowed(page, command.action))
      return Promise.resolve({ ok: false, code: "UNAVAILABLE" });
    const execute = async (): Promise<PushResponse> => {
      switch (command.action) {
        case "status":
          break;
        case "enable":
        case "disable":
          await service.setEnabled(command.action === "enable");
          break;
        case "test":
          await check.sendTest();
          break;
        case "record":
          await check.record(command.answer, command.source);
          break;
        case "later":
          await check.askLater();
          break;
        case "autosave":
          await autoSave.write(command.enabled);
          break;
        case "inbox": {
          const postings = await api.openPostings();
          // Viewing the inbox counts as reading every pending posting.
          await unread.clear();
          return { ok: true, postings };
        }
      }
      return { ok: true, state: await state() };
    };
    return execute().catch((error: unknown): PushResponse => ({
      ok: false,
      code: error instanceof PushApiError ? error.code : "UNAVAILABLE",
    }));
  };
}
