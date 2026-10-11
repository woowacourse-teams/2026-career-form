import { afterEach, expect, it } from "vitest";
import { createDayCalendarFixture } from "../../../tests/browser/day-calendar-fixture";
import { executeDayCalendarSelection } from "./day-calendar-executor";

const fixtures: HTMLElement[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.remove();
});

function setup() {
  const fixture = createDayCalendarFixture();
  fixtures.push(fixture.container);
  return fixture;
}

it("focuses the readonly target and selects a leap day across real DOM replacements", async () => {
  const { target, popup } = setup();
  const renderedYears: Element[] = [];
  let changes = 0;
  popup.addEventListener("fixture-rendered", () => {
    const year = popup.querySelector(".ui-datepicker-year");
    if (year) renderedYears.push(year);
  });
  target.addEventListener("change", () => changes++);

  const result = await executeDayCalendarSelection({
    target,
    targetDate: "2024-02-29",
  });

  expect(result).toEqual({ status: "completed", targetDate: "2024-02-29" });
  expect(document.activeElement).toBe(target);
  expect(target.value).toBe("2024-02-29");
  expect(changes).toBe(1);
  expect(getComputedStyle(popup).display).toBe("none");
  expect(renderedYears).toHaveLength(3);
  expect(renderedYears[0]?.isConnected).toBe(false);
  expect(renderedYears[1]?.isConnected).toBe(false);
  expect(renderedYears[2]?.isConnected).toBe(true);
});

it("preserves an existing value without focusing or opening the calendar", async () => {
  const { target, popup } = setup();
  target.value = "2020-06-15";
  let focused = false;
  target.addEventListener("focus", () => {
    focused = true;
  });

  const result = await executeDayCalendarSelection({
    target,
    targetDate: "2024-02-29",
  });

  expect(result).toEqual({
    status: "needs-verification",
    reason: "existing_value",
  });
  expect(target.value).toBe("2020-06-15");
  expect(focused).toBe(false);
  expect(getComputedStyle(popup).display).toBe("none");
});

it("stops before selection when focus replaces the approved target", async () => {
  const { target } = setup();
  const replacement = document.createElement("input");
  replacement.readOnly = true;
  target.addEventListener("focus", () => target.replaceWith(replacement));

  const result = await executeDayCalendarSelection({
    target,
    targetDate: "2024-02-29",
  });

  expect(result).toEqual({
    status: "needs-verification",
    reason: "stale_target",
  });
  expect(target.value).toBe("");
  expect(replacement.value).toBe("");
});
