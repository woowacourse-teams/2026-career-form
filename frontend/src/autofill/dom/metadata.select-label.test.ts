import { afterEach, describe, expect, it } from "vitest";

import { labelOf } from "./metadata";

afterEach(() => {
  document.body.replaceChildren();
});

function control(selector = "select"): HTMLElement {
  return document.querySelector<HTMLElement>(selector)!;
}

describe("labelOf select labels", () => {
  it("uses the empty first option text when a select has no other label", () => {
    document.body.innerHTML =
      '<div><div><select><option value="">학력구분 선택</option><option value="1">고등학교</option><option value="2">대학교</option></select></div></div>';
    expect(labelOf(control())).toBe("학력구분 선택");
  });

  it("returns undefined instead of the option list without a placeholder option", () => {
    document.body.innerHTML =
      '<div><div><select><option value="1">고등학교</option><option value="2">대학교</option></select></div></div>';
    expect(labelOf(control())).toBeUndefined();
  });

  it("returns undefined when the empty first option has no text", () => {
    document.body.innerHTML =
      '<div><div><select><option value=""></option><option value="1">고등학교</option></select></div></div>';
    expect(labelOf(control())).toBeUndefined();
  });

  it("keeps explicit labels ahead of the placeholder option", () => {
    document.body.innerHTML =
      '<label for="kind">학력 구분</label><select id="kind"><option value="">선택</option></select>';
    expect(labelOf(control())).toBe("학력 구분");
    document.body.innerHTML =
      '<select aria-label="최종 학력"><option value="">선택</option></select>';
    expect(labelOf(control())).toBe("최종 학력");
  });

  it("keeps the textContent fallback for non-select elements", () => {
    document.body.innerHTML = "<button type='button'>학교 검색</button>";
    expect(labelOf(control("button"))).toBe("학교 검색");
  });
});

describe("labelOf untrusted ids", () => {
  it("ignores a for label that shares a NaN id with another branch", () => {
    document.body.innerHTML =
      '<div class="row"><div><label for="NaN">졸업 구분</label><select id="NaN"><option value="">선택하세요</option></select></div><div><select id="NaN"><option value="">학력구분 선택</option><option value="1">고등학교</option></select></div></div>';
    const second = document.querySelectorAll<HTMLElement>("select")[1]!;
    expect(labelOf(second)).toBe("학력구분 선택");
  });

  it("ignores aria-labelledby ids that are duplicated", () => {
    document.body.innerHTML =
      '<span id="dup">학력 구분</span><span id="dup">전공</span><input aria-labelledby="dup" placeholder="학교명 입력">';
    expect(labelOf(control("input"))).toBe("학교명 입력");
  });

  it("keeps trusted aria-labelledby and for labels", () => {
    document.body.innerHTML =
      '<span id="school-label">학교명</span><input aria-labelledby="school-label">';
    expect(labelOf(control("input"))).toBe("학교명");
    document.body.innerHTML =
      '<label for="school">학교명</label><input id="school">';
    expect(labelOf(control("input"))).toBe("학교명");
  });

  it("recovers a mismatched for label when the other controls are in hidden branches", () => {
    document.body.innerHTML =
      '<div class="field"><label for="schoolName">학교명</label><input id="schoolName2" type="text"><div hidden><input type="text"></div><div style="display:none"><select><option value="">선택</option></select></div></div>';
    expect(labelOf(control("#schoolName2"))).toBe("학교명");
  });

  it("does not recover a label whose for target sits in another branch", () => {
    document.body.innerHTML =
      '<div class="field"><label for="NaN">학교명</label><input id="NaN" type="text"><div hidden><input id="NaN" type="text"></div></div>';
    const visible = document.querySelector<HTMLElement>("input")!;
    expect(labelOf(visible)).toBeUndefined();
  });
});
