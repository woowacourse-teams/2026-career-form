import {
  InstallationError,
  type InstallationCredentials,
} from "./installation-client";
import { admissionErrorCodes } from "./messages";
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

import { publicApplicationLink } from "../quality/public-application-link";

const endpointByType: Record<AnalysisRequestMessage["type"], string> = {
  AUTOFILL_ANALYZE_PREPARATION: "/api/v1/preparation/analyze",
  AUTOFILL_DECIDE_INTERACTIONS: "/api/v1/generic/interaction-decisions",
  AUTOFILL_ANALYZE_FIELDS: "/api/v1/fields/analyze",
  AUTOFILL_GENERIC_CLASSIFY_SECTIONS: "/api/v1/generic/sections/classify",
  AUTOFILL_GENERIC_ANALYZE_FIELDS: "/api/v1/generic/fields/analyze",
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
  installation?: { credentials(): Promise<InstallationCredentials> };
}

export function createAnalysisMessageHandler({
  baseUrl,
  fetcher = fetch,
  timeoutMs = 60_000,
  extensionId,
  extensionVersion,
  installation,
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
    quality.start(qualityOwner);
    const publicLink =
      qualityOwner && message.type === "AUTOFILL_ANALYZE_FIELDS"
        ? publicApplicationLink(source?.url, message.payload.site?.host ?? "")
        : undefined;
    const requestTimeout = timeoutMs;
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      requestTimeout,
    );
    try {
      const credentials = await installation?.credentials();
      if (controller.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
      const response = await fetcher(
        `${normalizedBaseUrl}${endpointByType[message.type]}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(credentials
              ? {
                  "X-Career-Form-Installation": credentials.installationId,
                  Authorization: `Bearer ${credentials.token}`,
                }
              : {}),
            ...quality.headers(qualityOwner),
            ...(publicLink
              ? { "X-Career-Form-Public-Application": publicLink }
              : {}),
            ...(qualityOwner
              ? { "X-Career-Form-Version": extensionVersion ?? "UNKNOWN" }
              : {}),
            ...(message.type === "AUTOFILL_ANALYZE_PREPARATION"
              ? {
                  "X-Career-Form-Capabilities": qualityOwner
                    ? "address-search-v1,quality-v2"
                    : "address-search-v1",
                }
              : qualityOwner
                ? { "X-Career-Form-Capabilities": "quality-v2" }
                : {}),
          },
          body: JSON.stringify(message.payload),
          signal: controller.signal,
          credentials: "omit",
          redirect: "error",
        },
      );
      if (!response.ok) {
        const admissionCode = response.headers?.get("X-Career-Form-Admission");
        if (
          admissionErrorCodes.includes(
            admissionCode as (typeof admissionErrorCodes)[number],
          )
        ) {
          const value = response.headers.get("X-Career-Form-Retry-At");
          const retryAt =
            value && value.length <= 64 && Number.isFinite(Date.parse(value))
              ? value
              : undefined;
          return {
            ok: false,
            code: admissionCode as AnalysisErrorCode,
            ...(retryAt ? { retryAt } : {}),
          };
        }
        return {
          ok: false,
          code:
            errorCodeByStatus[response.status] ??
            (response.status >= 500 ? "SERVER_ERROR" : "BAD_REQUEST"),
          ...(response.status === 404 &&
          (message.type === "AUTOFILL_GENERIC_CLASSIFY_SECTIONS" ||
            message.type === "AUTOFILL_GENERIC_ANALYZE_FIELDS")
            ? { status: 404 as const }
            : {}),
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
      if (error instanceof InstallationError) {
        const code: AnalysisErrorCode = admissionErrorCodes.includes(
          error.code as (typeof admissionErrorCodes)[number],
        )
          ? (error.code as AnalysisErrorCode)
          : "ADMISSION_UNAVAILABLE";
        return {
          ok: false,
          code,
          ...(error.retryAt ? { retryAt: error.retryAt } : {}),
        };
      }
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
