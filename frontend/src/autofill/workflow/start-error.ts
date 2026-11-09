import {
  AnalysisServiceError,
  isTransientAnalysisError,
} from "../api/runtime-client";
import type { WorkflowErrorKind } from "./WorkflowError";

/** Which error screen a failure before the first write maps to. */
export function startErrorKind(error: unknown): WorkflowErrorKind {
  if (error instanceof AnalysisServiceError) {
    if (error.code === "POLICY_INCOMPATIBLE") return "updateNeeded";
    if (error.code === "RATE_LIMITED") return "rateLimited";
    if (isTransientAnalysisError(error)) return "connection";
  }
  return "unknown";
}

/** Raw text for the developer-mode "오류 정보" block only. */
export function errorDetail(error: unknown): string {
  if (error instanceof AnalysisServiceError)
    return [error.code ?? error.transport, error.message]
      .filter(Boolean)
      .join(" ");
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

export function errorNotice(error: unknown): string | undefined {
  return error instanceof AnalysisServiceError ? error.notice : undefined;
}
