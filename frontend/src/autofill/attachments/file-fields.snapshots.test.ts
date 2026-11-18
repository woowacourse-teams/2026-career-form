import { readFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";

import { findAttachmentFields } from "./file-fields";

afterEach(() => document.body.replaceChildren());

// Sanitized application snapshots already kept for adapter regressions.
it.each([
  [
    "woowahan-r2605009-initial",
    [
      ["경력기술서", "resume"],
      ["포트폴리오", "portfolio"],
    ],
  ],
  [
    "kakao-greeting-email",
    [
      ["사진", "photo"],
      ["경력기술서", "resume"],
      ["포트폴리오", "portfolio"],
    ],
  ],
  [
    "sk-careers-application-form",
    [
      ["사진", "photo"],
      ["경험 추가", undefined],
      ["포트폴리오", "portfolio"],
    ],
  ],
  ["nhn-presales-initial", [["포트폴리오", "portfolio"]]],
  [
    "lg-ai-research-birth-split-email",
    [
      ["이력서 및 경력기술서", "resume"],
      ["포트폴리오 (선택사항)", "portfolio"],
    ],
  ],
  ["ahnlab-write-resume-form", [["지원서 사진등록", "photo"]]],
])("classifies the file fields of %s", (name, expected) => {
  document.documentElement.innerHTML = readFileSync(
    `fixtures/dom-snapshots/${name}/sanitized.html`,
    "utf8",
  );

  expect(
    findAttachmentFields(document).map((field) => [field.label, field.kind]),
  ).toEqual(
    expected.map(([label, kind]) => [
      expect.stringMatching(new RegExp(`^${label?.replace(/[()]/g, "\\$&")}`)),
      kind,
    ]),
  );
});

it("never treats an NHN project file as the portfolio, even without the portfolio input", () => {
  const html = readFileSync(
    "fixtures/dom-snapshots/nhn-presales-initial/sanitized.html",
    "utf8",
  );
  // Live pages may render the portfolio uploader later and carry different
  // career text; neither may push the project file into the portfolio.
  document.documentElement.innerHTML = html.replace(/재직 중/g, "");
  document.getElementById("id-20")?.remove();

  expect(findAttachmentFields(document)).toEqual([]);

  document.documentElement.innerHTML = html.replace(/재직 중/g, "");
  expect(
    findAttachmentFields(document).map((field) => [
      field.element.id,
      field.kind,
    ]),
  ).toEqual([["id-20", "portfolio"]]);
});

it("reads visible NHN text before the internal portfolio name of the project file", () => {
  // The live NHN page names the per-project file input "portfolio" and the
  // real portfolio input "portfolio-file"; the sanitized snapshot hides both.
  document.documentElement.innerHTML = readFileSync(
    "fixtures/dom-snapshots/nhn-presales-initial/sanitized.html",
    "utf8",
  );
  document.getElementById("id-19")!.setAttribute("name", "portfolio");
  document.getElementById("id-20")!.setAttribute("name", "portfolio-file");

  expect(
    findAttachmentFields(document).map((field) => [
      field.element.id,
      field.kind,
    ]),
  ).toEqual([["id-20", "portfolio"]]);
});
