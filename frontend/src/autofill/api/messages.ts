import type { FieldsAnalyzeRequest, PreparationAnalyzeRequest } from "./types";

export type AnalysisRequestMessage =
  | {
      type: "AUTOFILL_ANALYZE_PREPARATION";
      payload: PreparationAnalyzeRequest;
    }
  | { type: "AUTOFILL_ANALYZE_FIELDS"; payload: FieldsAnalyzeRequest };

export type AnalysisErrorCode =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "NETWORK"
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "INVALID_RESPONSE";

export type AnalysisResponseEnvelope =
  { ok: true; data: unknown } | { ok: false; code: AnalysisErrorCode };

export function isAnalysisRequestMessage(
  value: unknown,
): value is AnalysisRequestMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  const payload = (value as { payload?: unknown }).payload;
  return (
    (type === "AUTOFILL_ANALYZE_PREPARATION" ||
      type === "AUTOFILL_ANALYZE_FIELDS") &&
    typeof payload === "object" &&
    payload !== null &&
    "schemaVersion" in payload &&
    payload.schemaVersion === 2 &&
    "snapshotId" in payload &&
    typeof payload.snapshotId === "string"
  );
}

export function isAnalysisResponseEnvelope(
  value: unknown,
): value is AnalysisResponseEnvelope {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    return false;
  }
  if (value.ok === true) {
    return "data" in value;
  }
  return (
    value.ok === false &&
    "code" in value &&
    [
      "NOT_CONFIGURED",
      "TIMEOUT",
      "NETWORK",
      "BAD_REQUEST",
      "PAYLOAD_TOO_LARGE",
      "RATE_LIMITED",
      "SERVER_ERROR",
      "INVALID_RESPONSE",
    ].includes(String(value.code))
  );
}
