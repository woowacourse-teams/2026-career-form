import type {
  AnalysisErrorCode,
  AnalysisRequestMessage,
  AnalysisResponseEnvelope,
} from "./messages";
import { isAnalysisRequestMessage } from "./messages";
import {
  BackgroundQualityReporting,
  type QualitySource,
} from "../quality/background-reporting";

const endpointByType: Record<AnalysisRequestMessage["type"], string> = {
  AUTOFILL_ANALYZE_PREPARATION: "/api/v1/preparation/analyze",
  AUTOFILL_DECIDE_INTERACTIONS: "/api/v1/generic/interaction-decisions",
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
  extensionId?: string;
  extensionVersion?: string;
}

export function createAnalysisMessageHandler({
  baseUrl,
  fetcher = fetch,
  timeoutMs = 60_000,
  extensionId,
  extensionVersion,
}: AnalysisHandlerOptions) {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/$/, "") ?? "";
  const quality = new BackgroundQualityReporting(
    normalizedBaseUrl,
    fetcher,
    extensionId,
  );

  return async (
    message: unknown,
    source?: QualitySource,
  ): Promise<AnalysisResponseEnvelope | { ok: boolean } | undefined> => {
    const report = await quality.report(message, source);
    if (report) return report;
    if (!isAnalysisRequestMessage(message)) {
      return undefined;
    }
    if (!normalizedBaseUrl) {
      return { ok: false, code: "NOT_CONFIGURED" };
    }

    const controller = new AbortController();
    const qualityOwner = quality.owner(
      "qualityRun" in message ? message.qualityRun : undefined,
      source,
    );
    const requestTimeout =
      message.type === "AUTOFILL_DECIDE_INTERACTIONS"
        ? Math.min(timeoutMs, 8_000)
        : timeoutMs;
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      requestTimeout,
    );
    try {
      const response = await fetcher(
        `${normalizedBaseUrl}${endpointByType[message.type]}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...quality.headers(qualityOwner),
            ...(qualityOwner
              ? { "X-Career-Form-Version": extensionVersion ?? "UNKNOWN" }
              : {}),
            ...(message.type === "AUTOFILL_ANALYZE_PREPARATION"
              ? {
                  "X-Career-Form-Capabilities": qualityOwner
                    ? "address-search-v1,quality-v1"
                    : "address-search-v1",
                }
              : qualityOwner
                ? { "X-Career-Form-Capabilities": "quality-v1" }
                : {}),
          },
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
        const data = await response.json();
        return {
          ok: true,
          data,
          ...(quality.capture(qualityOwner, response) ? { quality: true } : {}),
        };
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
