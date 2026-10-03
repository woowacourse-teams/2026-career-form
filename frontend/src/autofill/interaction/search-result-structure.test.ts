import { afterEach, describe, expect, it } from "vitest";
import { resultActivation } from "./search-result-structure";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("structural activation evidence", () => {
  it.each([
    '<a href="https://other.test/"><button type="button">선택</button></a>',
    '<button type="submit"><span onclick="void 0">선택</span></button>',
    '<label for="other"><span onclick="void 0">선택</span></label><input id="other" type="checkbox">',
  ])("rejects activation nested in another native action: %s", (markup) => {
    document.body.innerHTML = markup;
    const action =
      document.querySelector<HTMLElement>("span") ??
      document.querySelector<HTMLElement>("button")!;
    expect(resultActivation(action)).toBe("none");
  });
  it.each([
    ["<div>선택</div>", "none"],
    ['<div role="button">선택</div>', "none"],
    ['<div tabindex="0" onkeydown="void 0">선택</div>', "keyboard"],
    ['<li onclick="void 0">선택</li>', "inline-click"],
    ['<a href="#" onclick="void 0">선택</a>', "native"],
    ['<button type="button">선택</button>', "native"],
    ['<button type="submit">선택</button>', "none"],
    ['<div onclick="void 0">제출</div>', "none"],
    ['<span onclick="void 0" aria-disabled="true">선택</span>', "none"],
  ])("requires a separate mechanical affordance: %s", (markup, activation) => {
    document.body.innerHTML = markup;
    expect(
      resultActivation(document.body.firstElementChild as HTMLElement),
    ).toBe(activation);
  });
});
