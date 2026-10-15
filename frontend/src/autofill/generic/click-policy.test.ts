import { beforeEach, describe, expect, it } from "vitest";

import { isSafeStructuralClick } from "./click-policy";

function mount(html: string): { scope: Element; target: Element } {
  document.body.innerHTML = `<div data-scope>${html}</div>`;
  const scope = document.querySelector("[data-scope]")!;
  const target = scope.querySelector("[data-target]")!;
  return { scope, target };
}

describe("isSafeStructuralClick", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it('allows <button type="button">내용추가</button> inside the scope', () => {
    const { scope, target } = mount(
      '<button type="button" data-target>내용추가</button>',
    );

    expect(isSafeStructuralClick(target, scope)).toEqual({ allowed: true });
  });

  it("does not click, focus, or change the DOM while deciding", () => {
    const { scope, target } = mount(
      '<form><button data-target>추가</button></form><button type="button" data-other>내용추가</button>',
    );
    const other = scope.querySelector("[data-other]")!;
    let clicks = 0;
    scope.addEventListener("click", () => {
      clicks += 1;
    });
    const before = document.body.innerHTML;
    const focused = document.activeElement;

    isSafeStructuralClick(target, scope);
    isSafeStructuralClick(other, scope);

    expect(clicks).toBe(0);
    expect(document.activeElement).toBe(focused);
    expect(document.body.innerHTML).toBe(before);
  });

  it("blocks an otherwise safe action outside the scope", () => {
    document.body.innerHTML = `
      <div data-scope><button type="button">내용추가</button></div>
      <button type="button" data-target>내용추가</button>
    `;
    const scope = document.querySelector("[data-scope]")!;
    const target = document.querySelector("[data-target]")!;

    expect(isSafeStructuralClick(target, scope)).toEqual({
      allowed: false,
      reason: "outside-scope",
    });
  });

  it.each([
    [
      "hidden attribute",
      '<button type="button" hidden data-target>추가</button>',
    ],
    [
      "aria-hidden ancestor",
      '<div aria-hidden="true"><button type="button" data-target>추가</button></div>',
    ],
    [
      "inert ancestor",
      '<div inert><button type="button" data-target>추가</button></div>',
    ],
    [
      "display:none ancestor",
      '<div style="display: none"><button type="button" data-target>추가</button></div>',
    ],
    [
      "visibility:hidden",
      '<button type="button" style="visibility: hidden" data-target>추가</button>',
    ],
  ])("blocks an invisible action (%s)", (_name, html) => {
    const { scope, target } = mount(html);

    expect(isSafeStructuralClick(target, scope)).toEqual({
      allowed: false,
      reason: "hidden",
    });
  });

  it("blocks a disabled action", () => {
    const { scope, target } = mount(
      '<button type="button" disabled data-target>추가</button>',
    );

    expect(isSafeStructuralClick(target, scope)).toEqual({
      allowed: false,
      reason: "disabled",
    });
  });

  it.each([
    [
      "<form><button>추가</button></form>",
      "<form><button data-target>추가</button></form>",
    ],
    [
      '<form><button type="submit">추가</button></form>',
      '<form><button type="submit" data-target>추가</button></form>',
    ],
  ])("blocks a non-button-type form button %s", (_name, html) => {
    const { scope, target } = mount(html);

    expect(isSafeStructuralClick(target, scope)).toEqual({
      allowed: false,
      reason: "implicit-submit-button",
    });
  });

  it.each(["submit", "reset", "image"])("blocks input[type=%s]", (type) => {
    const { scope, target } = mount(
      `<input type="${type}" value="추가" data-target />`,
    );

    expect(isSafeStructuralClick(target, scope)).toEqual({
      allowed: false,
      reason: "submit-input",
    });
  });

  it('blocks <a href="/next">추가</a> as a navigating link', () => {
    const { scope, target } = mount('<a href="/next" data-target>추가</a>');

    expect(isSafeStructuralClick(target, scope)).toEqual({
      allowed: false,
      reason: "navigating-link",
    });
  });

  it.each(["#", "javascript:void(0)"])(
    "allows a non-navigating link href %s",
    (href) => {
      const { scope, target } = mount(
        `<a href="${href}" data-target>내용추가</a>`,
      );

      expect(isSafeStructuralClick(target, scope)).toEqual({ allowed: true });
    },
  );

  it("blocks an action that opens a new window", () => {
    const { scope, target } = mount(
      '<a href="#" target="_blank" data-target>추가</a>',
    );

    expect(isSafeStructuralClick(target, scope)).toEqual({
      allowed: false,
      reason: "new-window-target",
    });
  });

  it.each([
    [
      "formaction",
      '<button type="button" formaction="/save" data-target>추가</button>',
    ],
    [
      "form",
      '<button type="button" form="other-form" data-target>추가</button>',
    ],
  ])("blocks an action carrying a %s attribute", (_name, html) => {
    const { scope, target } = mount(html);

    expect(isSafeStructuralClick(target, scope)).toEqual({
      allowed: false,
      reason: "form-override-attribute",
    });
  });

  it.each([
    "지원하기",
    "이동",
    "초기화",
    "임시저장",
    "제출",
    "계산기",
    "재설정",
    "미리보기",
    "로그아웃",
    "취소",
    "닫기",
  ])('blocks <button type="button">%s</button> by forbidden label', (label) => {
    const { scope, target } = mount(
      `<button type="button" data-target>${label}</button>`,
    );

    expect(isSafeStructuralClick(target, scope)).toEqual({
      allowed: false,
      reason: "forbidden-label",
    });
  });

  it("reads forbidden wording from accessible names and input values", () => {
    const { scope, target } = mount(
      '<button type="button" aria-label="항목 삭제" data-target>+</button><input type="button" value="저장" data-input />',
    );
    const input = scope.querySelector("[data-input]")!;

    expect(isSafeStructuralClick(target, scope)).toEqual({
      allowed: false,
      reason: "forbidden-label",
    });
    expect(isSafeStructuralClick(input, scope)).toEqual({
      allowed: false,
      reason: "forbidden-label",
    });
  });
});
