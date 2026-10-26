import { isRecord } from "./repository";

export const PUSH_VISIBILITY_KEY = "careerForm.push.visibility";
export const TEST_NOTIFICATION_ID = "careerForm.push.test";

const visibilityResults = ["unknown", "seen", "not_seen"] as const;
const visibilitySources = ["test", "notification_click", "card"] as const;
export type VisibilityResult = (typeof visibilityResults)[number];
export type VisibilityAnswer = Exclude<VisibilityResult, "unknown">;
export type VisibilitySource = (typeof visibilitySources)[number];
export type NotificationPermission = "granted" | "denied" | "unknown";

// Local record of whether OS notifications are known to reach this user.
export interface VisibilityState {
  result: VisibilityResult;
  checkedAt?: number;
  source?: VisibilitySource;
  shownAt?: number;
  askLaterAt?: number;
}
interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
export interface NotificationCheckPorts {
  storage: StorageArea;
  now(): number;
  notify(
    id: string,
    notification: { title: string; message: string; buttons: string[] },
  ): Promise<void>;
  permission(): Promise<NotificationPermission>;
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function parseVisibilityState(value: unknown): VisibilityState {
  if (!isRecord(value) || !visibilityResults.some((r) => r === value.result))
    return { result: "unknown" };
  return {
    result: value.result as VisibilityResult,
    ...(finite(value.checkedAt) ? { checkedAt: value.checkedAt } : {}),
    ...(visibilitySources.some((s) => s === value.source)
      ? { source: value.source as VisibilitySource }
      : {}),
    ...(finite(value.shownAt) ? { shownAt: value.shownAt } : {}),
    ...(finite(value.askLaterAt) ? { askLaterAt: value.askLaterAt } : {}),
  };
}

export class NotificationCheck {
  constructor(private readonly ports: NotificationCheckPorts) {}
  async state(): Promise<VisibilityState> {
    const stored = await this.ports.storage.get(PUSH_VISIBILITY_KEY);
    return parseVisibilityState(stored[PUSH_VISIBILITY_KEY]);
  }
  permission(): Promise<NotificationPermission> {
    return this.ports.permission();
  }
  // Only ever triggered by the user's button; never on install or startup.
  async sendTest(): Promise<void> {
    await this.ports.notify(TEST_NOTIFICATION_ID, {
      title: "커리어폼 알림 테스트",
      message: "이 알림이 보이면 화면에서 ‘보였어요’를 눌러 주세요.",
      buttons: [],
    });
  }
  record(
    answer: VisibilityAnswer,
    source: Exclude<VisibilitySource, "notification_click">,
  ): Promise<VisibilityState> {
    return this.update((previous) => ({
      ...this.carry(previous),
      result: answer,
      checkedAt: this.ports.now(),
      source,
    }));
  }
  markShown(): Promise<VisibilityState> {
    return this.update((previous) =>
      previous.result === "unknown" && previous.shownAt === undefined
        ? { ...previous, shownAt: this.ports.now() }
        : previous,
    );
  }
  markSeenByClick(): Promise<VisibilityState> {
    return this.update((previous) => ({
      ...this.carry(previous),
      result: "seen",
      checkedAt: this.ports.now(),
      source: "notification_click",
    }));
  }
  askLater(): Promise<VisibilityState> {
    return this.update((previous) => ({
      ...previous,
      askLaterAt: this.ports.now(),
    }));
  }
  private carry(previous: VisibilityState): Partial<VisibilityState> {
    return {
      ...(previous.shownAt === undefined ? {} : { shownAt: previous.shownAt }),
      ...(previous.askLaterAt === undefined
        ? {}
        : { askLaterAt: previous.askLaterAt }),
    };
  }
  private async update(
    change: (previous: VisibilityState) => VisibilityState,
  ): Promise<VisibilityState> {
    const previous = await this.state();
    const next = change(previous);
    if (next !== previous)
      await this.ports.storage.set({ [PUSH_VISIBILITY_KEY]: next });
    return next;
  }
}
