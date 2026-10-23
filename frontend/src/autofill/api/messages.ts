import type { InteractionDecisionRequest } from "./interaction-types";
import type {
  FieldsAnalyzeRequest,
  GenericFieldsRequest,
  PreparationAnalyzeRequest,
  SectionClassifyRequest,
} from "./types";

export type AnalysisRequestMessage =
  | {
      type: "AUTOFILL_DECIDE_INTERACTIONS";
      payload: InteractionDecisionRequest;
    }
  | {
      type: "AUTOFILL_ANALYZE_PREPARATION";
      payload: PreparationAnalyzeRequest;
    }
  | { type: "AUTOFILL_ANALYZE_FIELDS"; payload: FieldsAnalyzeRequest }
  | {
      type: "AUTOFILL_GENERIC_CLASSIFY_SECTIONS";
      payload: SectionClassifyRequest;
    }
  | {
      type: "AUTOFILL_GENERIC_ANALYZE_FIELDS";
      payload: GenericFieldsRequest;
    };

const schemaVersionByType: Record<AnalysisRequestMessage["type"], number> = {
  AUTOFILL_ANALYZE_PREPARATION: 2,
  AUTOFILL_ANALYZE_FIELDS: 2,
  AUTOFILL_DECIDE_INTERACTIONS: 2,
  AUTOFILL_GENERIC_CLASSIFY_SECTIONS: 1,
  AUTOFILL_GENERIC_ANALYZE_FIELDS: 2,
};

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
  | { ok: true; data: unknown; quality?: boolean }
  | { ok: false; code: AnalysisErrorCode; status?: 404 };

export function isAnalysisRequestMessage(
  value: unknown,
): value is AnalysisRequestMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  const payload = (value as { payload?: unknown }).payload;
  return (
    typeof type === "string" &&
    Object.hasOwn(schemaVersionByType, type) &&
    typeof payload === "object" &&
    payload !== null &&
    "schemaVersion" in payload &&
    payload.schemaVersion ===
      schemaVersionByType[type as AnalysisRequestMessage["type"]] &&
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
    (!("status" in value) || value.status === 404) &&
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
