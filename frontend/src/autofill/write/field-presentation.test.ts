import { afterEach, expect, it, vi } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import { createFieldPresentation } from "./field-presentation";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function bounds(top: number, left = 20): DOMRect {
  return {
    left,
    right: left + 200,
    top,
    bottom: top + 30,
    width: 200,
    height: 30,
  } as DOMRect;
}

function fixture() {
  document.body.innerHTML =
    '<label>이메일<input name="email" style="background-color:red"></label>';
  const input = document.querySelector("input")!;
  input.getBoundingClientRect = () => bounds(300);
  input.scrollIntoView = vi.fn();
  const snapshot = collectFieldsSnapshot(document);
  const id = snapshot.request.sections.flatMap((s) => s.fields)[0].candidateId;
  return { input, snapshot, id };
}

it("keeps the viewport still for neighboring fields that are already visible", () => {
  const { input } = fixture();
  const next = document.createElement("input");
  next.name = "phone";
  next.getBoundingClientRect = () => bounds(370);
  next.scrollIntoView = vi.fn();
  document.body.append(next);
  const snapshot = collectFieldsSnapshot(document);
  const [firstId, nextId] = snapshot.request.sections.flatMap((section) =>
    section.fields.map((field) => field.candidateId),
  );
  const presentation = createFieldPresentation(document);

  expect(presentation.show(snapshot.registry, firstId)).toBe(true);
  expect(presentation.show(snapshot.registry, nextId)).toBe(true);
  expect(input.scrollIntoView).not.toHaveBeenCalled();
  expect(next.scrollIntoView).not.toHaveBeenCalled();
  expect(input.style.backgroundColor).toBe("red");
  expect(next.style.outline).not.toBe("");
});

it("locates an offscreen field once without returning the viewport on clear", () => {
  const { input, snapshot, id } = fixture();
  let top = 1200;
  input.getBoundingClientRect = () => bounds(top);
  input.scrollIntoView = vi.fn(() => {
    top = 300;
  });
  const presentation = createFieldPresentation(document);

  expect(presentation.show(snapshot.registry, id)).toBe(true);
  expect(presentation.show(snapshot.registry, id)).toBe(true);
  presentation.clear();

  expect(input.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(top).toBe(300);
  expect(input.style.backgroundColor).toBe("red");
});

it("does not report a successful location when scrolling leaves a field offscreen", () => {
  const { input, snapshot, id } = fixture();
  input.getBoundingClientRect = () => bounds(1200);

  expect(createFieldPresentation(document).show(snapshot.registry, id)).toBe(
    false,
  );
  expect(input.style.backgroundColor).toBe("red");
});

it("still relocates a field covered by a fixed header for manual location", () => {
  const { input, snapshot, id } = fixture();
  const header = document.createElement("header");
  document.body.append(header);
  let top = 10;
  input.getBoundingClientRect = () => bounds(top);
  input.scrollIntoView = vi.fn(() => {
    top = 300;
  });
  const original = document.elementFromPoint;
  document.elementFromPoint = () => (top < 100 ? header : input);
  try {
    expect(createFieldPresentation(document).show(snapshot.registry, id)).toBe(
      true,
    );
    expect(top).toBe(300);
    expect(input.scrollIntoView).toHaveBeenCalledTimes(1);
  } finally {
    document.elementFromPoint = original;
  }
});

it("relocates a partially clipped field inside a nested scroll container", () => {
  const { input, snapshot, id } = fixture();
  const container = input.parentElement!;
  container.style.overflowY = "auto";
  container.getBoundingClientRect = () =>
    ({ top: 200, bottom: 400, left: 0, right: 500 }) as DOMRect;
  let top = 380;
  input.getBoundingClientRect = () => bounds(top);
  input.scrollIntoView = vi.fn(() => {
    top = 300;
  });

  expect(createFieldPresentation(document).show(snapshot.registry, id)).toBe(
    true,
  );
  expect(top).toBe(300);
});
it("highlights only the control and restores its original styles", () => {
  const { input, snapshot, id } = fixture();
  const presentation = createFieldPresentation(document);
  expect(presentation.show(snapshot.registry, id)).toBe(true);
  expect(input.style.backgroundColor).not.toBe("red");
  expect(document.querySelector("label")!.getAttribute("style")).toBe(null);
  expect(input.value).toBe("");
  presentation.clear();
  expect(input.getAttribute("style")).toBe("background-color: red;");
});
it("rejects removed controls instead of relocating to a similar field", () => {
  const { input, snapshot, id } = fixture();
  input.remove();
  expect(createFieldPresentation(document).show(snapshot.registry, id)).toBe(
    false,
  );
});
it("restores only owned styling and preserves concurrent page changes", () => {
  const { input, snapshot, id } = fixture();
  const presentation = createFieldPresentation(document);
  presentation.show(snapshot.registry, id);
  input.style.color = "blue";
  presentation.clear();
  expect(input.style.color).toBe("blue");
  expect(input.style.backgroundColor).toBe("red");
});

it("moves an overlapping panel below the field and restores it on clear", () => {
  const { input, snapshot, id } = fixture();
  const host = document.createElement("career-form-profile-panel");
  document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = '<div class="career-form-in-page-panel"></div>';
  const panel = root.firstElementChild as HTMLElement;
  input.getBoundingClientRect = () =>
    ({
      left: 700,
      right: 900,
      top: 300,
      bottom: 330,
      width: 200,
      height: 30,
    }) as DOMRect;
  panel.getBoundingClientRect = () =>
    ({
      left: 650,
      right: 1000,
      top: 80,
      bottom: 740,
      width: 350,
      height: 660,
    }) as DOMRect;
  const presentation = createFieldPresentation(document);
  expect(presentation.show(snapshot.registry, id)).toBe(true);
  expect(Number.parseInt(panel.style.top)).toBeGreaterThan(330);
  presentation.clear();
  expect(panel.style.top).toBe("");
  expect(panel.style.height).toBe("");
});

it("does not claim a field hidden under an unmovable overlay is visible", () => {
  const { input, snapshot, id } = fixture();
  input.getBoundingClientRect = () =>
    ({
      left: 20,
      right: 220,
      top: 300,
      bottom: 330,
      width: 200,
      height: 30,
    }) as DOMRect;
  const overlay = document.createElement("div");
  document.body.append(overlay);
  const original = document.elementFromPoint;
  document.elementFromPoint = () => overlay;
  try {
    expect(createFieldPresentation(document).show(snapshot.registry, id)).toBe(
      false,
    );
    expect(input.style.backgroundColor).toBe("red");
  } finally {
    document.elementFromPoint = original;
  }
});
