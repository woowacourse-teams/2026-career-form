import type { WriteFailureCode } from "../write/failure";

const guidance: Record<WriteFailureCode, string> = {
  SEARCH_NO_RESULTS: "검색 결과가 없어요. 다른 이름으로 찾아 주세요.",
  SEARCH_NO_EXACT_MATCH:
    "등록한 값과 정확히 일치하는 검색 결과가 없어요. 목록에서 다른 이름을 찾아 주세요.",
  SEARCH_AMBIGUOUS:
    "일치하는 검색 결과가 여러 개예요. 목록에서 직접 골라 주세요.",
  SEARCH_TIMEOUT:
    "검색 결과를 기다렸지만 응답을 확인하지 못했어요. 지원서에서 다시 검색해 주세요.",
  SEARCH_UNCONFIRMED: "목록 선택을 확인하지 못했어요. 항목을 직접 골라 주세요.",
  EXAM_SCORE_NOT_READY:
    "시험명 선택 뒤에도 점수 칸을 확인하지 못했어요. 시험명을 목록에서 다시 고른 뒤 점수를 입력해 주세요.",
  ROW_SEARCH_UNCONFIRMED:
    "같은 행의 검색 항목을 확정하지 못해 입력을 보류했어요. 검색 항목을 목록에서 고른 뒤 이 값을 입력해 주세요.",
  FIELD_DISABLED:
    "지금은 비활성화된 칸이에요. 지원서의 입력 방법을 확인해 주세요.",
  FIELD_READONLY:
    "지금은 수정할 수 없는 칸이에요. 지원서의 입력 방법을 확인해 주세요.",
  FIELD_CHANGED:
    "입력 중 지원서의 필드 상태가 바뀌었어요. 해당 항목을 확인한 뒤 직접 입력해 주세요.",
  VALUE_NOT_RETAINED:
    "다른 항목을 입력한 뒤 선택값이 유지되지 않았어요. 목록에서 다시 골라 주세요.",
};

// Only trusted codes and our own classification labels reach this presentation layer.
// Raw site/backend errors may contain profile values and must never be rendered here.
export function resultGuidance(
  reason: string,
  code?: WriteFailureCode,
): string {
  if (code && Object.hasOwn(guidance, code)) return guidance[code];
  switch (reason) {
    case "승인 필요":
      return "민감한 정보라 자동으로 입력하지 않았어요. 필요한 경우 직접 입력해 주세요.";
    case "기존 값과 다름":
      return "지원서 값과 등록한 값이 달라요. 사용할 값을 확인해 주세요.";
    case "선택 필요":
      return "자동으로 선택하기 어려운 항목이에요. 지원서 목록에서 직접 골라 주세요.";
    case "입력 결과 확인":
      return "입력 결과를 확인하지 못했어요. 지원서에 값이 들어갔는지 확인해 주세요.";
    default:
      return "자동으로 입력하지 못했어요. 지원서에서 이 값을 직접 입력해 주세요.";
  }
}
