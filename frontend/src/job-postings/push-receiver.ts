import type { AnalyticsEvent, TrackEvent } from "../analytics/events";
import { isHttpUrl, remainingTime, type PostingInput } from "./model";
import {
  isServerPosting,
  parseServerPosting,
  type ServerPosting,
} from "./push-api";
import { isRecord } from "./repository";
import {
  formatPostingPeriod,
  postingInput,
  reminderOutcome,
} from "./server-posting";
import type { PostingSnapshot } from "./service";

export const PUSH_NOTIFIED_KEY = "careerForm.push.notified";
export const PUSH_NOTIFICATION_PREFIX = "careerForm.push.posting.";
export const PUSH_SAVED_NOTIFICATION_PREFIX = "careerForm.push.saved.";
export const PUSH_AUTOSAVED_NOTIFICATION_PREFIX = "careerForm.push.autosaved.";
export const PUSH_NOTIFICATION_BUTTONS = [
  "공고 열기",
  "마감 알림 저장",
] as const;

export interface NotifiedPosting extends ServerPosting {
  notifiedAt: number;
}
export interface PushNotification {
  title: string;
  message: string;
  buttons: string[];
}
interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
export interface PushReceiverPorts {
  storage: StorageArea;
  now(): number;
  notify(id: string, notification: PushNotification): Promise<void>;
  clearNotification(id: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  postings: {
    list(): Promise<PostingSnapshot>;
    save(input: PostingInput): Promise<PostingSnapshot>;
    remove(id: string, version: number): Promise<PostingSnapshot>;
  };
  track: TrackEvent;
  unread: {
    add(postingId: string, closesAt: number): Promise<unknown>;
    remove(postingId: string): Promise<unknown>;
  };
  visibility: {
    markShown(): Promise<unknown>;
    markSeenByClick(): Promise<unknown>;
  };
  autoSaveEnabled(): Promise<boolean>;
}
export type ReceiveOutcome = "notified" | "duplicate" | "expired" | "invalid";
export type SaveOutcome =
  "saved" | "no_future_reminders" | "already_saved" | "expired";

export function postingNotificationId(postingId: string): string {
  return PUSH_NOTIFICATION_PREFIX + postingId;
}

function isNotifiedPosting(value: unknown): value is NotifiedPosting {
  return (
    isServerPosting(value) &&
    "notifiedAt" in value &&
    typeof value.notifiedAt === "number" &&
    Number.isFinite(value.notifiedAt)
  );
}

function reminderLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}시간 전` : `${minutes}분 전`;
}

function postingNotification(
  posting: ServerPosting,
  now: number,
): PushNotification {
  return {
    title: posting.role
      ? `${posting.company} · ${posting.role}`
      : posting.company,
    message: `접수 ${formatPostingPeriod(posting.opensAt, posting.closesAt)} (한국 시간)\n${remainingTime(posting.closesAt, now)}`,
    buttons: [...PUSH_NOTIFICATION_BUTTONS],
  };
}

function savedNotification(
  posting: ServerPosting,
  outcome: SaveOutcome,
  pendingMinutes: number[],
  auto = false,
): PushNotification {
  const messages: Record<SaveOutcome, string> = {
    saved: `마감 ${pendingMinutes.map(reminderLabel).join(", ")}에 알려드려요.`,
    no_future_reminders:
      "예약할 미래 알림이 없습니다. 이미 지난 알림은 보내지 않습니다.",
    already_saved: "이미 저장한 공고예요. 지원 공고 화면에서 확인할 수 있어요.",
    expired: "마감이 지난 공고라 저장하지 않았어요.",
  };
  const saved = outcome === "saved" || outcome === "no_future_reminders";
  return {
    title: saved
      ? `${posting.company} ${auto ? "마감 알림에 저장했어요" : "공고를 저장했어요"}`
      : posting.company,
    message: auto
      ? `${messages[outcome]} 원치 않으면 저장 취소를 누르세요.`
      : messages[outcome],
    buttons: auto ? ["저장 취소"] : [],
  };
}

export class PushReceiver {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly ports: PushReceiverPorts) {}
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async load(): Promise<Record<string, NotifiedPosting>> {
    const stored = await this.ports.storage.get(PUSH_NOTIFIED_KEY);
    const value = stored[PUSH_NOTIFIED_KEY];
    if (!isRecord(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, NotifiedPosting] =>
          isNotifiedPosting(entry[1]) && entry[1].id === entry[0],
      ),
    );
  }
  private track(
    event: AnalyticsEvent,
    postingId: string,
    trigger?: "button" | "open",
  ): void {
    this.ports.track(event, {
      surface: "notification",
      posting_id: postingId,
      ...(trigger ? { trigger } : {}),
    });
  }
  private async quietly(task: () => Promise<unknown>): Promise<void> {
    try {
      await task();
    } catch {
      /* Badge and visibility bookkeeping never block the notification flow. */
    }
  }
  // Called from the service worker `push` event; silent pushes may be dropped.
  receive(payload: unknown): Promise<ReceiveOutcome> {
    return this.serial(async () => {
      const posting = parseServerPosting(payload);
      if (!posting) return "invalid";
      const now = this.ports.now();
      const notified = Object.fromEntries(
        Object.entries(await this.load()).filter(([, p]) => p.closesAt > now),
      );
      let outcome: ReceiveOutcome = "notified";
      if (posting.closesAt <= now) outcome = "expired";
      else if (notified[posting.id]) outcome = "duplicate";
      else {
        await this.ports.notify(
          postingNotificationId(posting.id),
          postingNotification(posting, now),
        );
        notified[posting.id] = { ...posting, notifiedAt: now };
      }
      await this.ports.storage.set({ [PUSH_NOTIFIED_KEY]: notified });
      if (outcome === "notified") {
        await this.quietly(() =>
          this.ports.unread.add(posting.id, posting.closesAt),
        );
        await this.quietly(() => this.ports.visibility.markShown());
        this.track("posting_notification_shown", posting.id);
      }
      return outcome;
    });
  }
  private async find(
    notificationId: string,
  ): Promise<NotifiedPosting | undefined> {
    if (!notificationId.startsWith(PUSH_NOTIFICATION_PREFIX)) return undefined;
    const id = notificationId.slice(PUSH_NOTIFICATION_PREFIX.length);
    return (await this.load())[id];
  }
  // Only runs on an explicit click; the link was validated when it arrived.
  open(notificationId: string): Promise<boolean> {
    return this.serial(async () => {
      const posting = await this.find(notificationId);
      if (!posting || !isHttpUrl(posting.link)) return false;
      await this.ports.openUrl(posting.link);
      await this.ports.clearNotification(notificationId);
      this.track("posting_notification_opened", posting.id);
      // A click proves notifications are visible and reads this posting.
      await this.quietly(() => this.ports.visibility.markSeenByClick());
      await this.quietly(() => this.ports.unread.remove(posting.id));
      if (await this.ports.autoSaveEnabled()) await this.autoSave(posting);
      return true;
    });
  }
  // Opening a posting saves its deadline reminder; the follow-up offers undo.
  private async autoSave(posting: NotifiedPosting): Promise<void> {
    const { outcome, pendingMinutes } = await this.saveLocally(posting);
    if (outcome !== "saved" && outcome !== "no_future_reminders") return;
    await this.ports.notify(
      PUSH_AUTOSAVED_NOTIFICATION_PREFIX + posting.id,
      savedNotification(posting, outcome, pendingMinutes, true),
    );
    this.track("posting_notification_saved", posting.id, "open");
  }
  undoAutoSave(notificationId: string): Promise<boolean> {
    return this.serial(async () => {
      if (!notificationId.startsWith(PUSH_AUTOSAVED_NOTIFICATION_PREFIX))
        return false;
      const id = notificationId.slice(
        PUSH_AUTOSAVED_NOTIFICATION_PREFIX.length,
      );
      const posting = (await this.load())[id];
      if (!posting) return false;
      const { postings } = await this.ports.postings.list();
      const saved = postings.find(
        (p) => p.url === posting.link && p.status === "planned",
      );
      if (!saved) return false;
      await this.ports.postings.remove(saved.id, saved.version);
      await this.ports.clearNotification(notificationId);
      this.track("posting_auto_save_cancelled", posting.id);
      return true;
    });
  }
  save(notificationId: string): Promise<SaveOutcome | undefined> {
    return this.serial(async () => {
      const posting = await this.find(notificationId);
      if (!posting) return undefined;
      const { outcome, pendingMinutes } = await this.saveLocally(posting);
      await this.ports.clearNotification(notificationId);
      await this.ports.notify(
        PUSH_SAVED_NOTIFICATION_PREFIX + posting.id,
        savedNotification(posting, outcome, pendingMinutes),
      );
      if (outcome === "saved" || outcome === "no_future_reminders")
        this.track("posting_notification_saved", posting.id, "button");
      return outcome;
    });
  }
  private async saveLocally(
    posting: ServerPosting,
  ): Promise<{ outcome: SaveOutcome; pendingMinutes: number[] }> {
    if (posting.closesAt <= this.ports.now())
      return { outcome: "expired", pendingMinutes: [] };
    const { postings } = await this.ports.postings.list();
    if (postings.some((p) => p.url === posting.link))
      return { outcome: "already_saved", pendingMinutes: [] };
    const snapshot = await this.ports.postings.save(postingInput(posting));
    const saved = snapshot.postings.find((p) => p.url === posting.link);
    if (!saved) return { outcome: "saved", pendingMinutes: [] };
    return {
      outcome: reminderOutcome(saved),
      pendingMinutes: saved.reminders
        .filter((r) => r.state === "pending")
        .map((r) => r.minutes),
    };
  }
}
