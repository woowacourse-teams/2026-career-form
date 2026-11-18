import { RESUME_MAX_CHARS } from "./resume-file";
import {
  isResumeDraft,
  RESUME_IMPORT_MESSAGE,
  type ResumeDraftErrorCode,
  type ResumeDraftResult,
} from "./resume-import-client";

const ENDPOINT = "/api/v1/profile-import/resume";

const failure = (
  code: ResumeDraftErrorCode,
  retryAfterSeconds?: number,
): ResumeDraftResult => ({
  ok: false,
  code,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
});

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get("Retry-After")?.trim() ?? "";
  return /^\d{1,6}$/.test(value) ? Number(value) : undefined;
}

async function errorCode(response: Response): Promise<ResumeDraftResult> {
  switch (response.status) {
    case 400: {
      const body: unknown = await response.json().catch(() => undefined);
      const code =
        typeof body === "object" && body !== null && "error" in body
          ? body.error
          : undefined;
      return failure(code === "RESUME_TEXT_EMPTY" ? "EMPTY" : "INVALID_INPUT");
    }
    case 413:
      return failure("TOO_LONG");
    case 429:
      return failure("RATE_LIMITED", retryAfter(response));
    case 503:
      return failure("NOT_CONFIGURED");
    default:
      return failure("UNAVAILABLE");
  }
}

/**
 * Relays the resume text to the #469 API. Extension pages and the in-page panel
 * (this extension's content script) both send it; other extensions cannot.
 * Nothing about the request or response is logged or stored here.
 */
export function createResumeImportHandler({
  baseUrl,
  extensionId,
  fetcher = (input, init) => fetch(input, init),
  // The server waits up to 60 s for the model; leave room for the network.
  timeoutMs = 90_000,
}: {
  baseUrl: string | undefined;
  extensionId: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}) {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/$/, "") ?? "";

  async function run(text: string): Promise<ResumeDraftResult> {
    if (!normalizedBaseUrl) return failure("NOT_CONFIGURED");
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${normalizedBaseUrl}${ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return await errorCode(response);
      const body: unknown = await response.json().catch(() => undefined);
      return typeof body === "object" &&
        body !== null &&
        "schemaVersion" in body &&
        body.schemaVersion === 1 &&
        "profile" in body &&
        isResumeDraft(body.profile)
        ? { ok: true, profile: body.profile }
        : failure("UNAVAILABLE");
    } catch {
      return failure("NETWORK");
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  return (
    message: unknown,
    sender: { id?: string; url?: string },
  ): Promise<ResumeDraftResult> | undefined => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      message.type !== RESUME_IMPORT_MESSAGE
    )
      return undefined;
    const { text } = message as { text?: unknown };
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (sender.id !== extensionId || !trimmed)
      return Promise.resolve(failure("INVALID_INPUT"));
    if (trimmed.length > RESUME_MAX_CHARS)
      return Promise.resolve(failure("TOO_LONG"));
    return run(trimmed);
  };
}
