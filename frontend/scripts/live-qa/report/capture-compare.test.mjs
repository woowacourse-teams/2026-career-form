// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildCaptureInput,
  compareCaptures,
  isPlaceholder,
  normalizeValue,
  sameValue,
} from "./capture-compare.mjs";

const row = (i, extra = {}) => ({
  i,
  section: "기본",
  label: `칸${i}`,
  type: "text",
  category: "AUTOFILLABLE",
  expected: `값${i}`,
  written: `값${i}`,
  changed: true,
  ...extra,
});

describe("sameValue and isPlaceholder", () => {
  it("accepts a date the site shows without the day and a select prompt as empty", () => {
    expect(sameValue("2007. 03", "2007-03-01")).toBe(true);
    expect(sameValue("2007. 04", "2007-03-01")).toBe(false);
    expect(sameValue("서울 중구", "서울특별시 중구")).toBe(false);
    expect(isPlaceholder("학과계열을 선택하세요.")).toBe(true);
    expect(isPlaceholder("선택")).toBe(true);
    expect(isPlaceholder("졸업")).toBe(false);
  });

  it("counts a placeholder as empty and a short date as the same value when comparing", () => {
    const joined = {
      rows: [row(1, { expected: "2007-03-01" }), row(2, { expected: "기타" })],
    };
    const verdict = { items: [{ ref: "i=2 x", kind: "MISSED" }] };
    const result = compareCaptures({
      joined,
      verdict,
      captureVerdict: [
        { i: 1, seen: "2007. 03" },
        { i: 2, seen: "학과계열을 선택하세요." },
      ],
    });
    expect(result).toMatchObject({ compared: 2, agreed: 2, disagreements: [] });
  });
});

describe("normalizeValue", () => {
  it("drops spaces, hyphens, dots and slashes, lowercases, and keeps only the display text", () => {
    expect(normalizeValue(" 010-1234-5678 ")).toBe("01012345678");
    expect(normalizeValue("2020.03/01")).toBe("20200301");
    expect(normalizeValue("ABC Def")).toBe("abcdef");
    expect(normalizeValue("K01|경기도")).toBe("경기도");
    expect(normalizeValue("남성 [v=M]")).toBe("남성");
    expect(normalizeValue("a|b|c")).toBe("c");
    expect(normalizeValue("")).toBe("");
  });
});

describe("buildCaptureInput", () => {
  it("lists captures with absolute files and only the expected values of AUTOFILLABLE rows", () => {
    const joined = {
      label: "sk-a",
      rows: [
        row(0),
        row(1, { category: "NO_PROFILE_KEY", expected: "" }),
        row(2, { written: "다른값", changed: false, beforeValue: "비밀" }),
      ],
    };
    const captures = [
      {
        file: "sk-a.captures/01.png",
        name: "기본",
        frame: "main",
        controls: [0, 1, 2],
      },
      {
        file: "sk-a.captures/02.png",
        name: "step 2",
        frame: "main",
        controls: [],
      },
    ];
    const input = buildCaptureInput({ joined, captures, baseDir: "/out" });
    expect(input).toEqual({
      label: "sk-a",
      captures: [
        {
          file: "/out/sk-a.captures/01.png",
          name: "기본",
          controls: [0, 1, 2],
        },
        { file: "/out/sk-a.captures/02.png", name: "step 2", controls: [] },
      ],
      expected: [
        { i: 0, section: "기본", label: "칸0", type: "text", expected: "값0" },
        { i: 2, section: "기본", label: "칸2", type: "text", expected: "값2" },
      ],
    });
    expect(JSON.stringify(input)).not.toMatch(
      /written|changed|beforeValue|비밀|다른값/,
    );
  });
});

describe("compareCaptures", () => {
  const joined = {
    rows: [
      row(0), // CORRECT by absence
      row(1), // WRONG in items
      row(2), // MISSED in items
      row(3), // UNVERIFIABLE: excluded
      row(4), // EXPECTATION_ERROR: excluded
      row(5, { category: "NO_PROFILE_KEY" }), // not compared
      row(6), // CORRECT, capture not visible
      row(7), // CORRECT, missing from the capture verdict
      row(8, { type: "select", expected: "K01|경기도" }),
      row(9, { type: "radio", expected: "남성 [v=M]" }),
    ],
  };
  const verdict = {
    items: [
      { ref: "i=1 b", kind: "WRONG" },
      { ref: "i=2 c", kind: "MISSED" },
      { ref: "i=3 d", kind: "UNVERIFIABLE" },
      { ref: "i=4 e", kind: "EXPECTATION_ERROR" },
      { ref: "new x", kind: "EXTRA_CORRECT" },
    ],
  };

  it("agrees when the capture shows what the DOM verdict implies", () => {
    const captureVerdict = [
      { i: 0, seen: " 값 0" },
      { i: 1, seen: "엉뚱" },
      { i: 2, seen: "" },
      { i: 3, seen: "값3" },
      { i: 4, seen: "" },
      { i: 5, seen: "뭔가" },
      { i: 6, seen: null },
      { i: 8, seen: "경기도" },
      { i: 9, seen: "남성" },
    ];
    expect(compareCaptures({ joined, verdict, captureVerdict })).toEqual({
      compared: 5,
      agreed: 5,
      notVisible: 2,
      excluded: 2,
      disagreements: [],
    });
  });

  it("lists every disagreement with the DOM kind, the seen and the expected value", () => {
    const captureVerdict = [
      { i: 0, seen: "" },
      { i: 1, seen: "값1" },
      { i: 2, seen: "값2" },
      { i: 6, seen: "다름" },
      { i: 7, seen: "값7" },
      { i: 8, seen: "" },
      { i: 9, seen: "여성" },
    ];
    const result = compareCaptures({ joined, verdict, captureVerdict });
    expect(result).toMatchObject({
      compared: 7,
      agreed: 1,
      notVisible: 0,
      excluded: 2,
    });
    expect(result.disagreements).toEqual([
      { i: 0, dom: "CORRECT", seen: "", expected: "값0" },
      { i: 1, dom: "WRONG", seen: "값1", expected: "값1" },
      { i: 2, dom: "MISSED", seen: "값2", expected: "값2" },
      { i: 6, dom: "CORRECT", seen: "다름", expected: "값6" },
      { i: 8, dom: "CORRECT", seen: "", expected: "K01|경기도" },
      { i: 9, dom: "CORRECT", seen: "여성", expected: "남성 [v=M]" },
    ]);
  });

  it("treats WRONG as agreeing only with a non-empty, different value", () => {
    const only = { rows: [row(1)] };
    const v = { items: [{ ref: "i=1 b", kind: "WRONG" }] };
    const run = (seen) =>
      compareCaptures({
        joined: only,
        verdict: v,
        captureVerdict: [{ i: 1, seen }],
      }).agreed;
    expect(run("other")).toBe(1);
    expect(run("값1")).toBe(0);
    expect(run("")).toBe(0);
  });
});
