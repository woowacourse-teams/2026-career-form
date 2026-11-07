// 평가 데이터셋 수집 전용. 확장 번들에서 import하지 않는다(jsdom·node 실행).
import { createHash } from "node:crypto";
import { createAnalysisMessageHandler } from "../../autofill/api/background-handler";
import { RuntimeAnalysisApiClient } from "../../autofill/api/runtime-client";
import {
  analyzeGenericFields,
  createGenericAnalysisCache,
} from "../../autofill/generic/generic-analysis";
import { collectGenericStructureSnapshot } from "../../autofill/generic/structure-context";
import { runGenericStructureLoop } from "../../autofill/generic/structure-loop";
import type { Profile } from "../../profile/model";

export type CallPhase = "PREPARATION" | "MAPPING";

export interface RecordedCall {
  order: number;
  phase: CallPhase;
  endpoint: string;
  /** 제품의 background handler가 fetch에 넘긴 본문 그대로. */
  serializedRequest: string;
  /** 생성 ID(snapshotId)를 뺀 정규화 본문의 sha256. 같은 화면이면 같다. */
  requestDigest: string;
}

/**
 * 후속 요청을 만들 정답 오라클. 이전 호출의 응답을 모델 답 대신 정답으로 채워
 * 앞 호출의 오답이 다음 요청 입력에 번지지 않게 한다(D4).
 */
export interface CallOracle {
  /** 섹션 분류 정답 범주. 준비 단계와 매핑 단계는 섹션 ID 체계가 다르다(ls*, gs*). */
  category(section: ClassifiedSection, phase: CallPhase): string;
  /** 버튼·선택지 결정의 정답 candidateId. 없으면 기권. */
  decide(decision: {
    decisionId: string;
    role: string;
    targetKind?: string;
  }): string | null;
}

const BASE_URL = "https://evaluation.invalid";

/**
 * 제품 범용 흐름(준비 루프 → 범용 매핑)을 jsdom 문서에서 그대로 실행하고, background handler가
 * 서버로 보내려던 요청을 호출 순서대로 기록한다. 네트워크와 모델은 호출하지 않는다.
 */
export async function recordGenericCalls(
  document: Document,
  profile: Profile,
  oracle: CallOracle,
): Promise<RecordedCall[]> {
  const calls: RecordedCall[] = [];
  let phase: CallPhase = "PREPARATION";
  const handler = createAnalysisMessageHandler({
    baseUrl: BASE_URL,
    fetcher: async (url, init) => {
      const serializedRequest = String(init?.body);
      const endpoint = new URL(String(url)).pathname;
      calls.push({
        order: calls.length + 1,
        phase,
        endpoint,
        serializedRequest,
        requestDigest: normalizedRequestDigest(serializedRequest),
      });
      return Response.json(
        oracleReply(endpoint, JSON.parse(serializedRequest), oracle, phase),
      );
    },
  });
  const client = new RuntimeAnalysisApiClient(
    (message) => handler(message) as ReturnType<typeof handler> as never,
  );
  const structure = await runGenericStructureLoop({
    document,
    profile,
    apiClient: client,
  });
  phase = "MAPPING";
  const snapshot = await collectGenericStructureSnapshot(
    document,
    undefined,
    structure.context,
  );
  await analyzeGenericFields(
    snapshot,
    document,
    client,
    profile,
    createGenericAnalysisCache(),
  );
  return calls;
}

export function normalizedRequestDigest(serializedRequest: string): string {
  const { snapshotId: _ignored, ...rest } = JSON.parse(
    serializedRequest,
  ) as Record<string, unknown>;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

export interface ClassifiedSection {
  sectionId: string;
  title?: string;
  labels?: string[];
}

type Body = {
  snapshotId: string;
  sections?: (ClassifiedSection & { fields?: { candidateId: string }[] })[];
  decisions?: { decisionId: string; role: string; targetKind?: string }[];
};

function oracleReply(
  endpoint: string,
  body: Body,
  oracle: CallOracle,
  phase: CallPhase,
) {
  if (endpoint.endsWith("/generic/interaction-decisions"))
    return {
      schemaVersion: 2,
      snapshotId: body.snapshotId,
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: (body.decisions ?? []).map((decision) => {
        const candidateId = oracle.decide(decision);
        return {
          decisionId: decision.decisionId,
          role: decision.role,
          selection: candidateId ? "SELECTED" : "ABSTAINED",
          candidateId,
        };
      }),
    };
  if (endpoint.endsWith("/generic/sections/classify"))
    return {
      schemaVersion: 1,
      snapshotId: body.snapshotId,
      status: "COMPLETE",
      sections: (body.sections ?? []).map((section) => ({
        sectionId: section.sectionId,
        category: oracle.category(section, phase),
        confidence: 1,
      })),
    };
  // 매핑 응답은 이후 요청을 만들지 않으므로 기권으로 채운다.
  return {
    schemaVersion: 3,
    snapshotId: body.snapshotId,
    status: "COMPLETE",
    diagnostics: { jevCalls: 0, elapsedMs: 0 },
    fields: (body.sections ?? []).flatMap((section) =>
      (section.fields ?? []).map((field) => ({
        candidateId: field.candidateId,
        profileFieldKey: null,
        confidence: 0,
        categoryConfirmed: false,
        interactionStatus: "BLOCKED",
      })),
    ),
  };
}
