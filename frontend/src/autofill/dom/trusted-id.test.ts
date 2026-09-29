import { afterEach, describe, expect, it } from "vitest";

import { isTrustedId, trustedLabels } from "./trusted-id";

afterEach(() => {
  document.body.replaceChildren();
});

describe("isTrustedId", () => {
  it("accepts a non-empty id that is unique in the root", () => {
    document.body.innerHTML = '<input id="school-name">';
    expect(isTrustedId(document, "school-name")).toBe(true);
  });

  it.each(["", "NaN", "nan", "undefined", "null", "NULL"])(
    "rejects the placeholder id %j",
    (id) => {
      document.body.innerHTML = `<input id="${id}">`;
      expect(isTrustedId(document, id)).toBe(false);
    },
  );

  it("rejects duplicated and missing ids", () => {
    document.body.innerHTML = '<input id="row"><input id="row">';
    expect(isTrustedId(document, "row")).toBe(false);
    expect(isTrustedId(document, "absent")).toBe(false);
  });

  it("escapes ids that are not valid selectors", () => {
    document.body.innerHTML = '<input id="a&quot;]b">';
    expect(isTrustedId(document, 'a"]b')).toBe(true);
  });

  it("checks uniqueness inside a shadow root", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = '<input id="inner">';
    document.body.insertAdjacentHTML("beforeend", '<input id="inner">');
    expect(isTrustedId(shadow, "inner")).toBe(true);
    expect(isTrustedId(document, "inner")).toBe(true);
  });
});

describe("trustedLabels", () => {
  it("keeps a wrapping label and a for label with a trusted id", () => {
    document.body.innerHTML =
      '<label for="school">학교명</label><label>학교 <input id="school"></label>';
    const control = document.querySelector<HTMLInputElement>("#school")!;
    expect(trustedLabels(control).map((label) => label.textContent)).toEqual([
      "학교명",
      "학교 ",
    ]);
  });

  it("drops for labels that point at an untrusted id", () => {
    document.body.innerHTML =
      '<label for="NaN">학력 구분</label><select id="NaN"></select><label for="NaN">학교명</label><input id="NaN">';
    for (const control of Array.from(
      document.querySelectorAll<HTMLElement>("select, input"),
    ))
      expect(
        trustedLabels(control as HTMLInputElement | HTMLSelectElement),
      ).toEqual([]);
  });

  it("keeps a wrapping label even when the id is not trusted", () => {
    document.body.innerHTML =
      '<label>학교명 <input id="NaN"></label><input id="NaN">';
    const control = document.querySelector<HTMLInputElement>("input")!;
    expect(trustedLabels(control).map((label) => label.textContent)).toEqual([
      "학교명 ",
    ]);
  });
});
