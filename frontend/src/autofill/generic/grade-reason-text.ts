import type { ReviewPlanItem } from "../review/review-plan";
import type { GradeReason } from "./field-grading";
import type { GENERIC_STRUCTURE_BLOCKED_REASON } from "./structure-context";
import {
  GENERIC_BLOCKED_REASON,
  GENERIC_UNLINKED_REASON,
  type GenericFieldGrade,
  type GenericSectionFailure,
} from "./generic-analysis";

type KnownReasonCode =
  | GradeReason
  | GenericSectionFailure
  | typeof GENERIC_UNLINKED_REASON
  | typeof GENERIC_STRUCTURE_BLOCKED_REASON
  | NonNullable<GenericFieldGrade["reason"]>;

// A new reason code fails type checking here until it gets a sentence.
const REASON_TEXT: Readonly<Record<KnownReasonCode, string>> = {
  NO_PROFILE_VALUE: "저장된 프로필에 입력할 값이 없습니다.",
  FIRST_ENTRY_SINGLE_ROW:
    "페이지에 행이 하나뿐이라 프로필의 첫 번째 항목을 연결했습니다. 값을 확인한 뒤 선택해 주세요.",
  PAIRED_DATE_INFERRED:
    "같은 칸 묶음의 종료일과 짝을 이루는 시작일로 추정했습니다. 값을 확인한 뒤 선택해 주세요.",
  LANGUAGE_RESULT_INFERRED:
    "어학 기록의 등급·점수 칸 중 저장된 값 형태에 맞는 칸으로 추정했습니다. 값을 확인한 뒤 선택해 주세요.",
  WRITE_PLAN_BLOCKED:
    "현재 페이지 상태에서 이 칸은 입력이 막혀 있어 직접 입력해야 합니다.",
  WRITE_PLAN_MANUAL_REVEAL: "칸을 직접 펼쳐야 해서 자동으로 입력하지 않습니다.",
  WRITE_PLAN_SYSTEM_CONTROL:
    "시스템이 관리하는 칸이라 자동으로 입력하지 않습니다.",
  WRITE_PLAN_UNVERIFIED:
    "입력 방법이 검증되지 않아 자동으로 입력하지 않습니다.",
  WRITE_PLAN_MISSING: "안전한 입력 방법을 확인하지 못해 직접 입력해야 합니다.",
  COUNTRY_CODE_OPTIONS: "국가 번호 선택지라서 직접 확인해 주세요.",
  NON_DATE_FIELD: "날짜 입력 칸이 아니라서 직접 확인해 주세요.",
  MIXED_EDUCATION_RECORD: "여러 학력 기록이 섞여 있어 직접 확인해 주세요.",
  LOW_CONFIDENCE: "연결 확신이 낮아 자동으로 입력하지 않습니다.",
  MODERATE_CONFIDENCE: "연결 확신이 보통입니다. 값을 확인한 뒤 선택해 주세요.",
  CATEGORY_UNCONFIRMED:
    "항목 분류를 확인하지 못했습니다. 값을 확인한 뒤 선택해 주세요.",
  DUPLICATE_KEY_IN_ROW:
    "같은 행에 같은 프로필 항목이 겹쳐 있어 직접 확인해 주세요.",
  DATE_PART_OPTIONS_MISMATCH:
    "날짜 선택지와 저장된 날짜가 맞지 않아 직접 확인해 주세요.",
  NO_FIELD_CONTEXT:
    "칸의 이름이나 주변 설명이 부족합니다. 값을 확인한 뒤 선택해 주세요.",
  FORMAT_KEY_MISMATCH:
    "입력 형식이 연결된 프로필 항목과 맞지 않아 입력할 수 없습니다.",
  OTHER_PERSON_CONTEXT:
    "지원자 본인이 아닌 다른 사람의 정보 칸으로 보여 입력하지 않습니다.",
  UNPAIRED_NAME_PART:
    "성과 이름이 나뉘지 않은 칸에 이름 한쪽만 연결됐습니다. 값을 확인한 뒤 선택해 주세요.",
  OPTION_VALUE_UNMATCHED:
    "저장된 값과 정확히 맞는 선택지가 없어 입력할 수 없습니다. 직접 선택해 주세요.",
  GRADE_OTHER_OPTION:
    "저장된 등급에 맞는 선택지가 없어 '기타'를 골랐습니다. 값을 확인한 뒤 선택해 주세요.",
  CLASSIFY_UNAVAILABLE: "섹션 분류를 하지 못해 이 영역은 입력할 수 없습니다.",
  ANALYZE_UNAVAILABLE: "칸 분석을 하지 못해 이 영역은 입력할 수 없습니다.",
  ENDPOINT_UNAVAILABLE:
    "연결된 분석 서버가 범용 분석을 지원하지 않아 입력할 수 없습니다.",
  LLM_UNAVAILABLE: "AI 분석을 사용할 수 없어 이 칸은 입력할 수 없습니다.",
  SECTION_PROCESSING_FAILED:
    "이 영역을 처리하는 중 문제가 생겨 입력할 수 없습니다.",
  UNLINKED: "저장된 정보와 연결하지 못했습니다.",
  STRUCTURE_BLOCKED:
    "이 항목은 입력 구조 준비 결과에 따라 자동 기입에서 제외했습니다.",
};

/** Reason shown for a generic-path review item; others keep their own. */
export function genericItemReason(item: ReviewPlanItem): string {
  const { genericGrade: grade, genericReasonCode: code } = item;
  if (!grade || grade === "AUTO") return item.reason;
  if (
    grade === "BLOCKED" &&
    code !== undefined &&
    Object.hasOwn(REASON_TEXT, code)
  )
    return genericReasonText(code);
  return item.reason || genericReasonText(code);
}

/** Readable sentence of a grade reason; unknown codes get the generic one. */
export function genericReasonText(code: string | undefined): string {
  return code !== undefined && Object.hasOwn(REASON_TEXT, code)
    ? REASON_TEXT[code as KnownReasonCode]
    : GENERIC_BLOCKED_REASON;
}
