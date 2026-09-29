import { afterEach, describe, expect, it } from "vitest";
import {
  DAY_CALENDAR_MAX_ACTIVATIONS,
  executeDayCalendarSelection,
  type ExecuteDayCalendarSelectionArgs,
} from "./day-calendar-executor";
import {
  installUiDatepicker,
  type UiDatepickerOptions,
} from "./ui-datepicker.test-fixtures";

afterEach(() => {
  document.body.replaceChildren();
  window.location.hash = "";
});

const FAST = { openWaitMs: 200, closeWaitMs: 300, retentionMs: 80 };

function setup(options: Partial<UiDatepickerOptions> = {}, value = "") {
  document.body.innerHTML = `
    <section aria-label="합성 경력">
      <label>입사일 <input id="start" type="text" readonly value="${value}"></label>
      <label>메모 <input id="memo" type="text" value="유지"></label>
    </section>`;
  const target = document.querySelector<HTMLInputElement>("#start")!;
  const memo = document.querySelector<HTMLInputElement>("#memo")!;
  const picker = installUiDatepicker(document);
  picker.attach(target, {
    yearRange: [2015, 2026],
    defaultDate: "2020-06-15",
    ...options,
  });
  return { target, memo, picker };
}

function run(
  target: HTMLInputElement,
  targetDate: string,
  extra: Partial<ExecuteDayCalendarSelectionArgs> = {},
) {
  return executeDayCalendarSelection({
    target,
    targetDate,
    timings: FAST,
    ...extra,
  });
}

describe("executeDayCalendarSelection", () => {
  it("selects the exact leap day through the year select, 0-based month select and day link", async () => {
    const { target, memo, picker } = setup({ trigger: true });

    const result = await run(target, "2024-02-29");

    expect(result).toEqual({ status: "completed", targetDate: "2024-02-29" });
    expect(target.value).toBe("2024-02-29");
    expect(memo.value).toBe("유지");
    expect(picker.isOpen()).toBe(false);
    expect(window.location.hash).toBe("");
  });

  it("opens by focusing the target and handles the December (11) boundary in a dotted format", async () => {
    const { target } = setup({ dateFormat: "yy.mm.dd" });

    const result = await run(target, "2023-12-31", {
      targetFormat: "YYYY.MM.DD",
    });

    expect(result).toEqual({ status: "completed", targetDate: "2023-12-31" });
    expect(target.value).toBe("2023.12.31");
  });

  it("handles the January (0) boundary and month-end day", async () => {
    const { target } = setup({ trigger: true, hideDelayMs: 40 });

    await expect(run(target, "2021-01-31")).resolves.toEqual({
      status: "completed",
      targetDate: "2021-01-31",
    });
    expect(target.value).toBe("2021-01-31");
  });

  it("does not select a same-numbered day that belongs to a neighboring month", async () => {
    const { target } = setup({ trigger: true, showOtherMonths: true });

    await expect(run(target, "2022-03-29")).resolves.toMatchObject({
      status: "completed",
    });
    expect(target.value).toBe("2022-03-29");
  });

  it.each([
    ["2023-02-29", "invalid_target_date"],
    ["2023-13-01", "invalid_target_date"],
    ["2023-1-01", "invalid_target_date"],
  ])("rejects the impossible date %s before opening", async (date, reason) => {
    const { target, picker } = setup({ trigger: true });

    await expect(run(target, date)).resolves.toEqual({
      status: "needs-verification",
      reason,
    });
    expect(picker.isOpen()).toBe(false);
  });

  it("holds a disabled day without writing", async () => {
    const { target } = setup({
      trigger: true,
      disabledDates: ["2024-02-29"],
    });

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "target_day_disabled",
    });
    expect(target.value).toBe("");
  });

  it("holds a day outside the widget date range", async () => {
    const { target } = setup({ trigger: true, maxDate: "2024-02-20" });

    await expect(run(target, "2024-02-25")).resolves.toEqual({
      status: "needs-verification",
      reason: "target_day_disabled",
    });
    expect(target.value).toBe("");
  });

  it("holds a year outside the year select", async () => {
    const { target } = setup({ trigger: true });

    await expect(run(target, "2010-05-01")).resolves.toEqual({
      status: "needs-verification",
      reason: "target_year_unavailable",
    });
  });

  it("holds a month outside the month select", async () => {
    const { target } = setup({ trigger: true, minDate: "2024-06-01" });

    await expect(run(target, "2024-03-10")).resolves.toEqual({
      status: "needs-verification",
      reason: "target_month_unavailable",
    });
  });

  it("refuses a month select whose values are not 0-11 with matching labels", async () => {
    const { target } = setup({ trigger: true, monthValueBase: 1 });

    await expect(run(target, "2024-03-10")).resolves.toEqual({
      status: "needs-verification",
      reason: "month_select_unrecognized",
    });
    expect(target.value).toBe("");
  });

  it("accepts English short month labels", async () => {
    const { target } = setup({
      trigger: true,
      monthLabels: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
    });

    await expect(run(target, "2019-11-30")).resolves.toMatchObject({
      status: "completed",
    });
  });

  it("refuses unparseable month labels", async () => {
    const { target } = setup({
      trigger: true,
      monthLabels: Array.from({ length: 12 }, (_, i) => `M${i}`),
    });

    await expect(run(target, "2019-11-30")).resolves.toEqual({
      status: "needs-verification",
      reason: "month_select_unrecognized",
    });
  });

  it("preserves an existing value", async () => {
    const { target, picker } = setup({ trigger: true }, "2020-01-01");

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "existing_value",
    });
    expect(target.value).toBe("2020-01-01");
    expect(picker.isOpen()).toBe(false);
  });

  it("holds when a datepicker is already open", async () => {
    const { target, picker } = setup({ trigger: true });
    picker.root.style.display = "block";

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "calendar_already_open",
    });
  });

  it("holds when more than one datepicker root exists", async () => {
    const { target } = setup({ trigger: true });
    installUiDatepicker(document);

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "unverified_calendar_surface",
    });
  });

  it("holds when the opener does not open the shared calendar", async () => {
    document.body.innerHTML = `<input id="start" class="hasDatepicker" type="text" readonly><div class="ui-datepicker" style="display:none"></div>`;
    const target = document.querySelector<HTMLInputElement>("#start")!;

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "owned_calendar_not_opened",
    });
  });

  it("holds when the opened calendar has no recognizable year select", async () => {
    const { target, picker } = setup({ trigger: true });
    document
      .querySelector(".ui-datepicker-trigger")!
      .addEventListener("click", () =>
        picker.root.querySelector(".ui-datepicker-year")?.remove(),
      );

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "calendar_header_unavailable",
    });
  });

  it("holds when the widget writes a different day", async () => {
    const { target } = setup({
      trigger: true,
      mutateSelection: () => "2024-02-28",
    });

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "target_value_not_retained",
    });
  });

  it("holds when the written format differs from the approved format", async () => {
    const { target } = setup({ trigger: true, dateFormat: "yy.mm.dd" });

    await expect(
      run(target, "2024-02-29", { targetFormat: "YYYY-MM-DD" }),
    ).resolves.toEqual({
      status: "needs-verification",
      reason: "target_value_not_retained",
    });
  });

  it("holds when the value is cleared during the retention window", async () => {
    const { target } = setup({ trigger: true, clearAfterMs: 30 });

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "target_value_not_retained",
    });
  });

  it("holds when another input changes", async () => {
    const { target, memo } = setup({ trigger: true });
    target.addEventListener("change", () => {
      memo.value = "변경";
    });

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "other_input_changed",
    });
  });

  it("holds when the calendar stays open", async () => {
    const { target } = setup({ trigger: true, hideDelayMs: 5_000 });

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "popup_not_closed",
    });
  });

  it("holds when the target is replaced during selection", async () => {
    const { target } = setup({ trigger: true });
    document
      .querySelector(".ui-datepicker-trigger")!
      .addEventListener("click", () => target.replaceWith(target.cloneNode()));

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "stale_target",
    });
  });

  it("refuses a day link that would navigate", async () => {
    const { target } = setup({ trigger: true, dayHref: "/next-page" });

    await expect(run(target, "2024-02-29")).resolves.toEqual({
      status: "needs-verification",
      reason: "unsafe_day_link",
    });
    expect(target.value).toBe("");
  });

  it("stops when aborted", async () => {
    const { target, picker } = setup({ trigger: true });
    const controller = new AbortController();
    controller.abort();

    await expect(
      run(target, "2024-02-29", { signal: controller.signal }),
    ).resolves.toEqual({
      status: "needs-verification",
      reason: "calendar_aborted",
    });
    expect(picker.isOpen()).toBe(false);
  });

  it("stops when aborted after opening", async () => {
    const { target } = setup({ trigger: true });
    const controller = new AbortController();
    document
      .querySelector(".ui-datepicker-trigger")!
      .addEventListener("click", () => controller.abort());

    await expect(
      run(target, "2024-02-29", { signal: controller.signal }),
    ).resolves.toEqual({
      status: "needs-verification",
      reason: "calendar_aborted",
    });
    expect(target.value).toBe("");
  });

  it("stops when the time budget is exhausted", async () => {
    const { target } = setup({ trigger: true });
    let time = 0;

    await expect(
      run(target, "2024-02-29", { now: () => (time += 10_000) }),
    ).resolves.toEqual({
      status: "needs-verification",
      reason: "calendar_budget_exhausted",
    });
    expect(target.value).toBe("");
  });

  it("keeps the activation budget small enough for one selection", () => {
    expect(DAY_CALENDAR_MAX_ACTIVATIONS).toBeGreaterThanOrEqual(4);
  });
});
