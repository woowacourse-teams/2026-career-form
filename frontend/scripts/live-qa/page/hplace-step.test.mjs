// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStep, submitStepNavigation } from "./hplace-step.mjs";

describe("Hplace no-save step navigation", () => {
  let submitted;
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="frm">
        <input type="hidden" name="resumeSn" value="11">
        <input type="hidden" name="recruitNoticeSn" value="22">
        <input type="hidden" name="step" value="2">
        <section class="writeResume" data-code="141"><input name="a"><select name="b"></select></section>
        <input name="name" value="실제이름">
      </form>`;
    submitted = [];
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(
      function () {
        submitted.push(this);
      },
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("reads the step and navigability without returning the keys", () => {
    const state = readStep();
    expect(state).toEqual({
      formPresent: true,
      step: 2,
      navigable: true,
      controls: 2,
      marker: null,
    });
    expect(JSON.stringify(state)).not.toMatch(/11|22/);
  });

  it("posts only resumeSn, recruitNoticeSn and step to writeResume", () => {
    expect(submitStepNavigation(3)).toEqual({ ok: true });
    expect(submitted).toHaveLength(1);
    const form = submitted[0];
    expect(form.method).toBe("post");
    expect(new URL(form.action).pathname).toBe(
      "/mrs2/applicant/resume/writeResume",
    );
    expect([...new FormData(form)]).toEqual([
      ["resumeSn", "11"],
      ["recruitNoticeSn", "22"],
      ["step", "3"],
    ]);
  });

  it.each([0, 5, 1.5])("refuses step %s", (step) => {
    expect(submitStepNavigation(step)).toEqual({
      ok: false,
      code: "invalid-step",
    });
    expect(submitted).toHaveLength(0);
  });

  it("refuses when the navigation keys are missing", () => {
    document.querySelector('[name="resumeSn"]').value = "0";
    expect(submitStepNavigation(1)).toEqual({
      ok: false,
      code: "navigation-keys-missing",
    });
  });
});
