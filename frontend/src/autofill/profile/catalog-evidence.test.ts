import { afterEach, expect, it } from "vitest";
import { catalogEvidenceForElement } from "./catalog-evidence";

afterEach(() => document.body.replaceChildren());

function fixture(owner = document) {
  const root = owner.createElement("div");
  root.innerHTML =
    '<div id="choice" aria-describedby="detail">학교<span id="detail">서울 캠퍼스</span></div>';
  owner.body.append(root);
  const option = root.querySelector<HTMLElement>("#choice")!;
  const detail = root.querySelector<HTMLElement>("#detail")!;
  return { root, option, detail };
}

it("separates the explicitly associated detail from the visible option label", () => {
  const { root, option } = fixture();
  expect(catalogEvidenceForElement(option, root)).toEqual({
    label: "학교",
    detail: "서울 캠퍼스",
  });
});

it.each(["opacity: 0", "visibility: collapse"])(
  "rejects an unreadable campus description with %s",
  (style) => {
    const { root, option, detail } = fixture();
    detail.setAttribute("style", style);
    expect(catalogEvidenceForElement(option, root).detail).toBeUndefined();
  },
);

it("rejects evidence under a hidden ancestor outside the menu", () => {
  const { root, option } = fixture();
  const hidden = document.createElement("div");
  hidden.hidden = true;
  document.body.append(hidden);
  hidden.append(root);
  expect(catalogEvidenceForElement(option, root).detail).toBeUndefined();
});

it("extracts described-by evidence using an iframe's own element realm", () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const owner = frame.contentDocument;
  if (!owner) throw new Error("Missing iframe document");
  const { root, option } = fixture(owner);
  expect(catalogEvidenceForElement(option, root)).toEqual({
    label: "학교",
    detail: "서울 캠퍼스",
  });
});
