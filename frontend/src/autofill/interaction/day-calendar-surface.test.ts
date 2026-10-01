import { afterEach, describe, expect, it } from "vitest";
import {
  dayCalendarRoots,
  dayCalendarSurfaceFor,
  displayedDayCalendarRoots,
  isDisplayed,
} from "./day-calendar-surface";
import {
  canonicalDayCalendarValue,
  dayCalendarDateParts,
  formatDayCalendarValue,
} from "./day-calendar-value";

afterEach(() => {
  document.body.replaceChildren();
});

const ROOT = `<div id="ui-datepicker-div" class="ui-datepicker" style="display:none"></div>`;

function target() {
  return document.querySelector<HTMLInputElement>("#target")!;
}

describe("dayCalendarSurfaceFor", () => {
  it("uses the adjacent trigger button as the opener", () => {
    document.body.innerHTML = `<p><label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly><button type="button" class="ui-datepicker-trigger">...</button></p>${ROOT}`;

    expect(dayCalendarSurfaceFor(target())).toMatchObject({
      target: target(),
      opener: document.querySelector(".ui-datepicker-trigger"),
      popup: document.querySelector("#ui-datepicker-div"),
      openBy: "trigger",
    });
  });

  it("uses the target itself when there is no trigger", () => {
    document.body.innerHTML = `<label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly>${ROOT}`;

    expect(dayCalendarSurfaceFor(target())).toMatchObject({
      opener: target(),
      openBy: "target",
    });
  });

  it.each([
    [
      "an editable target",
      `<input id="target" class="hasDatepicker" type="text">${ROOT}`,
    ],
    [
      "a disabled target",
      `<input id="target" class="hasDatepicker" type="text" readonly disabled>${ROOT}`,
    ],
    [
      "a hidden target",
      `<div hidden><label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly></div>${ROOT}`,
    ],
    [
      "a target not bound to a datepicker",
      `<input id="target" type="text" readonly>${ROOT}`,
    ],
    [
      "a monthpicker target",
      `<input id="target" class="monthpicker hasDatepicker" type="text" readonly>${ROOT}`,
    ],
    [
      "a native date input",
      `<input id="target" class="hasDatepicker" type="date" readonly>${ROOT}`,
    ],
    [
      "no calendar root",
      `<label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly>`,
    ],
    [
      "several calendar roots",
      `<label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly>${ROOT}<div class="ui-datepicker" style="display:none"></div>`,
    ],
    [
      "a target inside the calendar root",
      `<div class="ui-datepicker"><label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly></div>`,
    ],
    [
      "triggers on both sides",
      `<label for="target">입사일</label><button type="button" class="ui-datepicker-trigger">...</button><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly><button type="button" class="ui-datepicker-trigger">...</button>${ROOT}`,
    ],
    [
      "a submit trigger inside a form",
      `<form><label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly><button class="ui-datepicker-trigger">...</button></form>${ROOT}`,
    ],
    [
      "a disabled trigger",
      `<label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly><button type="button" class="ui-datepicker-trigger" disabled>...</button>${ROOT}`,
    ],
    [
      "a non-button trigger",
      `<label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly><span class="ui-datepicker-trigger">...</span>${ROOT}`,
    ],
  ])("rejects %s", (_, html) => {
    document.body.innerHTML = html;

    expect(dayCalendarSurfaceFor(target())).toBeUndefined();
  });

  it("accepts an image trigger and ignores inline calendars", () => {
    document.body.innerHTML = `<label for="target">입사일</label><input id="target" class="hasDatepicker" type="text" maxlength="10" readonly><img class="ui-datepicker-trigger" alt="달력">${ROOT}<div class="ui-datepicker ui-datepicker-inline"></div>`;

    expect(dayCalendarSurfaceFor(target())?.openBy).toBe("trigger");
    expect(dayCalendarRoots(document)).toHaveLength(1);
  });
});

describe("day calendar visibility", () => {
  it("reports displayed roots only", () => {
    document.body.innerHTML = ROOT;
    const root = document.querySelector<HTMLElement>("#ui-datepicker-div")!;

    expect(displayedDayCalendarRoots(document)).toEqual([]);
    root.style.display = "block";
    expect(displayedDayCalendarRoots(document)).toEqual([root]);
    root.style.visibility = "hidden";
    expect(isDisplayed(root)).toBe(false);
    root.remove();
    expect(isDisplayed(root)).toBe(false);
  });
});

describe("day calendar values", () => {
  it.each([
    ["2024-02-29", undefined, "2024-02-29"],
    ["2024.02.29", undefined, "2024-02-29"],
    ["2024/02/29", undefined, "2024-02-29"],
    ["2024.02.29", "YYYY.MM.DD", "2024-02-29"],
    ["2024-02-29", "YYYY.MM.DD", undefined],
    ["2023-02-29", undefined, undefined],
    ["2024-2-29", undefined, undefined],
    ["2024-02.29", undefined, undefined],
  ] as const)("canonicalizes %s (%s)", (value, format, expected) => {
    expect(canonicalDayCalendarValue(value, format)).toBe(expected);
  });

  it("formats and parses canonical dates", () => {
    expect(formatDayCalendarValue("2024-12-31", "YYYY.MM.DD")).toBe(
      "2024.12.31",
    );
    expect(formatDayCalendarValue("2024-12-31", "YYYY/MM/DD")).toBe(
      "2024/12/31",
    );
    expect(dayCalendarDateParts("2000-02-29")).toEqual({
      year: 2000,
      month: 2,
      day: 29,
    });
    expect(dayCalendarDateParts("1900-02-29")).toBeUndefined();
  });
});
