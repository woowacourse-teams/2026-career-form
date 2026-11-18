import {
  AnalysisServiceError,
  isTransientAnalysisError,
} from "../api/runtime-client";
import { AnalysisContractError } from "../api/validate-response";
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

/**
 * Fixed user-facing wording for a run that stopped on a caught error after it
 * started writing. Raw error text can echo page values, so it never appears
 * here; it stays in the developer-mode details. Empty means no known cause.
 */
export function interruptedStopReason(error: unknown): string {
  if (error instanceof AnalysisServiceError) {
    if (error.transport === "NETWORK") return "서버에 연결하지 못해 멈췄어요.";
    if (error.transport === "TIMEOUT") return "서버 응답이 늦어 멈췄어요.";
    if (error.code === "RATE_LIMITED")
      return "요청이 많아 멈췄어요. 잠시 후 다시 시도해 주세요.";
    if (error.code === "POLICY_INCOMPATIBLE")
      return "확장 프로그램 업데이트가 필요해 멈췄어요.";
    return "서버가 지원서 분석을 완료하지 못해 멈췄어요.";
  }
  if (error instanceof AnalysisContractError)
    return "서버 응답 형식을 확인할 수 없어 멈췄어요.";
  return "";
}
