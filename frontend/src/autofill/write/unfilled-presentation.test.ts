import { afterEach, expect, it, vi } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import { createUnfilledPresentation } from "./unfilled-presentation";

const OVERLAY = "[data-career-form-unfilled-highlight]";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function fixture() {
  document.body.innerHTML =
    '<section><label>이메일<input name="email"></label><label>주소<input name="address"></label><label>메모<textarea name="memo"></textarea></label><input type="hidden" name="token"></section>';
  const inputs = [...document.querySelectorAll<HTMLElement>("input,textarea")];
  inputs.forEach((input, index) => {
    input.getBoundingClientRect = () =>
      new DOMRect(40, 100 + index * 80, 500, 30);
  });
  const snapshot = collectFieldsSnapshot(document);
  const idOf = (name: string) =>
    snapshot.request.sections
      .flatMap((section) => section.fields)
      .find((field) => field.domName === name)!.candidateId;
  const field = (name: string) =>
    document.querySelector<HTMLInputElement>(`[name=${name}]`)!;
  return { snapshot, idOf, field };
}

it("draws one non-interactive red overlay per listed visible field and leaves the site untouched", () => {
  const { snapshot, idOf } = fixture();
  const before = document.body.innerHTML;
  const p = createUnfilledPresentation(document);
  p.mark(snapshot.registry, [idOf("email"), idOf("memo")]);
  const overlays = [...document.querySelectorAll<HTMLElement>(OVERLAY)];
  expect(overlays).toHaveLength(2);
  for (const overlay of overlays) {
    expect(overlay.style.pointerEvents).toBe("none");
    expect(overlay.style.border).toMatch(
      /^2px solid (#d70015|rgb\(215, 0, 21\))$/,
    );
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
  }
  expect(overlays.map((overlay) => overlay.style.top)).toEqual([
    "100px",
    "260px",
  ]);
  const site = document.body.cloneNode(true) as HTMLElement;
  site.querySelectorAll(OVERLAY).forEach((node) => node.remove());
  expect(site.innerHTML).toBe(before);
  p.clear();
});

it("skips hidden fields, unknown ids and fields that are not rendered", () => {
  const { snapshot, idOf, field } = fixture();
  field("address").hidden = true;
  const p = createUnfilledPresentation(document);
  p.mark(snapshot.registry, [idOf("address"), "missing-id", idOf("email")]);
  expect(document.querySelectorAll(OVERLAY)).toHaveLength(1);
  p.clear();
});

it("removes only the typed field's overlay once its value is non-empty", () => {
  const { snapshot, idOf, field } = fixture();
  const p = createUnfilledPresentation(document);
  p.mark(snapshot.registry, [idOf("email"), idOf("address")]);
  field("email").dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.querySelectorAll(OVERLAY)).toHaveLength(2);
  field("email").value = "a@example.test";
  field("email").dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.querySelectorAll(OVERLAY)).toHaveLength(1);
  field("address").value = "x";
  field("address").dispatchEvent(new Event("change", { bubbles: true }));
  expect(document.querySelectorAll(OVERLAY)).toHaveLength(0);
  p.clear();
});

it("does not bring back a border the user cleared when marked again", () => {
  const { snapshot, idOf, field } = fixture();
  const p = createUnfilledPresentation(document);
  const ids = [idOf("email"), idOf("address")];
  p.mark(snapshot.registry, ids);
  field("email").value = "a@example.test";
  field("email").dispatchEvent(new Event("input", { bubbles: true }));
  p.mark(snapshot.registry, ids);
  expect(document.querySelectorAll(OVERLAY)).toHaveLength(1);
  p.clear();
  p.mark(snapshot.registry, ids);
  expect(document.querySelectorAll(OVERLAY)).toHaveLength(2);
  p.clear();
});

it("follows the field on scroll and removes everything on clear", () => {
  const { snapshot, idOf, field } = fixture();
  const p = createUnfilledPresentation(document);
  p.mark(snapshot.registry, [idOf("email")]);
  const overlay = document.querySelector<HTMLElement>(OVERLAY)!;
  field("email").getBoundingClientRect = () => new DOMRect(40, 20, 500, 30);
  document.dispatchEvent(new Event("scroll"));
  expect(overlay.style.top).toBe("20px");
  p.clear();
  expect(document.querySelectorAll(OVERLAY)).toHaveLength(0);
  field("email").value = "z";
  field("email").dispatchEvent(new Event("input", { bubbles: true }));
  document.dispatchEvent(new Event("scroll"));
  expect(document.querySelectorAll(OVERLAY)).toHaveLength(0);
});

it("removes every overlay when the page navigates", () => {
  const { snapshot, idOf } = fixture();
  const p = createUnfilledPresentation(document);
  p.mark(snapshot.registry, [idOf("email"), idOf("address")]);
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(document.querySelectorAll(OVERLAY)).toHaveLength(0);
  p.mark(snapshot.registry, [idOf("email")]);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  expect(document.querySelectorAll(OVERLAY)).toHaveLength(0);
});
