import { beforeEach, describe, expect, it } from "vitest";

import { isSafeStructuralClick, isSafeSurfaceCloseClick } from "./click-policy";

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

describe.each(["section", "dialog"])("confirmation cleanup in %s", (kind) => {
  function confirmation(html: string) {
    document.body.innerHTML =
      kind === "section"
        ? `<section data-scope><table><tbody><tr><td>${html}</td></tr></tbody></table></section>`
        : `<div role="dialog" data-scope><aside>${html}</aside></div>`;
    return {
      scope: document.querySelector("[data-scope]")!,
      target: document.querySelector("[data-target]")!,
    };
  }

  it.each(["확인", "confirm", "ok"])(
    "allows only opted-in bare %s",
    (label) => {
      const { scope, target } = confirmation(
        `<button type="button" data-target>${label}</button>`,
      );
      expect(isSafeSurfaceCloseClick(target, scope)).toMatchObject({
        allowed: false,
      });
      expect(
        isSafeSurfaceCloseClick(target, scope, { allowConfirmation: true }),
      ).toEqual({ allowed: true });
    },
  );

  it.each([
    '<button type="button" hidden data-target>확인</button>',
    '<div style="display:none"><button type="button" data-target>확인</button></div>',
    '<button type="button" disabled data-target>확인</button>',
    '<div aria-disabled="true"><button type="button" data-target>확인</button></div>',
    '<input type="submit" value="확인" data-target>',
    '<button type="submit" data-target>확인</button>',
    "<form><button data-target>확인</button></form>",
    '<a href="#" data-target>확인</a>',
    "<a data-target>확인</a>",
    '<button type="button" target="_blank" data-target>확인</button>',
    ...[
      "form",
      "formaction",
      "formmethod",
      "formtarget",
      "formenctype",
      "formnovalidate",
    ].map(
      (attribute) =>
        `<button type="button" ${attribute}="test" data-target>확인</button>`,
    ),
    ...["저장", "제출", "이동", "검색", "삭제", "직접입력"].map(
      (label) =>
        `<button type="button" aria-label="${label}" data-target>확인</button>`,
    ),
  ])("rejects confirmation hazard %s", (html) => {
    const { scope, target } = confirmation(html);
    expect(
      isSafeSurfaceCloseClick(target, scope, { allowConfirmation: true }),
    ).toMatchObject({ allowed: false });
  });

  it("rejects confirmation outside the owned surface", () => {
    const { scope, target } = confirmation(
      '<button type="button" data-target>확인</button>',
    );
    document.body.append(target);
    expect(
      isSafeSurfaceCloseClick(target, scope, { allowConfirmation: true }),
    ).toMatchObject({ allowed: false });
  });
});

describe("isSafeSurfaceCloseClick", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it.each(["닫기", "close", "Close", "x", "×", "✕"])(
    "allows a bare close label %s",
    (label) => {
      const { scope, target } = mount(
        `<button type="button" data-target>${label}</button>`,
      );

      expect(isSafeSurfaceCloseClick(target, scope)).toEqual({ allowed: true });
    },
  );

  it("reads a bare close label from the accessible name", () => {
    const { scope, target } = mount(
      '<button type="button" aria-label="닫기" data-target></button>',
    );

    expect(isSafeSurfaceCloseClick(target, scope)).toEqual({ allowed: true });
  });

  it.each([
    "저장",
    "제출",
    "검색",
    "지원하기",
    "삭제",
    "취소",
    "초기화",
    "확인",
    "저장 닫기",
    "닫기 저장",
    "close save",
    "submit close",
    "검색 닫기",
    "닫기 닫기",
  ])("blocks the label %s as not a bare close control", (label) => {
    const { scope, target } = mount(
      `<button type="button" data-target>${label}</button>`,
    );

    expect(isSafeSurfaceCloseClick(target, scope)).toEqual({
      allowed: false,
      reason: "forbidden-label",
    });
  });

  it("blocks a close text that is paired with a forbidden accessible name", () => {
    const { scope, target } = mount(
      '<button type="button" aria-label="저장" data-target>닫기</button>',
    );

    expect(isSafeSurfaceCloseClick(target, scope)).toEqual({
      allowed: false,
      reason: "forbidden-label",
    });
  });

  it("blocks an otherwise safe close label outside the scope", () => {
    document.body.innerHTML = `
      <div data-scope><button type="button">닫기</button></div>
      <button type="button" data-target>닫기</button>
    `;
    const scope = document.querySelector("[data-scope]")!;
    const target = document.querySelector("[data-target]")!;

    expect(isSafeSurfaceCloseClick(target, scope)).toEqual({
      allowed: false,
      reason: "outside-scope",
    });
  });

  it.each([
    [
      "hidden",
      '<button type="button" hidden data-target>닫기</button>',
      "hidden",
    ],
    [
      "disabled",
      '<button type="button" disabled data-target>닫기</button>',
      "disabled",
    ],
    [
      "submit-input",
      '<input type="submit" value="닫기" data-target />',
      "submit-input",
    ],
    [
      "implicit-submit-button",
      "<form><button data-target>닫기</button></form>",
      "implicit-submit-button",
    ],
    [
      "navigating-link",
      '<a href="/next" data-target>닫기</a>',
      "navigating-link",
    ],
    [
      "new-window-target",
      '<a href="#" target="_blank" data-target>닫기</a>',
      "new-window-target",
    ],
    [
      "formaction",
      '<button type="button" formaction="/save" data-target>닫기</button>',
      "form-override-attribute",
    ],
    [
      "form attribute",
      '<button type="button" form="other-form" data-target>닫기</button>',
      "form-override-attribute",
    ],
  ])(
    "blocks a close label with a structural hazard (%s)",
    (_name, html, reason) => {
      const { scope, target } = mount(html);

      expect(isSafeSurfaceCloseClick(target, scope)).toEqual({
        allowed: false,
        reason,
      });
    },
  );

  it("allows a type=button close control inside a form and a non-navigating close link", () => {
    const { scope, target } = mount(
      '<form><button type="button" data-target>닫기</button></form><a href="#" data-link>닫기</a>',
    );
    const link = scope.querySelector("[data-link]")!;

    expect(isSafeSurfaceCloseClick(target, scope)).toEqual({ allowed: true });
    expect(isSafeSurfaceCloseClick(link, scope)).toEqual({ allowed: true });
  });

  it("does not click, focus, or change the DOM while deciding", () => {
    const { scope, target } = mount(
      '<button type="button" data-target>닫기</button>',
    );
    let clicks = 0;
    scope.addEventListener("click", () => {
      clicks += 1;
    });
    const before = document.body.innerHTML;

    isSafeSurfaceCloseClick(target, scope);

    expect(clicks).toBe(0);
    expect(document.body.innerHTML).toBe(before);
  });
});
