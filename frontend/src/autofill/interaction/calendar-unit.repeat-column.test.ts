import { afterEach, describe, expect, it } from "vitest";
import { calendarUnitEvidence } from "./calendar-unit";
import { dayCalendarSurfaceFor } from "./day-calendar-surface";

afterEach(() => document.body.replaceChildren());

function mount(labels = ["취득일/응시일", "", ""]) {
  document.body.innerHTML = `<section><h2>Certificates</h2><div>
    ${labels.map((label, index) => `<div data-repeater-item>
      <label>Name<input name="certificateName"></label>
      <div>${label ? `<label for="date-${index}">${label}</label>` : ""}
        <input id="date-${index}" name="acquired" class="hasDatepicker"
          type="text" readonly maxlength="10">
      </div>
    </div>`).join("")}
  </div></section><div class="ui-datepicker" style="display:none"></div>`;
  return [...document.querySelectorAll<HTMLInputElement>("input[name=acquired]")];
}

describe("calendar unit evidence from a repeated column", () => {
  it("uses the labelled counterpart only for the same group and column", () => {
    const dates = mount();
    expect(dates.map((date) => date.labels?.length)).toEqual([1, 0, 0]);
    for (const date of dates) {
      expect(calendarUnitEvidence(date)).toEqual({ unit: "day", unitEvidence: "target-label" });
      expect(dayCalendarSurfaceFor(date)).toMatchObject({ target: date, opener: date });
    }
  });

  it("keeps an entirely unlabelled group unconfirmed", () => {
    for (const date of mount(["", "", ""])) {
      expect(calendarUnitEvidence(date)).toEqual({ unit: "day", unitEvidence: "unconfirmed" });
      expect(dayCalendarSurfaceFor(date)).toBeUndefined();
    }
  });

  it("rejects conflicting unit labels in the shared column", () => {
    const dates = mount(["취득일", "취득월", ""]);
    expect(calendarUnitEvidence(dates[2]!)).toEqual({ unit: "conflict" });
    expect(dayCalendarSurfaceFor(dates[2]!)).toBeUndefined();
  });

  it.each(["name", "wrapper", "extra-control"])(
    "does not borrow across a changed %s structure",
    (change) => {
      const dates = mount();
      if (change === "name") dates[0]!.name = "anotherDate";
      if (change === "wrapper") {
        const wrapper = document.createElement("span");
        dates[0]!.replaceWith(wrapper);
        wrapper.append(dates[0]!);
      }
      if (change === "extra-control") dates[0]!.parentElement!.append(document.createElement("input"));
      expect(calendarUnitEvidence(dates[1]!)).toEqual({ unit: "day", unitEvidence: "unconfirmed" });
      expect(dayCalendarSurfaceFor(dates[1]!)).toBeUndefined();
    },
  );

  it("does not borrow from a different row container", () => {
    const dates = mount();
    const container = document.createElement("div");
    dates[0]!.closest("[data-repeater-item]")!.before(container);
    container.append(dates[0]!.closest("[data-repeater-item]")!);
    expect(dayCalendarSurfaceFor(dates[1]!)).toBeUndefined();
  });

  it("does not borrow across explicit repeat-group identifiers", () => {
    const dates = mount();
    dates[0]!.closest("[data-repeater-item]")!.className = "first-item";
    dates[1]!.closest("[data-repeater-item]")!.className = "second-item";
    dates[2]!.closest("[data-repeater-item]")!.className = "second-item";
    expect(dayCalendarSurfaceFor(dates[1]!)).toBeUndefined();
  });

  it("does not cross an intervening section heading", () => {
    const dates = mount();
    const heading = document.createElement("h3");
    heading.textContent = "Other records";
    dates[1]!.closest("[data-repeater-item]")!.before(heading);
    expect(dayCalendarSurfaceFor(dates[1]!)).toBeUndefined();
  });
});
