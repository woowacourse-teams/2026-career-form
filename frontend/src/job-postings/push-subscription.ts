import {
  base64UrlToBytes,
  isPushApiErrorCode,
  PushApiError,
  type PushApi,
  type PushApiErrorCode,
  type SubscriptionJson,
} from "./push-api";
import { isRecord } from "./repository";

export const PUSH_ENABLED_KEY = "careerForm.push.enabled";
export const PUSH_STATUS_KEY = "careerForm.push.status";
// Silent (userVisibleOnly: false) extension push needs Chrome 121 or later.
export const MINIMUM_CHROME_VERSION = 121;
export const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000] as const;

const statusCodes = [
  "registered",
  "disabled",
  "unsupported",
  "not_configured",
  "endpoint_unavailable",
  "failed",
] as const;
export type PushStatusCode = (typeof statusCodes)[number];
export interface PushStatus {
  code: PushStatusCode;
  updatedAt: number;
  attempts: number;
  error?: PushApiErrorCode;
}

export interface PushSubscriptionLike {
  readonly endpoint: string;
  readonly options: { readonly applicationServerKey: ArrayBuffer | null };
  toJSON(): unknown;
  unsubscribe(): Promise<boolean>;
}
export interface PushManagerLike {
  getSubscription(): Promise<PushSubscriptionLike | null>;
  subscribe(options: {
    userVisibleOnly: boolean;
    applicationServerKey: Uint8Array;
  }): Promise<PushSubscriptionLike>;
}
interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
export interface PushSubscriptionPorts {
  api: PushApi;
  storage: StorageArea;
  pushManager(): PushManagerLike | undefined;
  chromeVersion(): number | undefined;
  now(): number;
  scheduleRetry(delayMs: number | undefined): Promise<void>;
}

export function parsePushStatus(value: unknown): PushStatus | undefined {
  if (
    !isRecord(value) ||
    !statusCodes.some((code) => code === value.code) ||
    !Number.isFinite(value.updatedAt) ||
    !Number.isSafeInteger(value.attempts) ||
    (value.error !== undefined && !isPushApiErrorCode(value.error))
  )
    return undefined;
  return {
    code: value.code as PushStatusCode,
    updatedAt: value.updatedAt as number,
    attempts: value.attempts as number,
    ...(value.error === undefined ? {} : { error: value.error }),
  };
}

function subscriptionJson(
  subscription: PushSubscriptionLike,
): SubscriptionJson {
  const json = subscription.toJSON();
  if (
    !isRecord(json) ||
    typeof json.endpoint !== "string" ||
    !isRecord(json.keys) ||
    typeof json.keys.p256dh !== "string" ||
    typeof json.keys.auth !== "string"
  )
    throw new Error("브라우저 구독 정보를 읽을 수 없습니다.");
  return {
    endpoint: json.endpoint,
    expirationTime:
      typeof json.expirationTime === "number" ? json.expirationTime : null,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}
function sameKey(existing: ArrayBuffer | null, key: Uint8Array): boolean {
  if (!existing) return false;
  const bytes = new Uint8Array(existing);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

export class PushSubscriptionService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly ports: PushSubscriptionPorts) {}
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }
  async isEnabled(): Promise<boolean> {
    const stored = await this.ports.storage.get(PUSH_ENABLED_KEY);
    return stored[PUSH_ENABLED_KEY] !== false;
  }
  async status(): Promise<PushStatus | undefined> {
    const stored = await this.ports.storage.get(PUSH_STATUS_KEY);
    return parsePushStatus(stored[PUSH_STATUS_KEY]);
  }
  supported(): boolean {
    const version = this.ports.chromeVersion();
    return (
      version !== undefined &&
      version >= MINIMUM_CHROME_VERSION &&
      this.ports.pushManager() !== undefined
    );
  }
  // Install, startup, retry alarm and pushsubscriptionchange all converge here.
  sync(): Promise<PushStatus> {
    return this.serial(async () =>
      (await this.isEnabled())
        ? this.register()
        : this.record({ code: "disabled", attempts: 0 }, undefined),
    );
  }
  setEnabled(enabled: boolean): Promise<PushStatus> {
    return this.serial(async () => {
      await this.ports.storage.set({ [PUSH_ENABLED_KEY]: enabled });
      return enabled ? this.register() : this.disable();
    });
  }
  private async register(): Promise<PushStatus> {
    if (!this.supported())
      return this.record({ code: "unsupported", attempts: 0 }, undefined);
    const manager = this.ports.pushManager()!;
    const previous = await this.status();
    try {
      const key = base64UrlToBytes(await this.ports.api.publicKey());
      let subscription = await manager.getSubscription();
      if (
        subscription &&
        !sameKey(subscription.options.applicationServerKey, key)
      ) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await manager.subscribe({
        userVisibleOnly: false,
        applicationServerKey: key,
      });
      // The server deduplicates by endpoint, so re-sending is safe.
      await this.ports.api.register(subscriptionJson(subscription));
      return this.record({ code: "registered", attempts: 0 }, undefined);
    } catch (error) {
      const code = error instanceof PushApiError ? error.code : undefined;
      if (code === "NOT_CONFIGURED")
        return this.record({ code: "not_configured", attempts: 0 }, undefined);
      if (code === "ENDPOINT_UNAVAILABLE")
        return this.record(
          { code: "endpoint_unavailable", attempts: 0 },
          undefined,
        );
      const attempts =
        (previous?.code === "failed" ? previous.attempts : 0) + 1;
      const transient =
        code === "NETWORK" || code === "TIMEOUT" || code === "SERVER_ERROR";
      return this.record(
        { code: "failed", attempts, ...(code ? { error: code } : {}) },
        transient
          ? RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length) - 1]
          : undefined,
      );
    }
  }
  private async disable(): Promise<PushStatus> {
    let subscription: PushSubscriptionLike | null = null;
    try {
      subscription =
        (await this.ports.pushManager()?.getSubscription()) ?? null;
    } catch {
      /* No browser subscription to release. */
    }
    let error: PushApiErrorCode | undefined;
    if (subscription) {
      try {
        await this.ports.api.unregister(subscription.endpoint);
      } catch (failure) {
        error = failure instanceof PushApiError ? failure.code : "NETWORK";
      }
      try {
        await subscription.unsubscribe();
      } catch {
        /* The browser subscription may already be gone. */
      }
    }
    return this.record(
      { code: "disabled", attempts: 0, ...(error ? { error } : {}) },
      undefined,
    );
  }
  private async record(
    status: Omit<PushStatus, "updatedAt">,
    retryDelayMs: number | undefined,
  ): Promise<PushStatus> {
    const next: PushStatus = { ...status, updatedAt: this.ports.now() };
    await this.ports.storage.set({ [PUSH_STATUS_KEY]: next });
    try {
      await this.ports.scheduleRetry(retryDelayMs);
    } catch {
      /* A failed alarm must not hide the recorded status. */
    }
    return next;
  }
}
