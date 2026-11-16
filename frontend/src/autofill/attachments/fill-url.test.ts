import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { findAttachmentFields } from "./file-fields";
import {
  fillUrl,
  URL_FILLED_REASON,
  URL_NOT_EDITABLE_REASON,
} from "./fill-url";

afterEach(() => document.body.replaceChildren());

const ITEM = (title: string, fileId: string, urlId: string) => `
  <li><div>${title}</div><div>
    <div><input type="text" placeholder="첨부파일선택" readonly hidden>
      <label for="${fileId}">첨부파일추가</label><input id="${fileId}" type="file" accept="application/pdf">
      <button type="button">파일추가</button></div>
    <div><label for="${urlId}" hidden>url추가</label>
      <input id="${urlId}" placeholder="https://example.test" maxlength="500" type="text">
      <button type="button" disabled>URL추가</button></div>
  </div></li>`;

describe("paired URL boxes", () => {
  it("pairs each file field with the URL box of the same item", () => {
    document.body.innerHTML = `<ul>${ITEM("경력기술서", "f1", "u1")}${ITEM("포트폴리오", "f2", "u2")}</ul>`;

    expect(
      findAttachmentFields(document).map((field) => [
        field.kind,
        field.urlInput?.id,
      ]),
    ).toEqual([
      ["resume", "u1"],
      ["portfolio", "u2"],
    ]);
  });

  it("finds no URL box for photo fields or fields without one", () => {
    document.body.innerHTML = `
      <div><label for="p">증명사진</label><input id="p" type="file">
        <input type="url" aria-label="사진 URL"></div>
      <div><label for="r">이력서</label><input id="r" type="file"></div>`;

    expect(
      findAttachmentFields(document).map((field) => field.urlInput),
    ).toEqual([undefined, undefined]);
  });

  it("pairs the URL boxes of the sanitized woowahan snapshot", () => {
    document.documentElement.innerHTML = readFileSync(
      "fixtures/dom-snapshots/woowahan-r2605009-initial/sanitized.html",
      "utf8",
    );

    expect(
      findAttachmentFields(document).map((field) => [
        field.kind,
        field.urlInput?.placeholder,
      ]),
    ).toEqual([
      ["resume", "https://example.test"],
      ["portfolio", "https://example.test"],
    ]);
  });
});

describe("fillUrl", () => {
  it("types the link with bubbling input and change events", () => {
    document.body.innerHTML = `<form><input id="u" type="text"></form>`;
    const input = document.querySelector<HTMLInputElement>("#u")!;
    const events: string[] = [];
    document
      .querySelector("form")!
      .addEventListener("input", () => events.push("input"));
    document
      .querySelector("form")!
      .addEventListener("change", () => events.push("change"));

    expect(fillUrl(input, "https://portfolio.example.test")).toEqual({
      status: "filled",
    });
    expect(input.value).toBe("https://portfolio.example.test");
    expect(events).toEqual(["input", "change"]);
  });

  it("keeps an existing value and skips boxes it cannot edit", () => {
    document.body.innerHTML = `<input id="a" value="https://mine.example.test"><input id="b" readonly>`;

    expect(
      fillUrl(document.querySelector("#a")!, "https://other.example.test"),
    ).toEqual({ status: "blocked", reason: URL_FILLED_REASON });
    expect(document.querySelector<HTMLInputElement>("#a")!.value).toBe(
      "https://mine.example.test",
    );
    expect(
      fillUrl(document.querySelector("#b")!, "https://other.example.test"),
    ).toEqual({ status: "blocked", reason: URL_NOT_EDITABLE_REASON });
  });
});
