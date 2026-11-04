import { pruneRoles, type JobCategoryStore } from "./job-roles";
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
  categories: Pick<JobCategoryStore, "load">;
  extensionId: string;
}

export function createPushHandler({
  service,
  api,
  check,
  unread,
  categories,
  extensionId,
}: PushHandlerOptions) {
  const state = async (): Promise<PushStateView> => ({
    enabled: await service.isEnabled(),
    supported: service.supported(),
    status: (await service.status()) ?? null,
    permission: await check.permission(),
    visibility: await check.state(),
    unread: await unread.count(),
    roles: await service.roles(),
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
        case "inbox": {
          const postings = await api.openPostings();
          // Viewing the inbox counts as reading every pending posting.
          await unread.clear();
          return { ok: true, postings };
        }
        case "categories": {
          const view = await categories.load();
          // Only a fresh server list may drop selected codes; a cached list
          // could predate the selection.
          if (view.categories && view.error === null) {
            const current = await service.roles();
            const kept = pruneRoles(current, view.categories);
            if (kept.length !== current.length) await service.setRoles(kept);
          }
          return { ok: true, categories: view };
        }
        case "roles":
          await service.setRoles(command.roles);
          break;
      }
      return { ok: true, state: await state() };
    };
    return execute().catch((error: unknown): PushResponse => ({
      ok: false,
      code: error instanceof PushApiError ? error.code : "UNAVAILABLE",
    }));
  };
}
