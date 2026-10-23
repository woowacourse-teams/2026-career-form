// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { clickTempSave } from "./temp-save.mjs";

const spec = { selector: "button.btnTempSave, a.btnTempSave", caption: "^임시\\s*저장$" };
const rect = (el, w) => {
  el.getBoundingClientRect = () => ({ width: w, height: w ? 20 : 0 });
};

afterEach(() => document.body.replaceChildren());

describe("clickTempSave", () => {
  it("clicks the first visible control whose caption reads 임시저장", () => {
    document.body.innerHTML = `
      <a class="btnTempSave" id="top">임시 저장</a>
      <button type="button" class="btnTempSave" id="bottom">임시 저장</button>
      <button type="button" class="btnFinalSave" id="final">최종 제출</button>`;
    rect(document.getElementById("top"), 0);
    rect(document.getElementById("bottom"), 80);
    rect(document.getElementById("final"), 80);
    const clicks = [];
    for (const id of ["top", "bottom", "final"])
      document.getElementById(id).addEventListener("click", () => clicks.push(id));
    expect(clickTempSave(spec)).toEqual({ clicked: true, caption: "임시 저장" });
    expect(clicks).toEqual(["bottom"]);
  });

  it("never clicks a control that matches the selector but not the caption", () => {
    document.body.innerHTML = `<button type="button" class="btnTempSave" id="x">최종 제출</button>`;
    rect(document.getElementById("x"), 80);
    let clicked = false;
    document.getElementById("x").addEventListener("click", () => {
      clicked = true;
    });
    expect(clickTempSave(spec)).toEqual({ clicked: false, code: "temp-save-missing" });
    expect(clicked).toBe(false);
  });

  it("reports a hidden temp-save control", () => {
    document.body.innerHTML = `<button type="button" class="btnTempSave" id="x" style="display:none">임시저장</button>`;
    expect(clickTempSave(spec)).toEqual({ clicked: false, code: "temp-save-hidden" });
  });
});
