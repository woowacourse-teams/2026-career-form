import { expect, it } from "vitest";
import { semanticText } from "./semantic-context";

it("keeps 등록번호 in the semantic vocabulary after the certificate label change", () => {
  expect(semanticText("등록번호")).toBe("등록번호");
  expect(semanticText("자격증 등록번호")).toBe("자격증 등록번호");
  expect(semanticText("등록번호 및 자격번호")).toContain("등록번호");
});

it("keeps enlistment and discharge date labels used by military service sections", () => {
  expect(semanticText("입대일자")).toBe("입대일자");
  expect(semanticText("전역일자")).toBe("전역일자");
  expect(semanticText("전역예정일자")).toBe("전역예정일자");
});

it("reads an inline parenthesized qualifier as part of the surrounding word", () => {
  expect(semanticText("전역(예정)일자")).toBe("전역예정일자");
  expect(semanticText("복무기간 전역(예정)일자")).toBe("복무 기간 전역예정일자");
});

it("does not match a one-syllable Korean term inside a longer Korean word", () => {
  expect(semanticText("예정")).toBeUndefined();
  expect(semanticText("예약일")).toBeUndefined();
  expect(semanticText("예 / 아니오")).toBe("예 아니오");
  expect(semanticText("성 (한글)")).toBe("성 한글");
});
