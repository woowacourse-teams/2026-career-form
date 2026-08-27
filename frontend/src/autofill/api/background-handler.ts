import type {
  AnalysisErrorCode,
  AnalysisRequestMessage,
  AnalysisResponseEnvelope,
} from "./messages";
import { isAnalysisRequestMessage } from "./messages";

const endpointByType: Record<AnalysisRequestMessage["type"], string> = {
  AUTOFILL_ANALYZE_PREPARATION: "/api/v1/preparation/analyze",
  AUTOFILL_ANALYZE_FIELDS: "/api/v1/fields/analyze",
};

const errorCodeByStatus: Record<number, AnalysisErrorCode> = {
  400: "BAD_REQUEST",
  413: "PAYLOAD_TOO_LARGE",
  429: "RATE_LIMITED",
};

interface AnalysisHandlerOptions {
  baseUrl: string | undefined;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export function createAnalysisMessageHandler({
  baseUrl,
  fetcher = fetch,
  timeoutMs = 60_000,
}: AnalysisHandlerOptions) {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/$/, "") ?? "";

  return async (
    message: unknown,
  ): Promise<AnalysisResponseEnvelope | undefined> => {
    if (!isAnalysisRequestMessage(message)) {
      return undefined;
    }
    if (!normalizedBaseUrl) {
      return { ok: false, code: "NOT_CONFIGURED" };
    }

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(
        `${normalizedBaseUrl}${endpointByType[message.type]}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message.payload),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        return {
          ok: false,
          code:
            errorCodeByStatus[response.status] ??
            (response.status >= 500 ? "SERVER_ERROR" : "BAD_REQUEST"),
        };
      }
      try {
        return { ok: true, data: await response.json() };
      } catch {
        return { ok: false, code: "INVALID_RESPONSE" };
      }
    } catch (error) {
      return {
        ok: false,
        code:
          error instanceof DOMException && error.name === "AbortError"
            ? "TIMEOUT"
            : "NETWORK",
      };
    } finally {
      globalThis.clearTimeout(timeout);
    }
  };
}
