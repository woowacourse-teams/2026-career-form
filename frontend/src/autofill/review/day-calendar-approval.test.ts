import { afterEach, describe, expect, it } from "vitest";
import {
  createDayCalendarApproval,
  resolveDayCalendarFormat,
  revalidateDayCalendarApproval,
} from "./day-calendar-approval";

afterEach(() => {
  document.body.replaceChildren();
});

function install(attrs = "") {
  document.body.innerHTML = `
    <div data-item-group-id="careers" data-item-id="row-a">
      <label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" readonly ${attrs} maxlength="10"><button type="button" class="ui-datepicker-trigger">...</button>
    </div>
    <div id="ui-datepicker-div" class="ui-datepicker" style="display:none"></div>`;
  return document.querySelector<HTMLInputElement>("#target")!;
}

describe("resolveDayCalendarFormat", () => {
  it.each([
    ["", { status: "resolved" }],
    [`placeholder="입사일 선택"`, { status: "resolved" }],
    [`placeholder="YYYY-MM-DD"`, { status: "resolved", format: "YYYY-MM-DD" }],
    [`placeholder="yyyy.mm.dd"`, { status: "resolved", format: "YYYY.MM.DD" }],
    [`placeholder="YYYY/MM/DD"`, { status: "resolved", format: "YYYY/MM/DD" }],
    [
      `placeholder="YYYY.MM"`,
      { status: "invalid", reason: "format_clue_conflict" },
    ],
    [
      `placeholder="YYYY-MM-DD 또는 YYYY.MM.DD"`,
      { status: "invalid", reason: "format_clue_conflict" },
    ],
    [`maxlength="7"`, { status: "invalid", reason: "length_conflict" }],
    [`maxlength="x"`, { status: "invalid", reason: "length_conflict" }],
  ])("resolves %s", (attrs, expected) => {
    expect(resolveDayCalendarFormat(install(attrs))).toEqual(expected);
  });
});

describe("createDayCalendarApproval", () => {
  it("captures the target, trigger, shared root, row and display value", () => {
    const target = install(`placeholder="YYYY.MM.DD"`);

    const approval = createDayCalendarApproval({
      target,
      originalDate: "2024-02-29",
      profileFieldKey: "careers.career.startDate",
      profileEntryId: "entry-a",
      itemIndex: 0,
    });

    expect(approval).toMatchObject({
      unit: "day",
      target,
      opener: document.querySelector(".ui-datepicker-trigger"),
      popup: document.querySelector("#ui-datepicker-div"),
      targetDate: "2024-02-29",
      targetFormat: "YYYY.MM.DD",
      displayValue: "2024.02.29",
      repeatRow: { itemIndex: 0 },
    });
    expect(revalidateDayCalendarApproval(approval)).toEqual({
      status: "valid",
    });
  });

  it("falls back to the row attributes when no identity is supplied", () => {
    const approval = createDayCalendarApproval({
      target: install(),
      originalDate: "2024-02-29",
    });

    expect(approval.repeatRow).toEqual({
      itemId: "row-a",
      itemGroupId: "careers",
    });
    expect(approval.displayValue).toBe("2024-02-29");
    expect(approval.targetFormat).toBeUndefined();
  });

  it.each([
    ["an impossible date", "", "2023-02-29"],
    ["a partial date", "", "2023-02"],
    ["a month-only format clue", `placeholder="YYYY.MM"`, "2024-02-29"],
  ])("rejects %s", (_, attrs, date) => {
    expect(() =>
      createDayCalendarApproval({ target: install(attrs), originalDate: date }),
    ).toThrow();
  });

  it("rejects an open calendar and a missing surface", () => {
    const target = install();
    document.querySelector<HTMLElement>("#ui-datepicker-div")!.style.display =
      "block";
    expect(() =>
      createDayCalendarApproval({ target, originalDate: "2024-02-29" }),
    ).toThrow();
    target.classList.remove("hasDatepicker");
    expect(() =>
      createDayCalendarApproval({ target, originalDate: "2024-02-29" }),
    ).toThrow();
  });
});

describe("revalidateDayCalendarApproval", () => {
  function approval(attrs = `placeholder="YYYY-MM-DD"`) {
    return createDayCalendarApproval({
      target: install(attrs),
      originalDate: "2024-02-29",
      profileFieldKey: "careers.career.startDate",
      itemIndex: 0,
    });
  }

  it("detects an edited approval identity", () => {
    const edited = approval();
    edited.targetDate = "2024-02-28";
    edited.originalDate = "2024-02-28";
    expect(revalidateDayCalendarApproval(edited)).toEqual({
      status: "invalid",
      reason: "approval_identity_changed",
    });
    const row = approval();
    row.repeatRow = { itemIndex: 1 };
    expect(revalidateDayCalendarApproval(row).status).toBe("invalid");
    const mismatched = approval();
    mismatched.targetDate = "2024-02-28";
    expect(revalidateDayCalendarApproval(mismatched)).toEqual({
      status: "invalid",
      reason: "approved_value_invalid",
    });
    const unit = approval();
    (unit as { unit: string }).unit = "month";
    expect(revalidateDayCalendarApproval(unit)).toEqual({
      status: "invalid",
      reason: "unit_changed",
    });
  });

  it("detects a detached target", () => {
    const current = approval();
    current.target.remove();
    expect(revalidateDayCalendarApproval(current)).toEqual({
      status: "invalid",
      reason: "target_detached",
    });
  });

  it("detects a replaced trigger or shared root", () => {
    const trigger = approval();
    const button = document.querySelector(".ui-datepicker-trigger")!;
    button.replaceWith(button.cloneNode(true));
    expect(revalidateDayCalendarApproval(trigger)).toEqual({
      status: "invalid",
      reason: "calendar_surface_changed",
    });
    const root = approval();
    const div = document.querySelector("#ui-datepicker-div")!;
    div.replaceWith(div.cloneNode(true));
    expect(revalidateDayCalendarApproval(root)).toEqual({
      status: "invalid",
      reason: "calendar_surface_changed",
    });
  });

  it("detects a changed format clue and changed structure", () => {
    const format = approval();
    format.target.setAttribute("placeholder", "YYYY.MM.DD");
    expect(revalidateDayCalendarApproval(format)).toEqual({
      status: "invalid",
      reason: "target_format_changed",
    });
    const structure = approval();
    structure.target.setAttribute("name", "renamed");
    expect(revalidateDayCalendarApproval(structure)).toEqual({
      status: "invalid",
      reason: "dom_signature_changed",
    });
  });

  it("tolerates focus style and value changes made by the widget", () => {
    const current = approval();
    current.target.style.outline = "1px solid";
    current.target.value = "2024-02-29";
    expect(revalidateDayCalendarApproval(current)).toEqual({ status: "valid" });
  });
});
