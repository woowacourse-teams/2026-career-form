import { afterEach, describe, expect, it } from "vitest";

import { createEmptyProfile, type Profile } from "../../profile/model";
import { collectFieldsSnapshot, collectPreparationSnapshot } from "./collect";
import { assignMixedRows, detectMixedSectionGroup } from "./mixed-section-rows";

afterEach(() => {
  document.body.replaceChildren();
});

const KIND_OPTIONS =
  '<option value="">구분</option><option value="01|고등학교">고등학교</option><option value="02|전문대학">전문대학</option><option value="03|대학교">대학교</option>';

function row(options = KIND_OPTIONS, id = "NaN"): string {
  return `<div class="r"><select id="${id}" name="eduKind">${options}</select><input id="${id}" name="schoolName" type="text"><input name="major" type="text"></div>`;
}

function mount(rows: string[]): { container: Element; rows: Element[] } {
  document.body.innerHTML = `<section><h3>학력</h3><div id="list">${rows.join("")}</div></section>`;
  const container = document.querySelector("#list")!;
  return { container, rows: Array.from(container.children) };
}

function profile(
  ...entries: Array<[string, Record<string, string>?]>
): Profile {
  return {
    ...createEmptyProfile(),
    education: entries.map(([sectionId, values = {}], index) => ({
      id: `entry-${index}`,
      sectionId,
      values,
    })),
  };
}

describe("detectMixedSectionGroup", () => {
  it("detects rows whose first control is the same kind select covering two sections", () => {
    const { container, rows } = mount([row(), row()]);
    const group = detectMixedSectionGroup(container, rows);
    expect(group?.rows).toEqual(rows);
    expect(group?.kindSelects).toEqual(
      rows.map((r) => r.querySelector("select")),
    );
    expect([...(group?.coveredSections ?? [])]).toEqual([
      "highSchool",
      "university",
    ]);
  });

  it("detects a single fresh row with an empty kind select", () => {
    const { container, rows } = mount([row()]);
    expect(detectMixedSectionGroup(container, rows)?.rows).toHaveLength(1);
  });

  it("does not depend on id sequences", () => {
    const { container, rows } = mount([
      row(KIND_OPTIONS, "kind0"),
      row(KIND_OPTIONS, "kind01"),
    ]);
    expect(detectMixedSectionGroup(container, rows)?.rows).toEqual(rows);
  });

  it.each([
    ["no rows", () => mount([])],
    [
      "a first control that is not a select",
      () =>
        mount([
          '<div class="r"><input name="schoolName"><select name="eduKind">' +
            KIND_OPTIONS +
            "</select></div>",
        ]),
    ],
    [
      "rows with different option lists",
      () =>
        mount([
          row(),
          row(
            '<option value="">구분</option><option>고등학교</option><option>대학교</option>',
          ),
        ]),
    ],
    [
      "two options for one kind",
      () =>
        mount([row(KIND_OPTIONS + '<option value="09">대학(학사)</option>')]),
    ],
    [
      "options covering one section",
      () =>
        mount([
          row(
            '<option value="">구분</option><option>전문대학</option><option>대학교</option>',
          ),
        ]),
    ],
  ])("rejects %s", (_, build) => {
    const { container, rows } = build();
    expect(detectMixedSectionGroup(container, rows)).toBeUndefined();
  });

  it("rejects rows that do not form one repeat group", () => {
    document.body.innerHTML = `<section><div id="list"><h3>고등학교</h3>${row()}<h3>대학교</h3>${row()}</div></section>`;
    const container = document.querySelector("#list")!;
    const rows = Array.from(container.querySelectorAll(".r"));
    expect(detectMixedSectionGroup(container, rows)).toBeUndefined();
  });
});

describe("assignMixedRows", () => {
  it("orders covered section entries by profile order", () => {
    const { container, rows } = mount([row(), row(), row()]);
    const group = detectMixedSectionGroup(container, rows)!;
    const assigned = assignMixedRows(
      profile(
        ["university", { schoolType: "대학교" }],
        ["languages"],
        ["highSchool"],
        ["university", { degreeLevel: "전문학사" }],
      ),
      group,
    );
    expect(
      assigned.map(({ entry, sectionId, sectionIndex, kind, optionText }) => [
        entry.id,
        sectionId,
        sectionIndex,
        kind,
        optionText,
      ]),
    ).toEqual([
      ["entry-0", "university", 0, "UNIVERSITY", "대학교"],
      ["entry-2", "highSchool", 0, "HIGH_SCHOOL", "고등학교"],
      ["entry-3", "university", 1, "JUNIOR_COLLEGE", "전문대학"],
    ]);
  });

  it("leaves rows without a determinable kind or matching option unmapped", () => {
    const { container, rows } = mount([row()]);
    const group = detectMixedSectionGroup(container, rows)!;
    const assigned = assignMixedRows(
      profile(
        ["university"],
        ["highSchool"],
        ["graduateSchool", { degreeLevel: "석사" }],
      ),
      group,
    );
    expect(
      assigned.map(({ sectionId, kind, optionText }) => [
        sectionId,
        kind,
        optionText,
      ]),
    ).toEqual([
      ["university", undefined, undefined],
      ["highSchool", "HIGH_SCHOOL", "고등학교"],
    ]);
  });
});

describe("mixed-section collection (C5)", () => {
  function mountWithAdd(rowCount: number, firstKind = "") {
    const rows = Array.from({ length: rowCount }, (_, index) =>
      row(KIND_OPTIONS, "NaN").replace(
        "</div>",
        index === 0
          ? '<button type="button">내용추가</button><button type="button">초기화</button></div>'
          : '<button type="button">삭제</button></div>',
      ),
    );
    document.body.innerHTML = `<form><section><h3>학력</h3><div id="list">${rows.join("")}</div></section></form>`;
    const first = document.querySelector<HTMLSelectElement>("select")!;
    first.value = firstKind;
  }

  it("exposes the mixed group through the in-row add action", () => {
    mountWithAdd(2);
    const snapshot = collectPreparationSnapshot(document);
    const actions = snapshot.request.sections.flatMap(
      (section) => section.actionCandidates,
    );
    expect(actions.map((action) => action.displayName)).toEqual(["내용추가"]);
    const group = snapshot.mixedSectionGroup?.(actions[0]!.candidateId);
    expect(group?.rows).toHaveLength(2);
    expect(snapshot.countRepeatableGroups(actions[0]!.candidateId)).toBe(2);
  });

  it("marks fields of mixed rows with their row position and kind select", () => {
    mountWithAdd(2, "01|고등학교");
    const snapshot = collectFieldsSnapshot(document);
    const handles = snapshot.request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ])
      .map((field) => snapshot.registry.lookupField(field.candidateId))
      .flatMap((lookup) => ("handle" in lookup ? [lookup.handle] : []));
    const contexts = handles.map((handle) => handle.mixedSectionRow);
    expect(contexts).toHaveLength(6);
    expect(
      contexts.map((context) => [
        context?.rowIndex,
        context?.rowCount,
        context?.isKindSelect,
        context?.selectedKind,
      ]),
    ).toEqual([
      [0, 2, true, "고등학교"],
      [0, 2, false, "고등학교"],
      [0, 2, false, "고등학교"],
      [1, 2, true, undefined],
      [1, 2, false, undefined],
      [1, 2, false, undefined],
    ]);
    expect(new Set(contexts.map((context) => context?.groupKey)).size).toBe(1);
  });
});
