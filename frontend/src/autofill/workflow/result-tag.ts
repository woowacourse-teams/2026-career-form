import type { WriteFailureCode } from "../write/failure";

const REASON_TAG: Record<string, string> = {
  "기존 값과 다름": "값 다름",
  "선택 필요": "직접 선택",
  "입력 못함": "입력 못함",
  "입력 결과 확인": "확인 필요",
  "값 확인 필요": "확인 필요",
  "승인 필요": "직접 입력",
};

// A failed write says little by itself; these codes tell the user the next step.
const CODE_TAG: Partial<Record<WriteFailureCode, string>> = {
  SEARCH_NO_EXACT_MATCH: "직접 선택",
  SEARCH_AMBIGUOUS: "직접 선택",
  SEARCH_UNCONFIRMED: "직접 선택",
  VALUE_NOT_RETAINED: "직접 선택",
  DATE_UNCONFIRMED: "직접 선택",
  DRIVER_SELECTION_UNCONFIRMED: "직접 선택",
  OPTION_UNMATCHED: "값 다름",
  SEARCH_SELECTION_UNVERIFIED: "확인 필요",
  VALUE_MATCH_UNRECORDED: "확인 필요",
};

/** Short, value-free tag shown beside a field that needs the user's attention. */
export function resultTagLabel(
  reason: string,
  code?: WriteFailureCode,
): string {
  if (reason === "입력 못함" && code && Object.hasOwn(CODE_TAG, code))
    return CODE_TAG[code]!;
  return Object.hasOwn(REASON_TAG, reason) ? REASON_TAG[reason] : "확인 필요";
}
