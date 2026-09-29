import { afterEach, describe, expect, it } from "vitest";

import { genericFormGroups } from "./generic-form-groups";
import {
  implicitRepeatGroupFor,
  implicitRepeatGroups,
} from "./implicit-repeat-rows";
import { genericRowFor, genericRows } from "./repeatable-rows";

afterEach(() => {
  document.body.replaceChildren();
});

const ROW = (id: string, extra = "") =>
  `<div class="r"><select id="${id}" name="eduKind"><option value="">학력구분 선택</option></select><input id="${id}" name="schoolName" type="text">${extra}</div>`;

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<form><div id="list">${html}</div></form>`;
  return document.querySelector<HTMLElement>("#list")!;
}

function addButton(): HTMLElement {
  return Array.from(document.querySelectorAll<HTMLElement>("button")).find(
    (button) => /추가/.test(button.textContent ?? ""),
  )!;
}

describe("implicit repeat rows (C13)", () => {
  it("detects a single row with an add action inside the first row", () => {
    const list = mount(ROW("NaN", '<button type="button">내용추가</button>'));
    const group = implicitRepeatGroupFor(addButton());
    expect(group?.container).toBe(list);
    expect(group?.rows).toEqual([list.children[0]]);
  });

  it("keeps rows added after the first row in the same group", () => {
    const list = mount(
      ROW("NaN", '<button type="button">내용추가</button>') +
        ROW("NaN", '<button type="button">삭제</button>') +
        ROW("NaN", '<button type="button">삭제</button>'),
    );
    const group = implicitRepeatGroupFor(addButton());
    expect(group?.rows).toEqual(Array.from(list.children));
    const input = list.children[2]!.querySelector("input")!;
    expect(genericRowFor(input)).toBe(list.children[2]);
    expect(genericRows(list)).toEqual(Array.from(list.children));
  });

  it("detects an add action inside the container but outside the rows", () => {
    const list = mount(
      `${ROW("a1")}${ROW("a2")}<button type="button">추가</button>`,
    );
    expect(implicitRepeatGroupFor(addButton())?.rows).toEqual(
      Array.from(list.querySelectorAll(".r")),
    );
  });

  it("ignores per-row visibility differences in the signature", () => {
    const list = mount(
      ROW(
        "NaN",
        '<button type="button">내용추가</button><div hidden><input name="passDate"></div>',
      ) + ROW("NaN", '<div><input name="passDate"></div>'),
    );
    expect(implicitRepeatGroupFor(addButton())?.rows).toHaveLength(2);
    expect(list).toBeTruthy();
  });

  it.each([
    [
      "mismatched sibling signatures",
      ROW("a", '<button type="button">내용추가</button>') +
        '<div><input name="other"><textarea name="x"></textarea></div>',
    ],
    ["no add action", ROW("a") + ROW("b")],
    [
      "two add actions",
      ROW(
        "a",
        '<button type="button">추가</button><button type="button">내용추가</button>',
      ),
    ],
    [
      "a nested block that reads as both container and row",
      '<div><div><input name="a1"><input name="b1"></div><div><input name="a2"><input name="b2"></div><button type="button">내용추가</button></div>',
    ],
    [
      "a single fieldset row",
      '<fieldset><legend>학교</legend><input name="a"><input name="b"><button type="button">내용추가</button></fieldset>',
    ],
    [
      "reset and delete only",
      ROW(
        "a",
        '<button type="button">초기화</button><button type="button">삭제</button>',
      ),
    ],
    [
      "one control per row",
      '<div><input name="only"><button type="button">추가</button></div>',
    ],
  ])("does not detect %s", (_, html) => {
    mount(html);
    expect(implicitRepeatGroups(document)).toEqual([]);
  });

  // Per-kind branches: each branch owns its kind select and add action, and
  // only the selected kind's branch is rendered.
  const BRANCH = (college: boolean, shown: boolean, add: boolean) =>
    `<div class="b"${shown ? "" : ' style="display:none"'}><select name="kind"><option value="">구분</option></select><input name="school" type="text"><input name="entrance" type="text">${college ? '<input name="major" type="text">' : ""}${add ? '<button type="button">내용추가</button>' : ""}</div>`;
  const BRANCH_ROW = (add: boolean, extra = "") =>
    `<div class="r">${extra}${BRANCH(false, true, add)}${BRANCH(true, false, add)}</div>`;

  it("reads a rendered branch among hidden sibling branches as its row", () => {
    const list = mount(BRANCH_ROW(true));
    const visible = addButton();
    const group = implicitRepeatGroupFor(visible);
    expect(group?.container).toBe(list);
    expect(group?.rows).toEqual([list.children[0]]);
    expect(group?.action).toBe(visible);
    expect(implicitRepeatGroups(document)).toHaveLength(1);
  });

  it("keeps rows added after a branch row in the same group", () => {
    const list = mount(
      BRANCH_ROW(true) + BRANCH_ROW(false) + BRANCH_ROW(false),
    );
    const group = implicitRepeatGroupFor(addButton());
    expect(group?.rows).toEqual(Array.from(list.children));
  });

  it.each([
    [
      "two rendered branches with add actions",
      `<div class="r">${BRANCH(false, true, true)}${BRANCH(true, true, true)}</div>`,
    ],
    [
      "hidden sibling branches with the same signature",
      `<div class="r">${BRANCH(false, true, true)}${BRANCH(false, false, true)}</div>`,
    ],
    [
      "a hidden add action outside the branch row",
      BRANCH_ROW(true) +
        '<div style="display:none"><button type="button">추가</button></div>',
    ],
    [
      "a branch row with its own direct control",
      BRANCH_ROW(true, '<input name="note" type="text">'),
    ],
  ])("does not detect %s", (_, html) => {
    mount(html);
    expect(implicitRepeatGroups(document)).toEqual([]);
  });

  it("does not detect an add action that lives only in a later row", () => {
    mount(ROW("a") + ROW("b", '<button type="button">내용추가</button>'));
    expect(implicitRepeatGroupFor(addButton())).toBeUndefined();
  });

  it("keeps existing detections unchanged", () => {
    document.body.innerHTML =
      '<form><section><div class="career-item"><input name="company"><input name="role"></div><div class="career-item"><input name="company"><input name="role"></div><button type="button">경력 추가</button></section></form>';
    const section = document.querySelector("section")!;
    const before = {
      rows: genericRows(section),
      groups: genericFormGroups(document),
    };
    expect(implicitRepeatGroups(document)).toEqual([]);
    expect(genericRows(section)).toEqual(before.rows);
    expect(genericFormGroups(document)).toEqual(before.groups);
  });
});
