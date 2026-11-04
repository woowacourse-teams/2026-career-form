import { isHttpUrl } from "./model";
import { isRecord } from "./repository";

// Single home for the notification API contract. If the backend (CF-348)
// changes a path or a field name, only this file changes.
export const PUSH_API_PATHS = {
  publicKey: "/api/v1/notifications/vapid-public-key",
  subscriptions: "/api/v1/notifications/subscriptions",
  unsubscribe: "/api/v1/notifications/subscriptions/unsubscribe",
  openPostings: "/api/v1/notifications/postings",
  jobCategories: "/api/v1/notifications/job-categories",
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
  // Role codes from the job category list (e.g. IT.BACKEND). Postings
  // registered before the category list have no roles and reach everyone.
  roles?: string[];
  link: string;
  opensAt: number;
  closesAt: number;
  // FCM request time from the backend; only used for display-delay metrics.
  sentAt?: number;
}

export interface JobRole {
  code: string;
  label: string;
}
export interface JobCategory {
  code: string;
  label: string;
  roles: JobRole[];
}
export interface JobCategories {
  version: number;
  categories: JobCategory[];
}

export interface SubscriptionJson {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export interface PushApi {
  publicKey(): Promise<string>;
  // roles is the user's role selection; an empty array means none chosen.
  register(
    subscription: SubscriptionJson,
    roles: readonly string[],
  ): Promise<{ created: boolean }>;
  unregister(endpoint: string): Promise<void>;
  openPostings(): Promise<ServerPosting[]>;
  jobCategories(): Promise<JobCategories>;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXT_LENGTH = 200;
const MAX_LINK_LENGTH = 2048;
// Category codes are stable upper-case identifiers; a role code is
// `<category>.<role>` (backend contract, CF-394).
const CATEGORY_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,31}$/;
const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,31}\.[A-Z][A-Z0-9_]{0,31}$/;
const MAX_LABEL_LENGTH = 40;

export function isRoleCode(value: unknown): value is string {
  return typeof value === "string" && ROLE_CODE_PATTERN.test(value);
}
// Valid, de-duplicated role codes in their original order; undefined unless
// the value is an array. Malformed entries are dropped, not fatal.
export function roleCodes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(value.filter(isRoleCode)));
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TEXT_LENGTH || /\p{Cc}/u.test(trimmed))
    return undefined;
  return trimmed;
}
function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return undefined;
  return value.trim() === "" ? "" : text(value);
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
  // The backend omits role for postings without one; blank means no role.
  const role = optionalText(value.role);
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
    role === undefined ||
    !link ||
    opensAt === undefined ||
    closesAt === undefined ||
    opensAt >= closesAt
  )
    return undefined;
  const sentAt = instant(value.sentAt);
  const roles = roleCodes(value.roles);
  return {
    id,
    company,
    role,
    ...(roles === undefined ? {} : { roles }),
    link,
    opensAt,
    closesAt,
    ...(sentAt === undefined ? {} : { sentAt }),
  };
}

// Already-normalized shape (numeric instants) as stored or relayed in the extension.
export function isServerPosting(value: unknown): value is ServerPosting {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    ID_PATTERN.test(value.id) &&
    text(value.company) === value.company &&
    typeof value.role === "string" &&
    (value.role === "" || text(value.role) === value.role) &&
    (value.roles === undefined ||
      (Array.isArray(value.roles) && value.roles.every(isRoleCode))) &&
    typeof value.link === "string" &&
    value.link.length <= MAX_LINK_LENGTH &&
    isHttpUrl(value.link) &&
    typeof value.opensAt === "number" &&
    typeof value.closesAt === "number" &&
    Number.isFinite(value.opensAt) &&
    Number.isFinite(value.closesAt) &&
    value.opensAt < value.closesAt &&
    (value.sentAt === undefined ||
      (typeof value.sentAt === "number" && Number.isFinite(value.sentAt)))
  );
}

function label(value: unknown): string | undefined {
  const trimmed = text(value);
  return trimmed !== undefined && trimmed.length <= MAX_LABEL_LENGTH
    ? trimmed
    : undefined;
}
// Strict: the backend validates the list at startup, so any deviation is a
// contract drift the extension must not guess around.
export function parseJobCategories(value: unknown): JobCategories | undefined {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 1 ||
    !Array.isArray(value.categories) ||
    value.categories.length === 0
  )
    return undefined;
  const codes = new Set<string>();
  const categories: JobCategory[] = [];
  for (const entry of value.categories) {
    if (
      !isRecord(entry) ||
      typeof entry.code !== "string" ||
      !CATEGORY_CODE_PATTERN.test(entry.code) ||
      codes.has(entry.code) ||
      !Array.isArray(entry.roles) ||
      entry.roles.length === 0
    )
      return undefined;
    const categoryLabel = label(entry.label);
    if (categoryLabel === undefined) return undefined;
    codes.add(entry.code);
    const roles: JobRole[] = [];
    for (const role of entry.roles) {
      if (
        !isRecord(role) ||
        !isRoleCode(role.code) ||
        !role.code.startsWith(`${entry.code}.`) ||
        codes.has(role.code)
      )
        return undefined;
      const roleLabel = label(role.label);
      if (roleLabel === undefined) return undefined;
      codes.add(role.code);
      roles.push({ code: role.code, label: roleLabel });
    }
    categories.push({ code: entry.code, label: categoryLabel, roles });
  }
  return { version: value.version as number, categories };
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
    async register(subscription, roles) {
      // Send only the contract fields; never forward unknown browser fields.
      // roles always travels so the server copy mirrors the local selection
      // (an empty array clears it); older backends ignore the field.
      const { status, body } = await request(PUSH_API_PATHS.subscriptions, {
        method: "POST",
        body: {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime ?? null,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
          roles: [...roles],
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
    async jobCategories() {
      const { body } = await request(PUSH_API_PATHS.jobCategories);
      const categories = parseJobCategories(body);
      if (!categories) throw new PushApiError("INVALID_RESPONSE");
      return categories;
    },
  };
}
