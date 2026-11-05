import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { dayCalendarSurfaceFor } from "../interaction/day-calendar-surface";
import { calendarUnitEvidence } from "../interaction/calendar-unit";

afterEach(() => document.body.replaceChildren());

it("shares the certificate date column on the sanitized implicit-repeat snapshot", () => {
  document.body.innerHTML = readFileSync(
    join(process.cwd(), "fixtures/dom-snapshots/naver-step2-form/sanitized.html"),
    "utf8",
  );
  const first = document.querySelector<HTMLInputElement>("input[name=takeYmd]")!;
  const row = first.closest(".rcform_copy")!;
  for (const index of [1, 2]) {
    const copy = row.cloneNode(true) as HTMLElement;
    const date = copy.querySelector<HTMLInputElement>("input[name=takeYmd]")!;
    date.id = `synthetic-certificate-date-${index}`;
    copy.querySelector<HTMLLabelElement>('label[for="takeYmd0"]')!.htmlFor = `missing-${index}`;
    copy.querySelectorAll(".rcform_copyBtn").forEach((button) => button.remove());
    row.parentElement!.append(copy);
  }
  const popup = document.createElement("div");
  popup.className = "ui-datepicker";
  popup.style.display = "none";
  document.body.append(popup);
  const dates = [...document.querySelectorAll<HTMLInputElement>("input[name=takeYmd]")];
  expect(dates).toHaveLength(3);
  expect(dates.map((date) => date.labels?.length)).toEqual([1, 0, 0]);
  for (const date of dates) {
    expect(calendarUnitEvidence(date)).toEqual({ unit: "day", unitEvidence: "target-label" });
    expect(dayCalendarSurfaceFor(date)).toMatchObject({ target: date, popup });
  }
});
