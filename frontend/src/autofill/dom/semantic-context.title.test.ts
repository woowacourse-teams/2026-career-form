import { beforeEach, describe, expect, it } from "vitest";

import { collectSemanticContext } from "./semantic-context";

function labelsOf(html: string, generic = true) {
  document.body.innerHTML = html;
  const input = document.querySelector<HTMLElement>("input")!;
  return collectSemanticContext(input, null, { generic }).labels ?? [];
}

describe("generic title-only name cue", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("carries the title text as a label when no other name cue exists", () => {
    expect(labelsOf('<input type="text" title="우편번호" />')).toEqual([
      { source: "label", text: "우편번호" },
    ]);
  });

  it("keeps the section heading next to the title cue", () => {
    expect(
      labelsOf('<section><h3>주소</h3><div><input type="text" title="우편번호" /></div></section>'),
    ).toEqual([
      { source: "label", text: "우편번호" },
      { source: "section-heading", text: "주소" },
    ]);
  });

  it.each([
    ["label", '<label for="a">성명</label><input id="a" title="우편번호" />', "label"],
    ["aria-label", '<input aria-label="성명" title="우편번호" />', "aria-label"],
    ["aria-labelledby", '<span id="n">성명</span><input aria-labelledby="n" title="우편번호" />', "aria-labelledby"],
    ["placeholder", '<input placeholder="성명" title="우편번호" />', "placeholder"],
  ])("does not add the title when a %s cue exists", (_name, html, source) => {
    const labels = labelsOf(html);
    expect(labels).toContainEqual({ source, text: "성명" });
    expect(labels.some((label) => label.text === "우편번호")).toBe(false);
  });

  it("preserves fixed title prose and ignores an absent title", () => {
    expect(labelsOf('<input type="text" title="별도 질문" />')).toEqual([
      { source: "label", text: "별도 질문" },
    ]);
    expect(labelsOf('<input type="text" />')).toEqual([]);
  });

  it("leaves the static-adapter context path unchanged", () => {
    expect(labelsOf('<input type="text" title="우편번호" />', false)).toEqual([]);
  });

  it.each(["radio", "checkbox"])("does not turn a %s option title into a group question", (type) => {
    document.body.innerHTML = `<div><input type="${type}" title="첫 번째 선택지" /><input type="${type}" title="두 번째 선택지" /></div>`;
    const group = Array.from(document.querySelectorAll<HTMLInputElement>("input"));
    expect(collectSemanticContext(group[0]!, null, { generic: true, group }).labels ?? []).toEqual([]);
  });
});
