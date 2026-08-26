import { browser } from "wxt/browser";

import type { AnalysisResponseEnvelope } from "./messages";
import { isAnalysisResponseEnvelope } from "./messages";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
  PreparationAnalyzeRequest,
  PreparationAnalyzeResponse,
} from "./types";
import {
  validateFieldsResponse,
  validatePreparationResponse,
} from "./validate-response";

type SendMessage = (message: unknown) => Promise<unknown>;

const errorMessages: Record<
  Exclude<AnalysisResponseEnvelope, { ok: true }>["code"],
  string
> = {
  NOT_CONFIGURED: "분석 서버가 아직 설정되지 않았습니다.",
  TIMEOUT: "분석 서버 응답 시간이 초과되었습니다.",
  NETWORK: "분석 서버에 연결할 수 없습니다.",
  BAD_REQUEST: "현재 지원서 구조를 분석할 수 없습니다.",
  PAYLOAD_TOO_LARGE: "현재 지원서의 분석 범위가 너무 큽니다.",
  RATE_LIMITED: "분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  SERVER_ERROR: "분석 서버에서 오류가 발생했습니다.",
  INVALID_RESPONSE: "분석 서버 응답을 확인할 수 없습니다.",
};

export class AnalysisServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisServiceError";
  }
}

export class RuntimeAnalysisApiClient implements AnalysisApiClient {
  constructor(
    private readonly sendMessage: SendMessage = (message) =>
      browser.runtime.sendMessage(message),
  ) {}

  async analyzePreparation(
    request: PreparationAnalyzeRequest,
  ): Promise<PreparationAnalyzeResponse> {
    const response = await this.request({
      type: "AUTOFILL_ANALYZE_PREPARATION",
      payload: request,
    });
    return validatePreparationResponse(request, response);
  }

  async analyzeFields(
    request: FieldsAnalyzeRequest,
  ): Promise<FieldsAnalyzeResponse> {
    const response = await this.request({
      type: "AUTOFILL_ANALYZE_FIELDS",
      payload: request,
    });
    return validateFieldsResponse(request, response);
  }

  private async request(message: unknown): Promise<unknown> {
    let envelope: unknown;
    try {
      envelope = await this.sendMessage(message);
    } catch {
      throw new AnalysisServiceError(errorMessages.NETWORK);
    }
    if (!isAnalysisResponseEnvelope(envelope)) {
      throw new AnalysisServiceError(errorMessages.INVALID_RESPONSE);
    }
    if (!envelope.ok) {
      throw new AnalysisServiceError(errorMessages[envelope.code]);
    }
    return envelope.data;
  }
}
