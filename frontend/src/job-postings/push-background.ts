import { browser } from "wxt/browser";
import type { TrackEvent } from "../analytics/events";
import { createPushApi } from "./push-api";
import { createPushHandler } from "./push-background-handler";
import {
  PUSH_NOTIFICATION_PREFIX,
  PUSH_SAVED_NOTIFICATION_PREFIX,
  PushReceiver,
} from "./push-receiver";
import {
  PushSubscriptionService,
  type PushManagerLike,
} from "./push-subscription";
import type { PostingService } from "./service";

export const PUSH_RETRY_ALARM = "careerForm.push.retry";

interface PushEventLike {
  data?: { json(): unknown } | null;
  waitUntil(promise: Promise<unknown>): void;
}
interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}
export interface ServiceWorkerScopeLike {
  registration?: { pushManager?: PushManagerLike };
  addEventListener(
    type: "push",
    listener: (event: PushEventLike) => void,
  ): void;
  addEventListener(
    type: "pushsubscriptionchange",
    listener: (event: ExtendableEventLike) => void,
  ): void;
}

export function chromeVersion(userAgent: string): number | undefined {
  const match = /Chrome\/(\d+)/.exec(userAgent);
  return match ? Number(match[1]) : undefined;
}

interface PushBackgroundOptions {
  baseUrl: string | undefined;
  extensionVersion: string;
  postings: Pick<PostingService, "list" | "save">;
  track: TrackEvent;
  scope?: ServiceWorkerScopeLike;
  userAgent?: string;
}

export function installPushBackground({
  baseUrl,
  extensionVersion,
  postings,
  track,
  scope = globalThis as unknown as ServiceWorkerScopeLike,
  userAgent = navigator.userAgent,
}: PushBackgroundOptions) {
  const api = createPushApi({ baseUrl, extensionVersion });
  const service = new PushSubscriptionService({
    api,
    storage: browser.storage.local,
    pushManager: () => scope.registration?.pushManager,
    chromeVersion: () => chromeVersion(userAgent),
    now: Date.now,
    scheduleRetry: async (delayMs) => {
      if (delayMs === undefined) {
        await browser.alarms.clear(PUSH_RETRY_ALARM);
        return;
      }
      await browser.alarms.create(PUSH_RETRY_ALARM, {
        when: Date.now() + delayMs,
      });
    },
  });
  const receiver = new PushReceiver({
    storage: browser.storage.local,
    now: Date.now,
    notify: async (id, notification) => {
      await browser.notifications.create(id, {
        type: "basic",
        iconUrl: `chrome-extension://${browser.runtime.id}/side-panel-launcher-logo.png`,
        title: notification.title,
        message: notification.message,
        ...(notification.buttons.length
          ? { buttons: notification.buttons.map((title) => ({ title })) }
          : {}),
      });
    },
    clearNotification: async (id) => {
      await browser.notifications.clear(id);
    },
    openUrl: async (url) => {
      await browser.tabs.create({ url });
    },
    postings,
    track,
  });
  const sync = () => {
    void service.sync().catch(() => undefined);
  };
  // Listeners must be registered synchronously at service worker start.
  scope.addEventListener("push", (event) => {
    let payload: unknown;
    try {
      payload = event.data?.json();
    } catch {
      return;
    }
    if (payload === undefined) return;
    event.waitUntil(receiver.receive(payload).catch(() => undefined));
  });
  scope.addEventListener("pushsubscriptionchange", (event) => {
    event.waitUntil(service.sync().catch(() => undefined));
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PUSH_RETRY_ALARM) sync();
  });
  browser.runtime.onStartup.addListener(sync);
  browser.runtime.onInstalled.addListener(sync);
  const clear = (id: string) => {
    void browser.notifications.clear(id).catch(() => undefined);
  };
  // Tabs open only from an explicit click on the body or the first button.
  const open = (id: string) => {
    if (id.startsWith(PUSH_SAVED_NOTIFICATION_PREFIX)) return clear(id);
    if (!id.startsWith(PUSH_NOTIFICATION_PREFIX)) return;
    void receiver
      .open(id)
      .then((opened) => {
        if (!opened) clear(id);
      })
      .catch(() => undefined);
  };
  browser.notifications.onClicked.addListener(open);
  browser.notifications.onButtonClicked.addListener((id, index) => {
    if (!id.startsWith(PUSH_NOTIFICATION_PREFIX)) return;
    if (index === 0) return open(id);
    if (index !== 1) return;
    void receiver
      .save(id)
      .then((outcome) => {
        if (outcome === undefined) clear(id);
      })
      .catch(() => undefined);
  });
  return {
    handleMessage: createPushHandler(service, api, browser.runtime.id),
    service,
    receiver,
  };
}
