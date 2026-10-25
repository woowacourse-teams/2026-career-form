import { isHttpUrl } from "./model";
import { isRecord } from "./repository";

// Single home for the notification API contract. If the backend (CF-348)
// changes a path or a field name, only this file changes.
export const PUSH_API_PATHS = {
  publicKey: "/api/v1/notifications/vapid-public-key",
  subscriptions: "/api/v1/notifications/subscriptions",
  unsubscribe: "/api/v1/notifications/subscriptions/unsubscribe",
  openPostings: "/api/v1/notifications/postings",
} as const;

const errorCodes = [
  "NOT_CONFIGURED",
  "ENDPOINT_UNAVAILABLE",
  "NETWORK",
  "TIMEOUT",
  "BAD_REQUEST",
  "SERVER_ERROR",
  "INVALID_RESPONSE",
] as const;
export type PushApiErrorCode = (typeof errorCodes)[number];
export function isPushApiErrorCode(value: unknown): value is PushApiErrorCode {
  return errorCodes.some((code) => code === value);
}

export class PushApiError extends Error {
  constructor(readonly code: PushApiErrorCode) {
    super(`공고 알림 API 오류: ${code}`);
    this.name = "PushApiError";
  }
}

export interface ServerPosting {
  id: string;
  company: string;
  role: string;
  link: string;
  opensAt: number;
  closesAt: number;
}

export interface SubscriptionJson {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export interface PushApi {
  publicKey(): Promise<string>;
  register(subscription: SubscriptionJson): Promise<{ created: boolean }>;
  unregister(endpoint: string): Promise<void>;
  openPostings(): Promise<ServerPosting[]>;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXT_LENGTH = 200;
const MAX_LINK_LENGTH = 2048;

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TEXT_LENGTH || /\p{Cc}/u.test(trimmed))
    return undefined;
  return trimmed;
}
function instant(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : undefined;
}
export function parseServerPosting(value: unknown): ServerPosting | undefined {
  if (!isRecord(value)) return undefined;
  const id =
    typeof value.id === "string" && ID_PATTERN.test(value.id)
      ? value.id
      : undefined;
  const company = text(value.company);
  const role = text(value.role);
  const link =
    typeof value.link === "string" &&
    value.link.length <= MAX_LINK_LENGTH &&
    isHttpUrl(value.link.trim())
      ? value.link.trim()
      : undefined;
  const opensAt = instant(value.opensAt);
  const closesAt = instant(value.closesAt);
  if (
    !id ||
    !company ||
    !role ||
    !link ||
    opensAt === undefined ||
    closesAt === undefined ||
    opensAt >= closesAt
  )
    return undefined;
  return { id, company, role, link, opensAt, closesAt };
}

// Already-normalized shape (numeric instants) as stored or relayed in the extension.
export function isServerPosting(value: unknown): value is ServerPosting {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    ID_PATTERN.test(value.id) &&
    text(value.company) === value.company &&
    text(value.role) === value.role &&
    typeof value.link === "string" &&
    value.link.length <= MAX_LINK_LENGTH &&
    isHttpUrl(value.link) &&
    typeof value.opensAt === "number" &&
    typeof value.closesAt === "number" &&
    Number.isFinite(value.opensAt) &&
    Number.isFinite(value.closesAt) &&
    value.opensAt < value.closesAt
  );
}

export function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value))
    throw new Error("base64url 형식이 아닙니다.");
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}
function isP256PublicKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const bytes = base64UrlToBytes(value);
    return bytes.length === 65 && bytes[0] === 4;
  } catch {
    return false;
  }
}

interface PushApiOptions {
  baseUrl: string | undefined;
  fetcher?: typeof fetch;
  extensionVersion?: string;
  timeoutMs?: number;
}
const UNREADABLE = Symbol("unreadable");

export function createPushApi({
  baseUrl,
  fetcher = fetch,
  extensionVersion,
  timeoutMs = 10_000,
}: PushApiOptions): PushApi {
  const origin = baseUrl?.trim().replace(/\/+$/, "") ?? "";
  const request = async (
    path: string,
    init: { method?: "GET" | "POST"; body?: unknown } = {},
  ): Promise<{ status: number; body: unknown }> => {
    if (!origin) throw new PushApiError("NOT_CONFIGURED");
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetcher(`${origin}${path}`, {
        method: init.method ?? "GET",
        headers: {
          "X-Career-Form-Version": extensionVersion ?? "UNKNOWN",
          ...(init.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        credentials: "omit",
        signal: controller.signal,
      });
    } catch (error) {
      throw new PushApiError(
        error instanceof DOMException && error.name === "AbortError"
          ? "TIMEOUT"
          : "NETWORK",
      );
    } finally {
      globalThis.clearTimeout(timer);
    }
    if (!response.ok)
      throw new PushApiError(
        response.status === 404
          ? "ENDPOINT_UNAVAILABLE"
          : response.status >= 500
            ? "SERVER_ERROR"
            : "BAD_REQUEST",
      );
    try {
      const raw = await response.text();
      return {
        status: response.status,
        body: raw ? JSON.parse(raw) : undefined,
      };
    } catch {
      return { status: response.status, body: UNREADABLE };
    }
  };
  return {
    async publicKey() {
      const { body } = await request(PUSH_API_PATHS.publicKey);
      if (!isRecord(body) || !isP256PublicKey(body.publicKey))
        throw new PushApiError("INVALID_RESPONSE");
      return body.publicKey;
    },
    async register(subscription) {
      // Send only the contract fields; never forward unknown browser fields.
      const { status, body } = await request(PUSH_API_PATHS.subscriptions, {
        method: "POST",
        body: {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime ?? null,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        },
      });
      return {
        created: status === 201 || (isRecord(body) && body.created === true),
      };
    },
    async unregister(endpoint) {
      await request(PUSH_API_PATHS.unsubscribe, {
        method: "POST",
        body: { endpoint },
      });
    },
    async openPostings() {
      const { body } = await request(PUSH_API_PATHS.openPostings);
      if (!isRecord(body) || !Array.isArray(body.postings))
        throw new PushApiError("INVALID_RESPONSE");
      return body.postings
        .map(parseServerPosting)
        .filter((posting): posting is ServerPosting => posting !== undefined)
        .sort((a, b) => a.closesAt - b.closesAt || a.id.localeCompare(b.id));
    },
  };
}
