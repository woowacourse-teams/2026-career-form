// 평가 데이터셋 수집 전용. 확장 번들에서 import하지 않는다.
import { createHash } from "node:crypto";
import type { Profile } from "../../profile/model";
import { type RecordedCall, recordGenericCalls } from "./record-calls";

export type CallKind =
  "INTERACTION_DECISION" | "SECTION_CLASSIFY" | "GENERIC_FIELDS";

/** 사람이 검토한 화면 하나의 정답 파일 형식(ground-truth/*.json). */
export interface StateTruth {
  state: string;
  candidateSha256: string;
  sectionClassify: Record<
    string,
    { category: string; fields?: string[] } | string
  >;
  fieldMapping: Record<string, { key: string | null }>;
  preparation: {
    sectionClassify: Record<string, string>;
    interactionDecisions: Record<string, { expected: string | null }>;
    review: { status: string };
  };
  review?: { by: string; on: string };
}

export interface CaseCall {
  order: number;
  phase: RecordedCall["phase"];
  kind: CallKind;
  endpoint: string;
  requestDigest: string;
  request: unknown;
  /** 항목 ID → 정답. null은 매핑 불가 또는 기권. */
  expected: Record<string, string | null>;
  /** 서버 기본 설정(배치 5)으로 추정한 내부 모델 호출 수. 실제 수는 실행 때 관측한다. */
  estimatedModelCalls: number;
}

export interface CaseFile {
  schemaVersion: 1;
  caseId: string;
  siteId: string;
  state: string;
  split: "tuning" | "final";
  fixtureId: string;
  fixtureSha256: string;
  profileId: string;
  calls: CaseCall[];
}

const KIND_BY_ENDPOINT: Record<string, CallKind> = {
  "/api/v1/generic/interaction-decisions": "INTERACTION_DECISION",
  "/api/v1/generic/sections/classify": "SECTION_CLASSIFY",
  "/api/v1/generic/fields/analyze": "GENERIC_FIELDS",
};
const FIELD_BATCH_SIZE = 5;

export interface CaseInput {
  caseId: string;
  siteId: string;
  split: CaseFile["split"];
  fixtureId: string;
  fixtureHtml: string;
  profileId: string;
  profile: Profile;
  truth: StateTruth;
}

/**
 * 고정 화면을 제품 범용 흐름에 넣어 요청을 호출 순서대로 기록하고 각 호출에 정답을 붙인다.
 * 후속 요청은 정답 오라클로 만든다. 정답에 없는 항목이 요청에 있으면 거부한다.
 */
export async function buildCase(
  document: Document,
  input: CaseInput,
): Promise<CaseFile> {
  const fixtureSha256 = sha256(input.fixtureHtml);
  if (fixtureSha256 !== input.truth.candidateSha256)
    throw new Error(`정답이 다른 화면 기준입니다: ${input.fixtureId}`);
  document.body.innerHTML = input.fixtureHtml.replace(
    /^[\s\S]*<body>|<\/body>[\s\S]*$/g,
    "",
  );
  const { truth } = input;
  const recorded = await recordGenericCalls(document, input.profile, {
    category: (section, phase) =>
      required(
        phase === "PREPARATION"
          ? truth.preparation.sectionClassify[section.sectionId]
          : categoryOf(truth.sectionClassify[section.sectionId]),
        `${phase} 섹션 ${section.sectionId}`,
      ),
    // 결정 정답은 채점에만 쓰고 제품에는 기권으로 답한다. 정답을 고르면 제품이 정적 화면에서
    // 선택 뒤 재매칭 요청을 보내는데, 선택 뒤 화면은 고정 화면에 없고 별도 사례(상태)로 수집했다.
    decide: (decision) => {
      required(
        truth.preparation.interactionDecisions[decision.decisionId],
        `결정 ${decision.decisionId}`,
      );
      return null;
    },
  });
  return {
    schemaVersion: 1,
    caseId: input.caseId,
    siteId: input.siteId,
    state: truth.state,
    split: input.split,
    fixtureId: input.fixtureId,
    fixtureSha256,
    profileId: input.profileId,
    calls: recorded.map((call) => toCaseCall(call, truth)),
  };
}

function toCaseCall(call: RecordedCall, truth: StateTruth): CaseCall {
  const kind = required(KIND_BY_ENDPOINT[call.endpoint], call.endpoint);
  const request = JSON.parse(call.serializedRequest) as {
    sections?: { sectionId: string; fields?: { candidateId: string }[] }[];
    decisions?: { decisionId: string }[];
  };
  const expected: Record<string, string | null> = {};
  let estimatedModelCalls = 1;
  if (kind === "INTERACTION_DECISION")
    for (const { decisionId } of request.decisions ?? [])
      expected[decisionId] = required(
        truth.preparation.interactionDecisions[decisionId],
        decisionId,
      ).expected;
  else if (kind === "SECTION_CLASSIFY")
    for (const { sectionId } of request.sections ?? [])
      expected[sectionId] = required(
        call.phase === "PREPARATION"
          ? truth.preparation.sectionClassify[sectionId]
          : categoryOf(truth.sectionClassify[sectionId]),
        sectionId,
      );
  else {
    estimatedModelCalls = 0;
    for (const section of request.sections ?? []) {
      const fields = section.fields ?? [];
      estimatedModelCalls += Math.ceil(fields.length / FIELD_BATCH_SIZE);
      for (const { candidateId } of fields)
        expected[candidateId] = required(
          truth.fieldMapping[candidateId],
          candidateId,
        ).key;
    }
  }
  return {
    order: call.order,
    phase: call.phase,
    kind,
    endpoint: call.endpoint,
    requestDigest: call.requestDigest,
    request,
    expected,
    estimatedModelCalls,
  };
}

function categoryOf(entry: StateTruth["sectionClassify"][string] | undefined) {
  return typeof entry === "string" ? entry : entry?.category;
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`정답이 없습니다: ${what}`);
  return value;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
