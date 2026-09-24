import { describe, expect, it } from "vitest";
import {
  createCalendarApproval,
  revalidateCalendarApproval,
} from "./calendar-approval";

describe("calendar approval", () => {
  it("approves only a readonly month calendar and retains its target identity", () => {
    document.body.innerHTML = `<section><input id="target" type="text" readonly><button type="button" aria-labelledby="target" aria-controls="calendar">월 선택</button><div id="calendar" role="dialog"><button type="button">2026</button>${Array.from({ length: 12 }, (_, index) => `<button type="button">${index + 1}월</button>`).join("")}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("#target")!;
    const approval = createCalendarApproval({
      target,
      originalDate: "2026-03-15",
      targetYearMonth: "2026-03",
      profileFieldKey: "experience.experience.availableMonth",
      profileEntryId: "experience-1",
      itemIndex: 2,
    });
    expect(approval).toMatchObject({
      target,
      originalDate: "2026-03-15",
      targetYearMonth: "2026-03",
      profileFieldKey: "experience.experience.availableMonth",
      profileEntryId: "experience-1",
      itemIndex: 2,
      unit: "month",
    });
    expect(approval).toMatchObject({
      originalDate: "2026-03-15",
      monthClue: "2026-03",
      repeatRow: { itemIndex: 2 },
    });
    expect(revalidateCalendarApproval(approval)).toEqual({ status: "valid" });
  });

  it.each([
    [
      "target attribute",
      (target: HTMLInputElement) =>
        target.setAttribute("placeholder", "YYYY-MM"),
    ],
    [
      "calendar unit",
      (target: HTMLInputElement) => (target.dataset.calendarUnit = "date"),
    ],
    [
      "repeat row",
      (_target: HTMLInputElement) =>
        document
          .querySelector("section")!
          .setAttribute("data-item-id", "other-row"),
    ],
    [
      "profile identity",
      (target: HTMLInputElement) =>
        (target.dataset.profileField = "other.field"),
    ],
    [
      "target swap",
      (_target: HTMLInputElement) =>
        document.querySelector<HTMLInputElement>("#target")!.replaceWith(
          Object.assign(document.createElement("input"), {
            id: "target",
            type: "text",
            readOnly: true,
          }),
        ),
    ],
  ])("rejects a stale %s", (_name, mutate) => {
    document.body.innerHTML = `<section data-item-id="row-1"><input id="target" type="text" readonly><button type="button" aria-labelledby="target" aria-controls="calendar">월 선택</button><div id="calendar" role="dialog"><button type="button">2026</button>${Array.from({ length: 12 }, (_, index) => `<button type="button">${index + 1}월</button>`).join("")}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("#target")!;
    const approval = createCalendarApproval({
      target,
      originalDate: "2026-03-15",
      targetYearMonth: "2026-03",
      profileFieldKey: "experience.experience.availableMonth",
      profileEntryId: "experience-1",
      itemIndex: 2,
      repeatRow: { itemId: "row-1", itemIndex: 2 },
    });
    mutate(target);
    expect(revalidateCalendarApproval(approval).status).toBe("invalid");
  });

  it("rejects an invalid original date or target month without a fallback", () => {
    document.body.innerHTML = `<section><input id="target" type="text" readonly><button type="button" aria-labelledby="target" aria-controls="calendar">월 선택</button><div id="calendar" role="dialog"><button type="button">2026</button>${Array.from({ length: 12 }, (_, index) => `<button type="button">${index + 1}월</button>`).join("")}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("#target")!;
    expect(() =>
      createCalendarApproval({
        target,
        targetYearMonth: "2026-03",
        originalDate: "2026-02-31",
      }),
    ).toThrow();
    expect(() =>
      createCalendarApproval({
        target,
        targetYearMonth: "2026-3",
        originalDate: "2026-03-15",
      }),
    ).toThrow();
  });

  it("rejects a target when its readonly calendar surface becomes stale", () => {
    document.body.innerHTML = `<section><input id="target" type="text" readonly><button type="button" aria-labelledby="target" aria-controls="calendar">월 선택</button><div id="calendar" role="dialog"><button type="button">2026</button>${Array.from({ length: 12 }, (_, index) => `<button type="button">${index + 1}월</button>`).join("")}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("#target")!;
    const approval = createCalendarApproval({
      target,
      originalDate: "2026-03-15",
      targetYearMonth: "2026-03",
    });
    target.readOnly = false;
    expect(revalidateCalendarApproval(approval)).toMatchObject({
      status: "invalid",
    });
  });

  it("keeps approval valid when month selection changes popup state", () => {
    document.body.innerHTML = `<section><input id="target" type="text" readonly><button type="button" aria-labelledby="target" aria-controls="calendar">월 선택</button><div id="calendar" role="dialog"><button type="button">2026</button>${Array.from({ length: 12 }, (_, index) => `<button type="button">${index + 1}월</button>`).join("")}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("#target")!;
    const popup = document.querySelector<HTMLElement>("#calendar")!;
    const approval = createCalendarApproval({
      target,
      originalDate: "2026-03-15",
      targetYearMonth: "2026-03",
    });
    popup.querySelectorAll("button")[3]!.setAttribute("aria-selected", "true");
    popup.setAttribute("data-state", "closed");

    expect(revalidateCalendarApproval(approval)).toEqual({ status: "valid" });
  });

  it("does not accept a fallback calendar surface with fewer than twelve months", () => {
    document.body.innerHTML = `<section><input id="target" type="text" readonly><button type="button" aria-labelledby="target" aria-controls="calendar">월 선택</button><div id="calendar" role="dialog"><button type="button">2026</button><button type="button">3월</button></div></section>`;
    const target = document.querySelector<HTMLInputElement>("#target")!;

    expect(() =>
      createCalendarApproval({
        target,
        originalDate: "2026-03-15",
        targetYearMonth: "2026-03",
      }),
    ).toThrow();
  });

  it("rejects approval when its exact date or profile identity is changed", () => {
    document.body.innerHTML = `<section data-item-id="row-1"><input id="target" type="text" readonly><button type="button" aria-labelledby="target" aria-controls="calendar">월 선택</button><div id="calendar" role="dialog"><button type="button">2026</button>${Array.from({ length: 12 }, (_, index) => `<button type="button">${index + 1}월</button>`).join("")}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("#target")!;
    const approval = createCalendarApproval({
      target,
      originalDate: "2026-03-15",
      targetYearMonth: "2026-03",
      profileFieldKey: "experience.experience.availableMonth",
      profileEntryId: "experience-1",
      itemIndex: 2,
      repeatRow: { itemId: "row-1", itemIndex: 2 },
    });
    approval.originalDate = "2026-03-16";
    approval.profileFieldKey = "other.field";

    expect(revalidateCalendarApproval(approval)).toMatchObject({
      status: "invalid",
    });
  });
});
