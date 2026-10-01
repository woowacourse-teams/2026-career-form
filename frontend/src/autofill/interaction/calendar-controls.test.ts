import { describe, expect, it } from "vitest";
import {
  calendarApplyControls,
  calendarMonths,
  calendarYearTriggers,
  calendarYears,
  parseCalendarMonth,
} from "./calendar-controls";

describe("calendar controls", () => {
  it("parses Korean and explicit English month names but not numeric-only labels", () => {
    expect(parseCalendarMonth("1월")).toBe(1);
    expect(parseCalendarMonth("December")).toBe(12);
    expect(parseCalendarMonth("12")).toBeUndefined();
  });

  it("rejects duplicate or disabled target month controls", () => {
    document.body.innerHTML = `<div><button>2026</button><button>2027</button><button>January</button><button disabled>February</button><button>March</button><button>March</button></div>`;
    const root = document.body.firstElementChild!;
    expect(calendarYears(root).map(({ year }) => year)).toEqual([2026, 2027]);
    expect(calendarMonths(root).map(({ month }) => month)).toEqual([1]);
  });

  it("recognizes only one explicit year-list trigger and a non-submit owned apply control", () => {
    document.body.innerHTML = `<div><button aria-haspopup="listbox" aria-controls="years">연도</button><button type="button" data-calendar-apply>적용</button><button type="submit" data-calendar-apply>저장</button></div>`;
    const root = document.body.firstElementChild!;
    expect(calendarYearTriggers(root)).toHaveLength(1);
    expect(calendarApplyControls(root)).toHaveLength(1);
  });
});
