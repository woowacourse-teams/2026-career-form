import { afterEach, expect, it, vi } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import { createFieldPresentation } from "./field-presentation";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function fixture() {
  document.body.innerHTML =
    '<section><h2>연락처와 주소</h2><label>이메일<input name="email"></label><label>주소<input name="address"></label></section>';
  const section = document.querySelector("section")!;
  const inputs = [...document.querySelectorAll("input")];
  section.getBoundingClientRect = () => new DOMRect(20, 180, 700, 260);
  inputs.forEach((input, index) => {
    input.getBoundingClientRect = () =>
      new DOMRect(40, 230 + index * 120, 500, 30);
    input.scrollIntoView = vi.fn();
  });
  section.scrollIntoView = vi.fn();
  const snapshot = collectFieldsSnapshot(document);
  const ids = snapshot.request.sections.flatMap((s) =>
    s.fields.map((f) => f.candidateId),
  );
  return { section, inputs, snapshot, ids };
}
it("highlights the whole section without focusing or highlighting individual fields", () => {
  const { section, inputs, snapshot, ids } = fixture();
  const p = createFieldPresentation(document);
  expect(p.showSection(snapshot.registry, ids)).toBe(true);
  const overlay = document.querySelector(
    "[data-career-form-section-highlight]",
  ) as HTMLElement;
  expect(overlay).not.toBeNull();
  expect(parseFloat(overlay.style.height)).toBeGreaterThanOrEqual(260);
  expect(inputs.every((input) => input.style.outline === "")).toBe(true);
  expect(section.scrollIntoView).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(document.body);
  p.clear();
  expect(overlay.isConnected).toBe(false);
});
it("aligns an offscreen tall section at its start, never centers a field", () => {
  const { section, inputs, snapshot, ids } = fixture();
  let top = 1300;
  section.getBoundingClientRect = () => new DOMRect(20, top, 700, 1100);
  inputs.forEach((input, index) => {
    input.getBoundingClientRect = () =>
      new DOMRect(40, top + 50 + index * 900, 500, 30);
  });
  section.scrollIntoView = vi.fn(() => {
    top = 100;
  });
  expect(
    createFieldPresentation(document).showSection(snapshot.registry, ids),
  ).toBe(true);
  expect(section.scrollIntoView).toHaveBeenCalledWith(
    expect.objectContaining({ block: "start", inline: "nearest" }),
  );
  expect(inputs[0].scrollIntoView).not.toHaveBeenCalled();
  expect(section.style.scrollMarginTop).toBe("");
});
it("cleans up group highlighting before an individual field and rejects hidden or stale groups", () => {
  const { inputs, snapshot, ids } = fixture();
  const p = createFieldPresentation(document);
  p.showSection(snapshot.registry, ids);
  p.show(snapshot.registry, ids[0]);
  expect(
    document.querySelector("[data-career-form-section-highlight]"),
  ).toBeNull();
  inputs.forEach((input) => input.remove());
  expect(p.showSection(snapshot.registry, ids)).toBe(false);
  expect(
    document.querySelector("[data-career-form-section-highlight]"),
  ).toBeNull();
});

it("ignores hidden groups and rejects a section covered by a modal", () => {
  const { section, snapshot, ids } = fixture();
  const p = createFieldPresentation(document);
  section.hidden = true;
  expect(p.showSection(snapshot.registry, ids)).toBe(false);
  section.hidden = false;
  const modal = document.createElement("div");
  document.body.append(modal);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => modal,
  });
  try {
    expect(p.showSection(snapshot.registry, ids)).toBe(false);
  } finally {
    Reflect.deleteProperty(document, "elementFromPoint");
  }
  expect(
    document.querySelector("[data-career-form-section-highlight]"),
  ).toBeNull();
});
it("tracks section bounds while scrolling and removes the overlay on clear", () => {
  const { section, snapshot, ids } = fixture();
  const p = createFieldPresentation(document);
  p.showSection(snapshot.registry, ids);
  const overlay = document.querySelector(
    "[data-career-form-section-highlight]",
  ) as HTMLElement;
  section.getBoundingClientRect = () => new DOMRect(20, 100, 700, 260);
  document.dispatchEvent(new Event("scroll"));
  expect(overlay.style.top).toBe("80px");
  p.clear();
  document.dispatchEvent(new Event("scroll"));
  expect(overlay.isConnected).toBe(false);
});

it("leaves breathing room outside the section container", () => {
  const { section, snapshot, ids } = fixture();
  const p = createFieldPresentation(document);
  p.showSection(snapshot.registry, ids);
  const overlay = document.querySelector(
    "[data-career-form-section-highlight]",
  ) as HTMLElement;
  const rect = section.getBoundingClientRect();
  expect(parseFloat(overlay.style.top)).toBeLessThanOrEqual(rect.top - 20);
  expect(parseFloat(overlay.style.height)).toBeGreaterThanOrEqual(
    rect.height + 40,
  );
  p.clear();
});

it("keeps expanded margins between adjacent section labels", () => {
  const { snapshot, ids } = fixture();
  const label = document.createElement("label");
  label.textContent = "다음 구역";
  const input = document.createElement("input");
  input.name = "next";
  label.append(input);
  document.body.append(label);
  label.getBoundingClientRect = () => new DOMRect(20, 450, 700, 50);
  input.getBoundingClientRect = () => new DOMRect(40, 470, 500, 30);
  const p = createFieldPresentation(document);
  p.showSection(snapshot.registry, ids);
  const overlay = document.querySelector(
    "[data-career-form-section-highlight]",
  ) as HTMLElement;
  expect(parseFloat(overlay.style.top) + parseFloat(overlay.style.height)).toBe(
    445,
  );
  p.clear();
});
