import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { segmentGenericSections, type StyleOf } from "./section-segments";
import {
  ACTIVE_TAB_FORM,
  DIV_HEADING_FORM,
  FLAT_FORM,
  REPEAT_ROWS_FORM,
  SIBLING_H3_FORM,
  TABLE_FORM,
  collectSegmentFields,
  defaultStyleOf,
} from "./section-segments.test-fixtures";

afterEach(() => document.body.replaceChildren());

const boxHeadStyle: StyleOf = (element) =>
  element.matches(".box-head")
    ? { fontWeight: "700", fontSize: "18px" }
    : defaultStyleOf(element);

function segment(html: string, styleOf: StyleOf = defaultStyleOf) {
  document.body.innerHTML = html;
  const fields = collectSegmentFields(document);
  const sections = segmentGenericSections(document, fields, { styleOf });
  return { fields, sections };
}

const shape = (sections: ReturnType<typeof segment>["sections"]) =>
  sections.map((section) => ({
    title: section.title,
    boundary: section.boundary,
    labels: section.fields.map((field) => field.label),
  }));

describe("segmentGenericSections synthetic fixtures", () => {
  it("splits div headings found by injected style into 학력 and 어학", () => {
    const { sections } = segment(DIV_HEADING_FORM, boxHeadStyle);
    expect(shape(sections)).toEqual([
      {
        title: "학력",
        boundary: "heading",
        labels: ["학교명", "전공", "졸업 구분"],
      },
      { title: "어학", boundary: "heading", labels: ["시험명", "점수"] },
    ]);
  });

  it("keeps the div heading form as one section when the heading is not styled", () => {
    const { sections } = segment(DIV_HEADING_FORM, () => ({
      fontWeight: "400",
      fontSize: "14px",
    }));
    expect(sections).toHaveLength(1);
    expect(sections[0]!.fields).toHaveLength(5);
  });

  it("splits a div heading whose font is larger than the adjacent label", () => {
    const { sections } = segment(DIV_HEADING_FORM, (element) => ({
      fontWeight: "400",
      fontSize: element.matches(".box-head") ? "20px" : "14px",
    }));
    expect(sections.map((section) => section.title)).toEqual(["학력", "어학"]);
  });

  it("splits sibling h3 headings outside any container in document order", () => {
    const { sections } = segment(SIBLING_H3_FORM);
    expect(shape(sections)).toEqual([
      { title: "인적 사항", boundary: "heading", labels: ["이름", "이메일"] },
      { title: "경력", boundary: "heading", labels: ["회사명", "담당 업무"] },
    ]);
  });

  it("splits tables by caption and full-row colspan headers", () => {
    const { sections } = segment(TABLE_FORM);
    expect(shape(sections)).toEqual([
      { title: "가족 사항", boundary: "container", labels: ["관계", "성명"] },
      { title: "병역 사항", boundary: "container", labels: ["군별", "계급"] },
      { title: "보훈 사항", boundary: "heading", labels: ["보훈 번호"] },
    ]);
  });

  it("returns one section for a flat form without headings", () => {
    const { fields, sections } = segment(FLAT_FORM);
    expect(shape(sections)).toEqual([
      {
        title: undefined,
        boundary: "start",
        labels: ["이름", "연락처", "메시지"],
      },
    ]);
    expect(sections[0]!.fields).toEqual(fields);
  });

  it("does not use label[for] as a boundary even when it looks like a heading", () => {
    const loudLabels: StyleOf = (element) =>
      element.matches("label")
        ? { fontWeight: "800", fontSize: "24px" }
        : { fontWeight: "400", fontSize: "14px" };
    expect(shape(segment(FLAT_FORM, loudLabels).sections)).toEqual([
      {
        title: undefined,
        boundary: "start",
        labels: ["이름", "연락처", "메시지"],
      },
    ]);
    const { sections } = segment(DIV_HEADING_FORM, (element) =>
      element.matches("label, .box-head")
        ? { fontWeight: "700", fontSize: "18px" }
        : { fontWeight: "400", fontSize: "14px" },
    );
    expect(sections.map((section) => section.fields.length)).toEqual([3, 2]);
  });
});

describe("segmentGenericSections structure", () => {
  it("gives repeated rows one section each with equal fingerprints", () => {
    const { sections } = segment(REPEAT_ROWS_FORM);
    expect(shape(sections)).toEqual([
      { title: "학력", boundary: "repeat-row", labels: ["학교명", "전공"] },
      { title: "학력", boundary: "repeat-row", labels: ["학교명", "전공"] },
      {
        title: "자격증",
        boundary: "heading",
        labels: ["자격증명", "발급 기관"],
      },
    ]);
    const [first, second, other] = sections.map(
      (section) => section.fingerprint,
    );
    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(second).toBe(first);
    expect(other).not.toBe(first);
  });

  it("keeps fingerprints independent of labels' digits but not of control kinds", () => {
    const { sections } = segment(FLAT_FORM);
    const fields = sections[0]!.fields;
    const renumbered = fields.map((field, index) => ({
      ...field,
      label: `${field.label} ${index + 2}`,
    }));
    const retyped = fields.map((field) => ({ ...field, control: "select" }));
    const fingerprint = (input: typeof fields) =>
      segmentGenericSections(document, input, { styleOf: defaultStyleOf })[0]!
        .fingerprint;
    const numbered = fields.map((field, index) => ({
      ...field,
      label: `${field.label} ${index + 1}`,
    }));
    expect(fingerprint(renumbered)).toBe(fingerprint(numbered));
    expect(fingerprint(retyped)).not.toBe(fingerprint(fields));
  });

  it("links the active tab name as the top-level parent title", () => {
    const { sections } = segment(ACTIVE_TAB_FORM);
    expect(
      sections.map((section) => [section.parentTitle, section.title]),
    ).toEqual([
      ["학력 정보", "고등학교"],
      ["학력 정보", "대학교"],
    ]);
  });

  it("returns no sections without fields", () => {
    document.body.innerHTML = "<form><h3>빈 영역</h3></form>";
    expect(segmentGenericSections(document, [])).toEqual([]);
  });
});

function fixture(name: string): string {
  return readFileSync(
    join(process.cwd(), "fixtures/dom-snapshots", name, "sanitized.html"),
    "utf8",
  );
}

// Collecting the large sanitized form is slow under JSDOM; same bound as its
// existing snapshot test.
const LARGE_FIXTURE_TIMEOUT_MS = 120_000;

describe("segmentGenericSections existing sanitized fixtures (read-only)", () => {
  it("keeps the heading-less split-email form as one section", () => {
    const { fields, sections } = segment(
      fixture("lg-ai-research-birth-split-email"),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.boundary).toBe("start");
    expect(sections[0]!.title).toBeUndefined();
    expect(sections[0]!.fields).toEqual(fields);
  });

  it(
    "follows the page's h2 headings and splits the trailing agreement area",
    () => {
      const { fields, sections } = segment(
        fixture("sk-careers-application-form"),
      );
      const titles = sections
        .map((section) => section.title)
        .filter((title, index, all) => index === 0 || title !== all[index - 1]);
      expect(titles).toEqual([
        "인적 사항",
        "지원 정보",
        "학력",
        "경력",
        "경험/특허",
        "수상",
        "자격/면허",
        "어학",
        "외국어 능력",
        "자기소개서",
        "추가자료",
        undefined,
      ]);
      expect(sections.at(-1)).toMatchObject({
        boundary: "divergence",
        fields: [expect.objectContaining({ control: "checkbox" })],
      });
      expect(sections.flatMap((section) => section.fields)).toEqual(fields);
      const headings = Array.from(document.querySelectorAll("h2"));
      for (const section of sections.filter((entry) => entry.title)) {
        const heading = headings.find(
          (element) => element.textContent?.trim() === section.title,
        )!;
        const box = heading.parentElement!.parentElement!;
        expect(
          section.fields.every((field) => box.contains(field.element)),
        ).toBe(true);
      }
    },
    LARGE_FIXTURE_TIMEOUT_MS,
  );
});
