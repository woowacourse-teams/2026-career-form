import { describe, expect, it } from "vitest";
import type { GenericSectionFailure } from "./generic-analysis";
import { GENERIC_BLOCKED_REASON } from "./generic-analysis";
import type { GradeReason } from "./field-grading";
import { genericReasonText } from "./grade-reason-text";
import type { GENERIC_STRUCTURE_BLOCKED_REASON } from "./structure-context";

// A missing key here fails type checking when a reason code is added.
const KNOWN_CODES: Record<
  | GradeReason
  | GenericSectionFailure
  | "UNLINKED"
  | typeof GENERIC_STRUCTURE_BLOCKED_REASON,
  true
> = {
  NO_PROFILE_VALUE: true,
  COUNTRY_CODE_OPTIONS: true,
  NON_DATE_FIELD: true,
  MIXED_EDUCATION_RECORD: true,
  LOW_CONFIDENCE: true,
  MODERATE_CONFIDENCE: true,
  CATEGORY_UNCONFIRMED: true,
  DUPLICATE_KEY_IN_ROW: true,
  DATE_PART_OPTIONS_MISMATCH: true,
  NO_FIELD_CONTEXT: true,
  FORMAT_KEY_MISMATCH: true,
  OTHER_PERSON_CONTEXT: true,
  UNPAIRED_NAME_PART: true,
  CLASSIFY_UNAVAILABLE: true,
  ANALYZE_UNAVAILABLE: true,
  ENDPOINT_UNAVAILABLE: true,
  LLM_UNAVAILABLE: true,
  SECTION_PROCESSING_FAILED: true,
  UNLINKED: true,
  STRUCTURE_BLOCKED: true,
};

describe("genericReasonText", () => {
  it("gives every known code its own readable sentence", () => {
    const texts = Object.keys(KNOWN_CODES).map(genericReasonText);
    expect(texts.every((text) => text.length > 0)).toBe(true);
    expect(texts).not.toContain(GENERIC_BLOCKED_REASON);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("fixes the wording of the context and format reasons", () => {
    expect(genericReasonText("NO_FIELD_CONTEXT")).toBe(
      "칸의 이름이나 주변 설명이 부족합니다. 값을 확인한 뒤 선택해 주세요.",
    );
    expect(genericReasonText("FORMAT_KEY_MISMATCH")).toBe(
      "입력 형식이 연결된 프로필 항목과 맞지 않아 입력할 수 없습니다.",
    );
    expect(genericReasonText("UNLINKED")).toBe(
      "저장된 정보와 연결하지 못했습니다.",
    );
  });

  it("falls back to the generic sentence for unknown or missing codes", () => {
    expect(genericReasonText("SOMETHING_NEW")).toBe(GENERIC_BLOCKED_REASON);
    expect(genericReasonText("")).toBe(GENERIC_BLOCKED_REASON);
    expect(genericReasonText(undefined)).toBe(GENERIC_BLOCKED_REASON);
    expect(genericReasonText("toString")).toBe(GENERIC_BLOCKED_REASON);
  });
});
