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
it("highlights each written field without focusing or changing its original styles", () => {
  const { section, inputs, snapshot, ids } = fixture();
  const p = createFieldPresentation(document);
  expect(p.showSection(snapshot.registry, ids)).toBe(true);
  const overlay = document.querySelector(
    "[data-career-form-section-highlight]",
  ) as HTMLElement;
  expect(overlay).not.toBeNull();
  expect(parseFloat(overlay.style.height)).toBe(30);
  expect(
    document.querySelectorAll("[data-career-form-section-highlight]"),
  ).toHaveLength(2);
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
it("tracks each field while scrolling and removes every overlay on clear", () => {
  const { inputs, snapshot, ids } = fixture();
  const p = createFieldPresentation(document);
  p.showSection(snapshot.registry, ids);
  const overlay = document.querySelector(
    "[data-career-form-section-highlight]",
  ) as HTMLElement;
  inputs[0].getBoundingClientRect = () => new DOMRect(40, 100, 500, 30);
  document.dispatchEvent(new Event("scroll"));
  expect(overlay.style.top).toBe("100px");
  p.clear();
  document.dispatchEvent(new Event("scroll"));
  expect(overlay.isConnected).toBe(false);
});

it("centers a short section and keeps a repeated click stationary", () => {
  const { section, inputs, snapshot, ids } = fixture();
  let top = 1300;
  section.getBoundingClientRect = () => new DOMRect(20, top, 700, 260);
  inputs.forEach((input, index) => {
    input.getBoundingClientRect = () =>
      new DOMRect(40, top + 50 + index * 120, 500, 30);
  });
  section.scrollIntoView = vi.fn(() => {
    top = parseFloat(section.style.scrollMarginTop);
  });
  const p = createFieldPresentation(document);
  expect(p.showSection(snapshot.registry, ids)).toBe(true);
  expect(section.getBoundingClientRect().top + 130).toBe(
    window.innerHeight / 2,
  );
  p.showSection(snapshot.registry, ids);
  expect(section.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(section.style.scrollMarginTop).toBe("");
  p.clear();
});
it("places the beginning of a tall section a quarter down the viewport", () => {
  const { section, inputs, snapshot, ids } = fixture();
  let top = 1300;
  section.getBoundingClientRect = () => new DOMRect(20, top, 700, 1100);
  inputs.forEach((input, index) => {
    input.getBoundingClientRect = () =>
      new DOMRect(40, top + 50 + index * 900, 500, 30);
  });
  section.scrollIntoView = vi.fn(() => {
    top = parseFloat(section.style.scrollMarginTop);
  });
  const p = createFieldPresentation(document);
  expect(p.showSection(snapshot.registry, ids)).toBe(true);
  expect(section.getBoundingClientRect().top - 20).toBe(
    window.innerHeight * 0.25,
  );
  expect(inputs[0].scrollIntoView).not.toHaveBeenCalled();
  p.clear();
});

it("outlines only the written field and leaves the title and untouched controls outside", () => {
  const { section, snapshot, ids } = fixture();
  section.getBoundingClientRect = () => new DOMRect(20, 100, 700, 550);
  const p = createFieldPresentation(document);
  expect(p.showSection(snapshot.registry, [ids[0]])).toBe(true);
  const overlay = document.querySelector<HTMLElement>(
    "[data-career-form-section-highlight]",
  )!;
  expect(parseFloat(overlay.style.height)).toBe(30);
  expect(
    document.querySelectorAll("[data-career-form-section-highlight]"),
  ).toHaveLength(1);
  p.clear();
});

it("locates recorded address controls even when the final scan has no corresponding candidate", () => {
  const { inputs, snapshot } = fixture();
  const p = createFieldPresentation(document);
  expect(p.showSection(snapshot.registry, [], inputs)).toBe(true);
  p.clear();
  inputs.forEach((input) => input.remove());
  expect(p.showSection(snapshot.registry, [], inputs)).toBe(false);
});

it("outlines the selected military control without enclosing unfilled dependencies or veteran controls", () => {
  document.body.innerHTML = `<article id="etc" class="field-form-apply"><div class="field"><h3>병역</h3><input id="milCd" type="button"></div><div class="field"><label>복무 기간<input id="milStartDt"></label></div><div class="field"><h3>보훈</h3><input id="branchYn" type="button"></div></article>`;
  const controls = [...document.querySelectorAll<HTMLInputElement>("input")];
  controls.forEach((control, index) => {
    control.getBoundingClientRect = () =>
      new DOMRect(40, 180 + index * 180, 500, 30);
    control.closest<HTMLElement>(".field")!.getBoundingClientRect = () =>
      new DOMRect(20, 130 + index * 180, 600, 130);
  });
  const snapshot = collectFieldsSnapshot(document);
  const p = createFieldPresentation(document);
  expect(p.showSection(snapshot.registry, [], [controls[0]])).toBe(true);
  const overlay = document.querySelector<HTMLElement>(
    "[data-career-form-section-highlight]",
  )!;
  expect(parseFloat(overlay.style.top)).toBe(180);
  expect(parseFloat(overlay.style.height)).toBe(30);
  p.clear();
});

it("can present a tall section whose only written control remains below the viewport", () => {
  const { section, inputs, snapshot, ids } = fixture();
  section.getBoundingClientRect = () => new DOMRect(20, 180, 700, 1400);
  inputs.forEach((input) => {
    input.getBoundingClientRect = () => new DOMRect(40, 1300, 500, 30);
  });
  const p = createFieldPresentation(document);
  expect(p.showSection(snapshot.registry, [ids[1]])).toBe(true);
  p.clear();
});

it("draws separate simultaneous outlines only around the written fields", () => {
  const { inputs, snapshot, ids } = fixture();
  const p = createFieldPresentation(document);
  expect(p.showSection(snapshot.registry, ids)).toBe(true);
  const outlines = [
    ...document.querySelectorAll<HTMLElement>(
      "[data-career-form-section-highlight]",
    ),
  ];
  expect(outlines).toHaveLength(2);
  outlines.forEach((outline, index) => {
    const field = inputs[index].getBoundingClientRect();
    expect(parseFloat(outline.style.top)).toBe(field.top);
    expect(parseFloat(outline.style.height)).toBe(field.height);
  });
  p.showSection(snapshot.registry, [ids[0]]);
  expect(
    document.querySelectorAll("[data-career-form-section-highlight]"),
  ).toHaveLength(1);
  p.clear();
  expect(
    document.querySelectorAll("[data-career-form-section-highlight]"),
  ).toHaveLength(0);
});

it("outlines text controls only, excluding buttons and radio labels", () => {
  const { snapshot, inputs } = fixture();
  const button = document.createElement("button");
  const radio = document.createElement("input");
  radio.type = "radio";
  document.body.append(button, radio);
  [button, radio].forEach((element) => {
    element.getBoundingClientRect = () => new DOMRect(40, 400, 40, 30);
  });
  const p = createFieldPresentation(document);
  p.showSection(snapshot.registry, [], [inputs[0], button, radio]);
  expect(
    document.querySelectorAll("[data-career-form-section-highlight]"),
  ).toHaveLength(1);
  radio.checked = true;
  p.showSection(snapshot.registry, [], [inputs[0], button, radio]);
  expect(
    document.querySelectorAll("[data-career-form-section-highlight]"),
  ).toHaveLength(1);
  p.clear();
});
