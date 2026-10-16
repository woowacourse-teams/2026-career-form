import { afterEach, expect, it } from "vitest";
import { segmentGenericSections } from "./section-segments";
import {
  DIV_HEADING_FORM,
  collectSegmentFields,
} from "./section-segments.test-fixtures";

afterEach(() => document.body.replaceChildren());

function segmentWithStyle(css: string) {
  document.body.innerHTML = `<style>${css}</style>${DIV_HEADING_FORM}`;
  return segmentGenericSections(document, collectSegmentFields(document)).map(
    (section) => ({ title: section.title, fields: section.fields.length }),
  );
}

it("splits div headings with real computed font weight in Chromium", () => {
  expect(segmentWithStyle(".box-head { font-weight: 700 }")).toEqual([
    { title: "학력", fields: 3 },
    { title: "어학", fields: 2 },
  ]);
});

it("splits div headings with a larger computed font size than the labels", () => {
  expect(
    segmentWithStyle(".box-head { font-size: 22px } label { font-size: 14px }"),
  ).toEqual([
    { title: "학력", fields: 3 },
    { title: "어학", fields: 2 },
  ]);
});

it("keeps bold labels and plain div text from becoming boundaries", () => {
  expect(
    segmentWithStyle(
      ".box-head { font-weight: 400 } label { font-weight: 800; font-size: 24px }",
    ),
  ).toEqual([{ title: undefined, fields: 5 }]);
});
