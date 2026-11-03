import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";

// NHN Careers 프리세일즈 공고 지원서 1단계 최초 화면. 드롭다운은 읽기 전용 칸 + 목록 버튼이라 선택지가 DOM에 없다.
const fixture = () =>
  readFileSync(
    join(
      process.cwd(),
      "fixtures/dom-snapshots/nhn-presales-initial/sanitized.html",
    ),
    "utf8",
  ).replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, "");

afterEach(() => document.body.replaceChildren());

function collect(mutate?: () => void) {
  document.body.innerHTML = fixture();
  mutate?.();
  const { request } = collectFieldsSnapshot(document);
  return request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}

describe("NHN Careers 프리세일즈 지원서 평가 fixture", () => {
  it("정제 때 센 칸 수를 그대로 갖고 제품 수집기가 파일 첨부를 뺀 후보를 읽는다", () => {
    const fields = collect();
    expect(document.querySelectorAll("input, select, textarea")).toHaveLength(
      54,
    );
    expect(document.querySelectorAll("option")).toHaveLength(0);
    expect(fields).toHaveLength(52);
  });

  it("학력·경력·자격·어학 칸을 placeholder 이름으로 읽는다", () => {
    const labels = collect().map((field) => field.displayName);
    expect(labels).toEqual(
      expect.arrayContaining([
        "학교명",
        "입학일",
        "회사명",
        "자격명",
        "시험명",
      ]),
    );
  });

  it("학교명 placeholder를 지우면 그 칸의 이름이 사라진다", () => {
    const labels = collect(() =>
      document
        .querySelector('[placeholder="학교명"]')
        ?.removeAttribute("placeholder"),
    ).map((field) => field.displayName);
    expect(labels).not.toContain("학교명");
  });
});
