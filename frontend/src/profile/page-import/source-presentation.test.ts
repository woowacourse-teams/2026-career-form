import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { greetingImportFixture } from "../../research/greeting-import-probe.test-fixtures";
import { presentImportSources } from "./source-presentation";
import { usePolicyFixture } from "../../test/fixtures/execution-policy";

usePolicyFixture("greeting");
let cleanup = () => {};
beforeEach(() => {
  document.body.innerHTML = greetingImportFixture();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(20, 200, 300, 40),
  );
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const overlays = () =>
  document.querySelectorAll<HTMLElement>("[data-career-form-import-highlight]");
it("reveals the original control without changing its value, styles, focus or form events", () => {
  const input = document.querySelector<HTMLInputElement>(
    '[name="basicInformation.name"]',
  )!;
  const before = input.outerHTML;
  const events: string[] = [];
  for (const type of ["input", "change", "click", "submit", "focus"])
    input.addEventListener(type, () => events.push(type));
  input.scrollIntoView = vi.fn();
  cleanup = presentImportSources(document, ["basicInformation.name"]);
  expect(overlays()).toHaveLength(1);
  expect(overlays()[0].style.pointerEvents).toBe("none");
  expect(input.scrollIntoView).toHaveBeenCalledWith(
    expect.objectContaining({ block: "center" }),
  );
  expect(input.outerHTML).toBe(before);
  expect(document.activeElement).toBe(document.body);
  expect(events).toEqual([]);
  cleanup();
  expect(overlays()).toHaveLength(0);
  document.dispatchEvent(new Event("scroll"));
  expect(overlays()).toHaveLength(0);
});
it("skips ambiguous, hidden and missing controls while revealing a valid sibling", () => {
  const email = document.querySelector('[name="basicInformation.email"]')!;
  email.after(email.cloneNode(true));
  document
    .querySelector('[name="basicInformation.name"]')!
    .setAttribute("hidden", "");
  cleanup = presentImportSources(document, [
    "basicInformation.email",
    "basicInformation.name",
    "missing",
    "basicInformation.phoneNumber.nationalNumber",
  ]);
  expect(overlays()).toHaveLength(1);
});
it("resolves a synthetic university radio source using the reader's row identity", () => {
  document
    .querySelector('[data-scope="accordion"][data-part="item"]')!
    .insertAdjacentHTML(
      "beforeend",
      '<div data-scope="field" data-part="root"><label>입학구분</label><div data-scope="toggle-group" data-part="root" role="radiogroup"><button role="radio" data-scope="toggle-group" data-part="item" aria-checked="true">입학</button><button role="radio" data-scope="toggle-group" data-part="item" aria-checked="false">편입</button></div></div>',
    );
  cleanup = presentImportSources(document, [
    "educationalBackground.universities.1.admissionType",
  ]);
  expect(overlays()).toHaveLength(1);
});
it("removes highlighting when its source is detached", () => {
  cleanup = presentImportSources(document, ["basicInformation.name"]);
  document.querySelector('[name="basicInformation.name"]')!.remove();
  document.dispatchEvent(new Event("scroll"));
  expect(overlays()).toHaveLength(0);
  cleanup();
  window.dispatchEvent(new Event("resize"));
  expect(overlays()).toHaveLength(0);
});
