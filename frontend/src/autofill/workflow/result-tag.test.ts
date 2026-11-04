import { expect, it } from "vitest";
import { resultTagLabel } from "./result-tag";

it.each([
  ["기존 값과 다름", "값 다름"],
  ["선택 필요", "직접 선택"],
  ["입력 못함", "입력 못함"],
  ["입력 결과 확인", "확인 필요"],
  ["승인 필요", "직접 입력"],
])("maps the %s reason to the short tag %s", (reason, label) => {
  expect(resultTagLabel(reason)).toBe(label);
});

it.each([
  ["SEARCH_AMBIGUOUS", "직접 선택"],
  ["SEARCH_UNCONFIRMED", "직접 선택"],
  ["OPTION_UNMATCHED", "값 다름"],
  ["SEARCH_SELECTION_UNVERIFIED", "확인 필요"],
  ["FIELD_DISABLED", "입력 못함"],
] as const)(
  "lets the failure code %s refine a failed write to %s",
  (code, label) => {
    expect(resultTagLabel("입력 못함", code)).toBe(label);
  },
);

it("falls back to the review tag for an unknown reason", () => {
  expect(resultTagLabel("처음 보는 사유")).toBe("확인 필요");
  expect(resultTagLabel("")).toBe("확인 필요");
});
