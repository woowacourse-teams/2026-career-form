import { describe, expect, it } from "vitest";
import {
  matchOptionIndex,
  matchOptionIndexAny,
  suggestOptionIndex,
} from "./option-match";

describe("matchOptionIndex", () => {
  it("matches a normalized exact option", () => {
    expect(matchOptionIndex("가나", ["다라", "가나", "마바"])).toBe(1);
  });

  it.each([
    ["whitespace", "  가나   다 ", ["가나 다", "라마"]],
    ["case", "Grade A", ["grade a", "grade b"]],
    ["full-width", "ＡＢ급", ["ab급", "cd급"]],
  ])("ignores %s differences", (_name, value, options) => {
    expect(matchOptionIndex(value, options)).toBe(0);
  });

  it("matches the same tokens in another order or with punctuation", () => {
    expect(matchOptionIndex("가나 다라", ["다라, 가나", "마바"])).toBe(0);
  });

  it("does not match a containment-only option in the strict function", () => {
    expect(matchOptionIndex("가나", ["다라", "가나 등급", "마바"])).toBeNull();
    expect(matchOptionIndex("가나 다라 마바", ["선택", "다라 마바"])).toBeNull();
  });

  it("suggests a unique containment option", () => {
    expect(suggestOptionIndex("가나", ["다라", "가나 등급", "마바"])).toBe(1);
    expect(suggestOptionIndex("가나 다라 마바", ["선택", "다라 마바"])).toBe(1);
  });

  it("suggests nothing when two options contain the value", () => {
    expect(suggestOptionIndex("가나", ["가나 등급", "가나 단계"])).toBeNull();
  });

  it("prefers a unique exact or token-set match when suggesting", () => {
    expect(suggestOptionIndex("가나", ["가나 등급", "가나"])).toBe(1);
    expect(suggestOptionIndex("가나 다라", ["다라 가나", "가나 다라 마바"])).toBe(0);
  });

  it("suggests nothing for empty inputs", () => {
    expect(suggestOptionIndex("가나", [])).toBeNull();
    expect(suggestOptionIndex(" ", ["가나"])).toBeNull();
  });

  it("drops bracketed content only while a token remains", () => {
    expect(matchOptionIndex("가나 (참고)", ["가나", "다라"])).toBe(0);
    expect(matchOptionIndex("(가나)", ["가나", "다라"])).toBe(0);
  });

  it("returns null when two options match at the deciding tier", () => {
    expect(matchOptionIndex("가나", ["가나 등급", "가나 단계"])).toBeNull();
    expect(matchOptionIndex("가나", ["가나", " 가나 "])).toBeNull();
  });

  it("does not let a looser option override a unique exact match", () => {
    expect(matchOptionIndex("가나", ["가나 등급", "가나"])).toBe(1);
  });

  it("does not match a partial token or non-contiguous tokens", () => {
    expect(matchOptionIndex("가나", ["가나다"])).toBeNull();
    expect(matchOptionIndex("가 다", ["가 나 다"])).toBeNull();
  });

  it("returns null for an empty option list or an empty value", () => {
    expect(matchOptionIndex("가나", [])).toBeNull();
    expect(matchOptionIndex("  ", ["가나"])).toBeNull();
  });

  it("accepts any of several candidate values", () => {
    expect(matchOptionIndexAny(["x-1", "가나"], ["다라", " 가나 "])).toBe(1);
  });

  it("matches a grade option that only adds a bracketed note", () => {
    expect(matchOptionIndex("1급", ["선택", "1급 (상급)", "2급 (중급)"])).toBe(1);
  });
});
