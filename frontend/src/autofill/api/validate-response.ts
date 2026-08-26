import type {
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
  PreparationAnalyzeRequest,
  PreparationAnalyzeResponse,
  WriteCommand,
} from "./types";

export class AnalysisContractError extends Error {
  constructor() {
    super("지원서 분석 응답 형식이 올바르지 않습니다.");
    this.name = "AnalysisContractError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T => typeof value === "string" && allowed.includes(value as T);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean => Object.keys(value).every((key) => allowed.includes(key));

function assertCommonResponse(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.snapshotId) ||
    !isOneOf(value.mode, ["ADAPTER", "GENERIC"]) ||
    !isOneOf(value.analysisStatus, ["COMPLETE", "PARTIAL", "BLOCKED"])
  ) {
    throw new AnalysisContractError();
  }
}

function collectActionCandidateIds(
  request: PreparationAnalyzeRequest,
): Set<string> {
  return new Set(
    request.sections.flatMap((section) => [
      ...section.actionCandidates.map(({ candidateId }) => candidateId),
      ...(section.items ?? []).flatMap((item) =>
        item.actionCandidates.map(({ candidateId }) => candidateId),
      ),
    ]),
  );
}

function collectFieldCandidates(
  request: FieldsAnalyzeRequest,
): Map<string, FieldCandidate> {
  return new Map(
    request.sections.flatMap((section) => [
      ...section.fields.map(
        (candidate) => [candidate.candidateId, candidate] as const,
      ),
      ...(section.items ?? []).flatMap((item) =>
        item.fields.map(
          (candidate) => [candidate.candidateId, candidate] as const,
        ),
      ),
    ]),
  );
}

function validateStringArray(
  value: unknown,
  allowed: readonly string[],
): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => isOneOf(item, allowed)))
  );
}

export function validatePreparationResponse(
  request: PreparationAnalyzeRequest,
  value: unknown,
): PreparationAnalyzeResponse {
  assertCommonResponse(value);
  if (
    !hasOnlyKeys(value, [
      "snapshotId",
      "mode",
      "analysisStatus",
      "preparationPlans",
      "warningCodes",
      "blockCode",
    ]) ||
    value.snapshotId !== request.snapshotId ||
    !Array.isArray(value.preparationPlans) ||
    !validateStringArray(value.warningCodes, ["MANUAL_REVEAL_REQUIRED"])
  ) {
    throw new AnalysisContractError();
  }

  const isBlocked = value.analysisStatus === "BLOCKED";
  if (
    (isBlocked &&
      (!isOneOf(value.blockCode, [
        "ADAPTER_STRUCTURE_MISMATCH",
        "UNSUPPORTED_SNAPSHOT",
      ]) ||
        value.preparationPlans.length > 0)) ||
    (!isBlocked && value.blockCode !== undefined)
  ) {
    throw new AnalysisContractError();
  }

  const candidateIds = collectActionCandidateIds(request);
  const sectionIds = new Set(
    request.sections.map(({ sectionId }) => sectionId),
  );
  const seen = new Set<string>();
  for (const plan of value.preparationPlans) {
    if (
      !isRecord(plan) ||
      !isNonEmptyString(plan.actionCandidateId) ||
      !candidateIds.has(plan.actionCandidateId) ||
      seen.has(plan.actionCandidateId)
    ) {
      throw new AnalysisContractError();
    }
    seen.add(plan.actionCandidateId);

    const validReveal =
      hasOnlyKeys(plan, [
        "actionCandidateId",
        "command",
        "expectedEffect",
        "targetSectionId",
      ]) &&
      plan.command === "REVEAL_SECTION" &&
      plan.expectedEffect === "TARGET_VISIBLE" &&
      isNonEmptyString(plan.targetSectionId) &&
      sectionIds.has(plan.targetSectionId);
    const validAddition =
      hasOnlyKeys(plan, ["actionCandidateId", "command", "expectedEffect"]) &&
      plan.command === "ADD_REPEATABLE_GROUP" &&
      plan.expectedEffect === "GROUP_COUNT_INCREMENT";
    if (!validReveal && !validAddition) {
      throw new AnalysisContractError();
    }
  }

  return value as unknown as PreparationAnalyzeResponse;
}

const writeCommandForControl: Record<
  FieldCandidate["control"],
  WriteCommand | undefined
> = {
  text: "SET_TEXT",
  textarea: "SET_TEXT",
  select: "SELECT_OPTION",
  radio: "CHECK_RADIO",
  checkbox: "CHECK_CHECKBOX",
  custom: undefined,
};

function validateFieldAnalysis(
  value: unknown,
  candidates: Map<string, FieldCandidate>,
): string {
  if (!isRecord(value) || !isNonEmptyString(value.candidateId)) {
    throw new AnalysisContractError();
  }
  const candidate = candidates.get(value.candidateId);
  if (!candidate) {
    throw new AnalysisContractError();
  }

  if (value.matchType === "NO_MATCH") {
    if (
      !hasOnlyKeys(value, [
        "candidateId",
        "matchType",
        "mappingStatus",
        "interactionStatus",
        "reasonCodes",
      ]) ||
      !isOneOf(value.mappingStatus, ["ADAPTER_VERIFIED", "LLM_SUGGESTED"]) ||
      value.interactionStatus !== "BLOCKED" ||
      !Array.isArray(value.reasonCodes) ||
      value.reasonCodes.length !== 1 ||
      value.reasonCodes[0] !== "NO_MATCH"
    ) {
      throw new AnalysisContractError();
    }
    return value.candidateId;
  }

  if (
    value.matchType !== "MATCH" ||
    !hasOnlyKeys(value, [
      "candidateId",
      "matchType",
      "profileFieldKey",
      "autofillPolicy",
      "mappingStatus",
      "interactionStatus",
      "writePlan",
    ]) ||
    !isNonEmptyString(value.profileFieldKey) ||
    !/^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*){2}$/.test(
      value.profileFieldKey,
    ) ||
    !isOneOf(value.autofillPolicy, [
      "ALLOWED",
      "CONDITIONAL",
      "SENSITIVE_CONFIRMATION",
    ]) ||
    !isOneOf(value.mappingStatus, ["ADAPTER_VERIFIED", "LLM_SUGGESTED"]) ||
    !isOneOf(value.interactionStatus, [
      "READY",
      "MANUAL_REVEAL_REQUIRED",
      "BLOCKED",
      "SYSTEM_CONTROL",
      "UNVERIFIED",
    ])
  ) {
    throw new AnalysisContractError();
  }

  if (value.writePlan !== undefined) {
    if (
      !isRecord(value.writePlan) ||
      !hasOnlyKeys(value.writePlan, ["command"]) ||
      !isOneOf(value.writePlan.command, [
        "SET_TEXT",
        "SELECT_OPTION",
        "CHECK_RADIO",
        "CHECK_CHECKBOX",
      ]) ||
      writeCommandForControl[candidate.control] !== value.writePlan.command
    ) {
      throw new AnalysisContractError();
    }
  }

  if (value.interactionStatus === "READY" && value.writePlan === undefined) {
    throw new AnalysisContractError();
  }
  return value.candidateId;
}

export function validateFieldsResponse(
  request: FieldsAnalyzeRequest,
  value: unknown,
): FieldsAnalyzeResponse {
  assertCommonResponse(value);
  if (
    !hasOnlyKeys(value, [
      "snapshotId",
      "mode",
      "analysisStatus",
      "fields",
      "warningCodes",
      "blockCode",
    ]) ||
    value.snapshotId !== request.snapshotId ||
    !Array.isArray(value.fields) ||
    !validateStringArray(value.warningCodes, [
      "UNRESOLVED_FIELD",
      "LLM_UNAVAILABLE",
    ])
  ) {
    throw new AnalysisContractError();
  }

  const isBlocked = value.analysisStatus === "BLOCKED";
  if (
    (isBlocked &&
      (value.blockCode !== "ADAPTER_STRUCTURE_MISMATCH" ||
        value.fields.length > 0)) ||
    (!isBlocked && value.blockCode !== undefined)
  ) {
    throw new AnalysisContractError();
  }

  const candidates = collectFieldCandidates(request);
  const seen = new Set<string>();
  for (const field of value.fields) {
    const candidateId = validateFieldAnalysis(field, candidates);
    if (seen.has(candidateId)) {
      throw new AnalysisContractError();
    }
    seen.add(candidateId);
  }

  return value as unknown as FieldsAnalyzeResponse;
}
