import { afterEach, expect, it } from "vitest";
import { greetingImportFixture } from "../../research/greeting-import-probe.test-fixtures";
import { presentImportSources } from "./source-presentation";
let cleanup = () => {};
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  window.scrollTo(0, 0);
});
it("scrolls a real offscreen source into view and draws a non-interactive border without altering the form", () => {
  document.body.innerHTML =
    '<div style="height:1800px"></div>' +
    greetingImportFixture() +
    '<div style="height:1800px"></div>';
  const input = document.querySelector<HTMLInputElement>(
    '[name="basicInformation.name"]',
  )!;
  const form = document.querySelector("form")!;
  const before = form.outerHTML;
  const events: string[] = [];
  for (const type of ["input", "change", "click", "submit", "focusin"])
    form.addEventListener(type, () => events.push(type));
  cleanup = presentImportSources(document, ["basicInformation.name"]);
  const rect = input.getBoundingClientRect();
  expect(rect.top).toBeGreaterThanOrEqual(0);
  expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
  const overlay = document.querySelector<HTMLElement>(
    "[data-career-form-import-highlight]",
  )!;
  expect(getComputedStyle(overlay).pointerEvents).toBe("none");
  expect(getComputedStyle(overlay).borderTopWidth).toBe("2px");
  expect(overlay.getBoundingClientRect().left).toBe(rect.left);
  expect(document.elementFromPoint(rect.left + 5, rect.top + 5)).toBe(input);
  expect(form.outerHTML).toBe(before);
  expect(events).toEqual([]);
  cleanup();
  expect(overlay.isConnected).toBe(false);
});

it("keeps the page still for a visible source when asked for the nearest position", () => {
  document.body.innerHTML =
    '<div style="height:200px"></div>' +
    greetingImportFixture() +
    '<div style="height:3000px"></div>';
  window.scrollTo(0, 100);
  const before = window.scrollY;
  cleanup = presentImportSources(document, ["basicInformation.name"], {
    scroll: "nearest",
  });
  expect(window.scrollY).toBe(before);
  expect(
    document.querySelectorAll("[data-career-form-import-highlight]"),
  ).toHaveLength(1);
});
