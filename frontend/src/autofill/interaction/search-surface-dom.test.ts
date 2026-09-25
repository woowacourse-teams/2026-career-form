import { afterEach, describe, expect, it } from "vitest";
import {
  accessibleDocument,
  activeModal,
  elements,
  interactive,
  label,
  linked,
  roots,
  safeActivation,
  shown,
} from "./search-surface-dom";

function button(label = "검색"): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.textContent = label;
  document.body.append(item);
  return item;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("search surface DOM safety", () => {
  it("resolves explicit controls and rejects unrelated roots", () => {
    const target = document.createElement("div");
    target.id = "surface";
    document.body.append(target);
    const control = button();
    control.setAttribute("aria-controls", "surface");
    expect(linked(control, target)).toBe(true);
    expect(linked(control, document.createElement("div"))).toBe(false);
    expect(roots(document, control)).toEqual([document]);
  });

  it("filters hidden, closed dialog, and unopened popover surfaces", () => {
    const hidden = document.createElement("div");
    hidden.hidden = true;
    const dialog = document.createElement("dialog");
    const popover = document.createElement("div");
    popover.setAttribute("popover", "auto");
    document.body.append(hidden, dialog, popover);
    expect(shown(hidden)).toBe(false);
    expect(shown(dialog)).toBe(false);
    expect(shown(popover)).toBe(false);
  });

  it("accepts visible elements and honors inert and aria-disabled ancestors", () => {
    const good = button();
    expect(shown(good)).toBe(true);
    expect(interactive(good)).toBe(true);
    good.parentElement?.setAttribute("inert", "");
    expect(interactive(good)).toBe(false);
  });

  it("detects one modal and rejects competing modals", () => {
    const modal = document.createElement("dialog");
    modal.setAttribute("open", "");
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);
    expect(activeModal(document)).toBeUndefined();
    const second = modal.cloneNode(true);
    document.body.append(second);
    expect(activeModal(document)).toBeUndefined();
  });

  it("allows safe buttons, options, and empty or hash anchors only", () => {
    const safeButton = button("검색");
    expect(safeActivation(safeButton)).toBe(false);
    const submit = button();
    submit.type = "submit";
    expect(safeActivation(submit)).toBe(false);
    const option = document.createElement("div");
    option.setAttribute("role", "option");
    document.body.append(option);
    expect(safeActivation(option)).toBe(false);
    const nested = document.createElement("a");
    nested.href = "/next";
    option.append(nested);
    expect(safeActivation(option)).toBe(false);
    const anchor = document.createElement("a");
    anchor.href = "#";
    anchor.textContent = "검색";
    document.body.append(anchor);
    expect(safeActivation(anchor)).toBe(false);
  });

  it("uses value as a label only for action input types", () => {
    for (const type of ["button", "submit", "reset"]) {
      const input = document.createElement("input");
      input.type = type;
      input.value = "검색";
      expect(label(input)).toBe("검색");
    }
    for (const type of ["text", "password", "hidden"]) {
      const input = document.createElement("input");
      input.type = type;
      input.value = "검색";
      expect(label(input)).toBe("");
    }
    const unrelated = document.createElement("div");
    (unrelated as HTMLDivElement & { value: string }).value = "검색";
    expect(label(unrelated)).toBe("");
  });

  it("rejects risky targets, downloads, and non-search links", () => {
    const target = button("저장");
    expect(safeActivation(target)).toBe(false);
    const download = document.createElement("a");
    download.href = "#";
    download.download = "file";
    document.body.append(download);
    expect(safeActivation(download)).toBe(false);
    const external = document.createElement("a");
    external.href = "/next";
    document.body.append(external);
    expect(safeActivation(external)).toBe(false);
  });

  it("accepts same-origin srcdoc and rejects blank, sandboxed, and cross-origin frames", () => {
    const frame = document.createElement("iframe");
    const frameDocument = document.implementation.createHTMLDocument("popup");
    Object.defineProperty(frameDocument, "defaultView", { value: window });
    Object.defineProperty(frameDocument, "URL", { value: "about:srcdoc" });
    Object.defineProperty(frame, "contentDocument", {
      configurable: true,
      get: () => frameDocument,
    });
    document.body.append(frame);
    expect(accessibleDocument(frame)).toBe(frameDocument);
    const sandboxed = document.createElement("iframe");
    sandboxed.setAttribute("sandbox", "");
    document.body.append(sandboxed);
    expect(accessibleDocument(sandboxed)).toBeUndefined();
    const blank = document.createElement("iframe");
    document.body.append(blank);
    expect(accessibleDocument(blank)).toBeUndefined();
  });

  it("caps large DOM scans instead of expanding the decision surface", () => {
    const root = document.createElement("div");
    root.innerHTML = Array.from(
      { length: 513 },
      () => "<button></button>",
    ).join("");
    document.body.append(root);
    expect(() => elements(root, "button")).toThrowError(
      expect.objectContaining({ reason: "decision_budget_exhausted" }),
    );
  });
});
