import { expect, it } from "vitest";
import { resultGuidance } from "./result-guidance";
import type { WriteFailureCode } from "../write/failure";

const fallback = resultGuidance("");
const added = {
  DRIVER_LIMIT_REACHED:
    "입력 분석 한도에 도달해 자동으로 입력하지 않았어요. 지원서에서 직접 입력해 주세요.",
  DRIVER_SELECTION_UNCONFIRMED:
    "조건부 선택 결과를 확인하지 못했어요. 이 항목을 직접 골라 주세요.",
  ROW_DRIVER_UNCONFIRMED:
    "같은 행의 선택 항목을 확정하지 못해 입력을 보류했어요. 선택 항목을 먼저 고른 뒤 이 값을 입력해 주세요.",
} satisfies Partial<Record<WriteFailureCode, string>>;

it.each(Object.entries(added))(
  "gives %s its own value-free guidance",
  (code, text) => {
    const guidance = resultGuidance("입력 불가", code as WriteFailureCode);
    expect(guidance).toBe(text);
    expect(guidance).not.toBe(fallback);
  },
);

it("keeps every added guidance distinct from the existing codes", () => {
  const texts = Object.values(added);
  expect(new Set(texts).size).toBe(texts.length);
  for (const existing of [
    "SEARCH_UNCONFIRMED",
    "ROW_SEARCH_UNCONFIRMED",
    "FIELD_DISABLED",
    "OPTION_UNMATCHED",
  ] as const)
    expect(texts).not.toContain(resultGuidance("", existing));
});
