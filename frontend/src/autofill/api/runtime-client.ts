import { startLocalTiming } from "../debug/local-timing";
import {
  validExecutionPolicy,
  type ExecutionPolicy,
} from "../workflow/execution-policy";
import type {
  InteractionDecisionRequest,
  InteractionDecisionResponse,
} from "./interaction-types";
import { validateInteractionDecisionResponse } from "./validate-interaction-response";
import { browser } from "wxt/browser";
import { QualityObservation } from "../quality/observation";
import { observeQuality } from "../quality/safe-observation";

import type { AnalysisResponseEnvelope } from "./messages";
import { isAnalysisResponseEnvelope } from "./messages";
import { debugApiMessage } from "../debug/autofill-debug";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
  GenericFieldsRequest,
  GenericFieldsResponse,
  PreparationAnalyzeRequest,
  PreparationAnalyzeResponse,
  SectionClassifyRequest,
  SectionClassifyResponse,
} from "./types";
import {
  validateGenericFieldsResponse,
  validateSectionClassifyResponse,
} from "./validate-generic-response";
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
  USER_LIMIT: "이번 시간의 분석 이용량을 모두 사용했습니다.",
  INSTALL_LIMIT:
    "짧은 시간에 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  GLOBAL_LIMIT:
    "서비스의 분석 이용량이 소진되었습니다. 안내된 시간 이후 다시 시도해 주세요.",
  REGISTRATION_LIMIT:
    "새 설치 등록 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  AI_BUSY:
    "분석 요청이 몰려 대기 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
  INSTALL_BUSY: "이미 진행 중인 분석이 많습니다. 완료 후 다시 시도해 주세요.",
  ADMISSION_UNAVAILABLE:
    "분석 이용 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  INVALID_INSTALLATION: "설치 자격을 확인할 수 없습니다.",
  INSECURE_TRANSPORT: "보안 연결을 확인할 수 없어 분석을 중단했습니다.",
  ANALYSIS_DEADLINE: "분석 제한 시간이 초과되었습니다. 다시 시도해 주세요.",
  ANALYSIS_CANCELLED: "분석이 중단되었습니다.",
  RATE_LIMITED: "분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  SERVER_ERROR: "분석 서버에서 오류가 발생했습니다.",
  INVALID_RESPONSE: "분석 서버 응답을 확인할 수 없습니다.",
};

export class AnalysisServiceError extends Error {
  constructor(
    message: string,
    readonly status?: 404,
    readonly code?: "POLICY_INCOMPATIBLE",
    /** Set only when the request never got a server answer in time. */
    readonly transport?: "TIMEOUT" | "NETWORK",
  ) {
    super(message);
    this.name = "AnalysisServiceError";
  }
}

/** A timeout or unreachable server, as opposed to a server or contract answer. */
export function isTransientAnalysisError(error: unknown): boolean {
  return error instanceof AnalysisServiceError && error.transport !== undefined;
}

export class RuntimeAnalysisApiClient implements AnalysisApiClient {
  readonly quality: QualityObservation;
  constructor(
    private readonly sendMessage: SendMessage = (message) =>
      browser.runtime.sendMessage(message),
  ) {
    this.quality = new QualityObservation((message) =>
      this.sendMessage(message),
    );
  }

  async loadExecutionPolicy(
    site: import("./types").SiteDescriptor,
  ): Promise<ExecutionPolicy | undefined> {
    const incompatible = () =>
      new AnalysisServiceError(
        errorMessages.INVALID_RESPONSE,
        undefined,
        "POLICY_INCOMPATIBLE",
      );
    // The background validates the served policy; an unusable response on
    // this path means the server's policy is newer than this extension.
    const response = await this.request({
      type: "AUTOFILL_LOAD_EXECUTION_POLICY",
      payload: site,
    }).catch((error: unknown) => {
      throw error instanceof AnalysisServiceError &&
        error.message === errorMessages.INVALID_RESPONSE
        ? incompatible()
        : error;
    });
    if (
      !response ||
      typeof response !== "object" ||
      !("executionPolicy" in response)
    )
      throw new AnalysisServiceError(errorMessages.INVALID_RESPONSE);
    if (response.executionPolicy === null) return undefined;
    if (!validExecutionPolicy(response.executionPolicy)) throw incompatible();
    return response.executionPolicy;
  }

  async decideInteractions(
    request: InteractionDecisionRequest,
  ): Promise<InteractionDecisionResponse> {
    const response = await this.request({
      type: "AUTOFILL_DECIDE_INTERACTIONS",
      payload: request,
    });
    return validateInteractionDecisionResponse(request, response);
  }

  async classifySections(
    request: SectionClassifyRequest,
  ): Promise<SectionClassifyResponse> {
    const response = await this.request({
      type: "AUTOFILL_GENERIC_CLASSIFY_SECTIONS",
      payload: request,
    });
    return validateSectionClassifyResponse(request, response);
  }

  async analyzeGenericFields(
    request: GenericFieldsRequest,
  ): Promise<GenericFieldsResponse> {
    const response = await this.request({
      type: "AUTOFILL_GENERIC_ANALYZE_FIELDS",
      payload: request,
    });
    return validateGenericFieldsResponse(request, response);
  }

  async analyzePreparation(
    request: PreparationAnalyzeRequest,
  ): Promise<PreparationAnalyzeResponse> {
    const response = await this.request({
      type: "AUTOFILL_ANALYZE_PREPARATION",
      payload: request,
    });
    const analysis = validatePreparationResponse(request, response);
    return analysis;
  }

  async analyzeFields(
    request: FieldsAnalyzeRequest,
  ): Promise<FieldsAnalyzeResponse> {
    const response = await this.request({
      type: "AUTOFILL_ANALYZE_FIELDS",
      payload: request,
    });
    try {
      const analysis = validateFieldsResponse(request, response);
      observeQuality(() => this.quality.readySnapshot(request.snapshotId));
      return analysis;
    } catch (error) {
      debugApiMessage(
        { type: "AUTOFILL_ANALYZE_FIELDS (응답 검증 실패)" },
        { error },
      );
      throw error;
    }
  }

  private async request(message: {
    type: string;
    payload: unknown;
  }): Promise<unknown> {
    let envelope: unknown;
    const finishTiming = startLocalTiming("api", { type: message.type });
    try {
      envelope = await this.sendMessage({
        ...message,
        qualityRun: this.quality.runKey,
      });
    } catch (error) {
      debugApiMessage(message, { error });
      throw new AnalysisServiceError(
        errorMessages.NETWORK,
        undefined,
        undefined,
        "NETWORK",
      );
    } finally {
      finishTiming();
    }
    debugApiMessage(message, {
      envelope,
      ...(isAnalysisResponseEnvelope(envelope) && !envelope.ok
        ? { error: envelope.code }
        : {}),
    });
    if (!isAnalysisResponseEnvelope(envelope)) {
      throw new AnalysisServiceError(errorMessages.INVALID_RESPONSE);
    }
    if (!envelope.ok) {
      throw new AnalysisServiceError(
        errorMessages[envelope.code] +
          (envelope.retryAt
            ? ` 재시도 가능 시간: ${new Date(envelope.retryAt).toLocaleTimeString("ko-KR")}`
            : ""),
        envelope.status,
        undefined,
        envelope.code === "TIMEOUT" || envelope.code === "NETWORK"
          ? envelope.code
          : undefined,
      );
    }
    return envelope.data;
  }
}
