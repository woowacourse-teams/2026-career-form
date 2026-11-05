import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";

const STATES = {
  initial: { candidates: 29, controls: 34 },
  "high-school": { candidates: 43, controls: 46 },
  university: { candidates: 45, controls: 48 },
  ged: { candidates: 30, controls: 35 },
} as const;
type State = keyof typeof STATES;

const fixture = (state: State) =>
  readFileSync(
    join(
      process.cwd(),
      `fixtures/dom-snapshots/woowahan-r2605009-${state}/sanitized.html`,
    ),
    "utf8",
  ).replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, "");

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://career.woowahan.com/recruitment/R2605009/form",
  });
});
afterEach(() => document.body.replaceChildren());

function collect(state: State, mutate?: () => void) {
  document.body.innerHTML = fixture(state);
  mutate?.();
  const { request } = collectFieldsSnapshot(document);
  return request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}

describe("우아한형제들 R2605009 지원서 평가 fixture", () => {
  it.each(Object.keys(STATES) as State[])(
    "%s 화면은 정제 때 센 칸 수를 그대로 갖고 제품 수집기가 같은 후보 수를 읽는다",
    (state) => {
      const fields = collect(state);
      expect(document.querySelectorAll("input, select, textarea")).toHaveLength(
        STATES[state].controls,
      );
      expect(fields).toHaveLength(STATES[state].candidates);
      expect(fields.some((field) => field.control === "custom")).toBe(false);
    },
  );

  it("검정고시 화면은 학력 행에 구분과 합격연월만 있고 학교·전공 칸이 없다", () => {
    const labels = collect("ged").map((field) => field.displayName);
    expect(labels).toContain("합격연월 YYYYMM");
    expect(labels).not.toContain("학교명");
    expect(labels).not.toContain("주전공");
  });

  it("첫 화면은 기본정보 표시값이 입력 칸이 아니고 학력은 구분 선택 하나만 있다", () => {
    const labels = collect("initial").map((field) => field.displayName);
    expect(labels).toContain("영문 성 (Last Name)");
    expect(labels).toContain("학력필수");
    expect(labels).not.toContain("이메일");
    expect(labels).not.toContain("학교명");
  });

  it("학력 구분을 고른 화면에만 학교명과 학력별 칸이 나타난다", () => {
    const highSchool = collect("high-school").map((field) => field.displayName);
    expect(highSchool).toEqual(
      expect.arrayContaining(["학교명", "계열 (예: 문과)"]),
    );
    expect(highSchool).not.toContain("주전공");
    const university = collect("university").map((field) => field.displayName);
    expect(university).toEqual(
      expect.arrayContaining(["학교명", "주전공", "전공추가", "복수/부전공"]),
    );
    expect(university).not.toContain("계열 (예: 문과)");
  });

  it("보훈·장애 대상 선택 화면은 대상과 비대상 라디오를 칸 두 개로 읽는다", () => {
    const labels = collect("university").map((field) => field.displayName);
    expect(labels.filter((label) => label === "대상")).toHaveLength(2);
    expect(labels.filter((label) => label === "비대상")).toHaveLength(2);
    expect(labels).toEqual(
      expect.arrayContaining([
        "보훈번호를 입력하세요",
        "보훈구분",
        "장애내용",
        "장애정도",
      ]),
    );
  });

  it("변이 검사: 영문 성 라벨을 지우면 제품 수집기가 placeholder로 이름을 읽는다", () => {
    const before = collect("initial")[0]!.displayName;
    const after = collect("initial", () =>
      document.querySelector('label[for="id-1"]')!.remove(),
    )[0]!.displayName;
    expect(before).toBe("영문 성 (Last Name)");
    expect(after).toBe("예: Kim");
  });
});
