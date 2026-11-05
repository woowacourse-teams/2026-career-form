import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import { isAutofillProfileFieldKey } from "../profile/profile-field-key";
import type {
  GenericFieldsRequest,
  GenericFieldsResponse,
  SectionClassifyRequest,
  SectionClassifyResponse,
} from "./types";
import { AnalysisContractError } from "./validate-response";

const STATUSES = ["COMPLETE", "STATIC_POLICY_PRESENT", "POLICY_UNAVAILABLE"];
const AUTOFILL_POLICIES = ["ALLOWED", "CONDITIONAL", "SENSITIVE_CONFIRMATION"];
const INTERACTION_STATUSES = [
  "READY",
  "MANUAL_REVEAL_REQUIRED",
  "BLOCKED",
  "SYSTEM_CONTROL",
  "UNVERIFIED",
];
const WRITE_COMMANDS = [
  "SEARCH_SELECTION",
  "SET_TEXT",
  "SELECT_OPTION",
  "SELECT_BUTTON_OPTION",
  "CHECK_RADIO",
  "CHECK_CHECKBOX",
  "SELECT_DATE",
];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function unitInterval(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Every response id must be a requested id, and every requested id must appear exactly once. */
function coversExactlyOnce(requested: string[], returned: unknown[]): boolean {
  const expected = new Set(requested);
  const seen = new Set<unknown>();
  for (const id of returned) {
    if (typeof id !== "string" || !expected.has(id) || seen.has(id))
      return false;
    seen.add(id);
  }
  return seen.size === expected.size;
}

function validEnvelope(
  value: unknown,
  schemaVersion: number,
  snapshotId: string,
  keys: string[],
  list: string,
): value is Record<string, unknown> {
  return (
    record(value) &&
    onlyKeys(value, keys) &&
    value.schemaVersion === schemaVersion &&
    value.snapshotId === snapshotId &&
    STATUSES.includes(String(value.status)) &&
    Array.isArray(value[list])
  );
}

export function validateSectionClassifyResponse(
  request: SectionClassifyRequest,
  value: unknown,
): SectionClassifyResponse {
  if (
    !validEnvelope(
      value,
      1,
      request.snapshotId,
      ["schemaVersion", "snapshotId", "status", "sections"],
      "sections",
    )
  )
    throw new AnalysisContractError();
  const sections = value.sections as unknown[];
  if (value.status !== "COMPLETE") {
    if (sections.length !== 0) throw new AnalysisContractError();
    return value as unknown as SectionClassifyResponse;
  }
  if (
    !sections.every(
      (section) =>
        record(section) &&
        onlyKeys(section, ["sectionId", "category", "confidence"]) &&
        typeof section.category === "string" &&
        section.category.length >= 1 &&
        section.category.length <= 32 &&
        unitInterval(section.confidence),
    ) ||
    !coversExactlyOnce(
      request.sections.map((section) => section.sectionId),
      sections.map((section) => (section as { sectionId?: unknown }).sectionId),
    )
  )
    throw new AnalysisContractError();
  return value as unknown as SectionClassifyResponse;
}

function requestedCandidateIds(request: GenericFieldsRequest): string[] {
  return request.sections.flatMap((section) => [
    ...section.fields.map((field) => field.candidateId),
    ...(section.items ?? []).flatMap((item) =>
      item.fields.map((field) => field.candidateId),
    ),
  ]);
}

/**
 * A matched field carries its policy; an unmatched one is BLOCKED with neither
 * policy nor plan. A write plan holds one known command and only when READY.
 */
function validFieldPolicy(field: Record<string, unknown>): boolean {
  if (!INTERACTION_STATUSES.includes(String(field.interactionStatus)))
    return false;
  if (field.writePlan !== undefined) {
    if (
      field.interactionStatus !== "READY" ||
      !record(field.writePlan) ||
      !onlyKeys(field.writePlan, ["command"]) ||
      !WRITE_COMMANDS.includes(String(field.writePlan.command))
    )
      return false;
  }
  if (field.profileFieldKey === null && field.binding === undefined)
    return (
      field.autofillPolicy === undefined &&
      field.writePlan === undefined &&
      field.interactionStatus === "BLOCKED"
    );
  if (record(field.binding) && field.binding.type === "DERIVED")
    return field.autofillPolicy === "ALLOWED";
  return AUTOFILL_POLICIES.includes(String(field.autofillPolicy));
}

function validBinding(field: Record<string, unknown>): boolean {
  if (field.binding === undefined) return true;
  const binding = field.binding;
  if (!record(binding)) return false;
  if (binding.type === "DERIVED")
    return (
      onlyKeys(binding, ["type", "recipe"]) &&
      field.profileFieldKey === null &&
      [
        "KOREAN_FULL_NAME",
        "ENGLISH_FULL_NAME_GIVEN_FIRST",
        "ENGLISH_FULL_NAME_FAMILY_FIRST",
      ].includes(String(binding.recipe))
    );
  if (binding.type !== "DATE_PART" || typeof field.profileFieldKey !== "string")
    return false;
  const [categoryId, sectionId, fieldId] = field.profileFieldKey.split(".");
  return (
    onlyKeys(binding, ["type", "part"]) &&
    ["YEAR", "MONTH", "DAY"].includes(String(binding.part)) &&
    PROFILE_CATEGORIES.some(
      (category) =>
        category.id === categoryId &&
        category.sections.some(
          (section) =>
            section.id === sectionId &&
            section.fields.some(
              (profileField) =>
                profileField.id === fieldId &&
                profileField.inputType === "date",
            ),
        ),
    )
  );
}

export function validateGenericFieldsResponse(
  request: GenericFieldsRequest,
  value: unknown,
): GenericFieldsResponse {
  if (
    !validEnvelope(
      value,
      3,
      request.snapshotId,
      ["schemaVersion", "snapshotId", "status", "fields", "diagnostics"],
      "fields",
    ) ||
    !record(value.diagnostics) ||
    !onlyKeys(value.diagnostics, ["jevCalls", "elapsedMs"]) ||
    !nonNegativeInteger(value.diagnostics.jevCalls) ||
    !nonNegativeInteger(value.diagnostics.elapsedMs)
  )
    throw new AnalysisContractError();
  const fields = value.fields as unknown[];
  if (value.status !== "COMPLETE") {
    if (
      fields.length !== 0 ||
      value.diagnostics.jevCalls !== 0 ||
      value.diagnostics.elapsedMs !== 0
    )
      throw new AnalysisContractError();
    return value as unknown as GenericFieldsResponse;
  }
  if (
    !fields.every(
      (field) =>
        record(field) &&
        onlyKeys(field, [
          "candidateId",
          "profileFieldKey",
          "confidence",
          "categoryConfirmed",
          "reason",
          "autofillPolicy",
          "interactionStatus",
          "writePlan",
          "binding",
          "inference",
        ]) &&
        (field.inference === undefined ||
          field.inference === "PAIRED_DATE" ||
          field.inference === "LANGUAGE_SCORE" ||
          field.inference === "LANGUAGE_GRADE") &&
        validBinding(field) &&
        validFieldPolicy(field) &&
        (field.profileFieldKey === null ||
          (typeof field.profileFieldKey === "string" &&
            isAutofillProfileFieldKey(field.profileFieldKey))) &&
        unitInterval(field.confidence) &&
        typeof field.categoryConfirmed === "boolean" &&
        (field.reason === undefined || field.reason === "LLM_UNAVAILABLE"),
    ) ||
    !coversExactlyOnce(
      requestedCandidateIds(request),
      fields.map((field) => (field as { candidateId?: unknown }).candidateId),
    )
  )
    throw new AnalysisContractError();
  return value as unknown as GenericFieldsResponse;
}
