// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { watchMounts } from "./mounts.mjs";

afterEach(() => window.__careerFormLiveQaMounts?.disconnect());

describe("watchMounts", () => {
  it("records the mount value of every kind of control census lists", () => {
    document.body.innerHTML = "<main></main>";
    const watch = watchMounts();
    document.querySelector("main").innerHTML = `
      <input name="a" value="1"><select name="b"><option value="x" selected>x</option></select>
      <textarea name="c">t</textarea>
      <button type="button" role="combobox">학사</button>
      <div role="listbox">영어</div>
      <div role="radiogroup"><button type="button" role="radio" aria-checked="true">남성</button></div>
      <div contenteditable="true">소개</div>
      <button type="button" aria-haspopup="listbox">선택값</button>`;
    watch.flush();
    const marks = [].map.call(
      document.querySelectorAll(
        'input, select, textarea, [role="combobox"], [role="listbox"], [role="radio"], [contenteditable="true"], button[aria-haspopup]',
      ),
      (e) => e.__careerFormLiveQaMounted,
    );
    expect(marks).toEqual([
      "1",
      "x",
      "t",
      "학사",
      "영어",
      "1",
      "소개",
      "선택값",
    ]);
  });

  it("leaves controls that existed at install unmarked", () => {
    document.body.innerHTML = `<input name="a" value="1">`;
    watchMounts().flush();
    expect(document.querySelector("input").__careerFormLiveQaMounted).toBe(
      undefined,
    );
  });
});
