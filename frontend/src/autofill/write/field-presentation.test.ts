import { afterEach, expect, it, vi } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import { createFieldPresentation } from "./field-presentation";

afterEach(() => document.body.replaceChildren());
function fixture() {
  document.body.innerHTML =
    '<label>이메일<input name="email" style="background-color:red"></label>';
  const input = document.querySelector("input")!;
  input.scrollIntoView = vi.fn();
  const snapshot = collectFieldsSnapshot(document);
  const id = snapshot.request.sections.flatMap((s) => s.fields)[0].candidateId;
  return { input, snapshot, id };
}
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
