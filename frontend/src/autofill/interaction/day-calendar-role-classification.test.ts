import { afterEach, expect, it, vi } from "vitest";
import { executeDayCalendarSelection } from "./day-calendar-executor";
import { installUiDatepicker } from "./ui-datepicker.test-fixtures";
import type { InteractionDecisionProvider } from "../api/interaction-types";
import {
  displayedDayCalendarRoots,
  rememberedCalendarRoots,
} from "./day-calendar-surface";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

it.each(["CALENDAR_YEAR_CONTROL", "CALENDAR_MONTH_CONTROL"])(
  "closes the calendar it opened when the %s role is abstained",
  async (abstainedRole) => {
    vi.useFakeTimers();
    document.body.innerHTML = `<label>입사일<input readonly type="text" placeholder="YYYY-MM-DD"></label>`;
    const target = document.querySelector("input");
    if (!target) throw new Error("Missing target");
    installUiDatepicker(document).attach(target, {
      trigger: true,
      yearRange: [2020, 2026],
      defaultDate: "2020-01-01",
    });
    const provider: InteractionDecisionProvider = async (request) => ({
      schemaVersion: 2,
      snapshotId: request.snapshotId,
      status: "COMPLETE",
      mode: "GENERIC",
      decisions: request.decisions.map((decision) => ({
        decisionId: decision.decisionId,
        role: decision.role,
        selection: decision.role === abstainedRole ? "ABSTAINED" : "SELECTED",
        candidateId:
          decision.role === abstainedRole
            ? null
            : decision.candidates[0]?.candidateId,
      })),
    });
    const pending = executeDayCalendarSelection({
      target,
      targetDate: "2024-02-29",
      interactionDecisionProvider: provider,
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe("needs-verification");
    expect(target.value).toBe("");
    expect(displayedDayCalendarRoots(document)).toEqual([]);
  },
);

it("waits until a calendar that closes late is hidden before it reports the abstained role", async () => {
  vi.useFakeTimers();
  document.body.innerHTML = `<label>입사일<input readonly type="text" placeholder="YYYY-MM-DD"></label>`;
  const target = document.querySelector("input");
  if (!target) throw new Error("Missing target");
  installUiDatepicker(document).attach(target, {
    trigger: true,
    yearRange: [2020, 2026],
    defaultDate: "2020-01-01",
    closeDelayMs: 200,
  });
  const provider: InteractionDecisionProvider = async (request) => ({
    schemaVersion: 2,
    snapshotId: request.snapshotId,
    status: "COMPLETE",
    mode: "GENERIC",
    decisions: request.decisions.map((decision) => ({
      decisionId: decision.decisionId,
      role: decision.role,
      selection:
        decision.role === "CALENDAR_YEAR_CONTROL" ? "ABSTAINED" : "SELECTED",
      candidateId:
        decision.role === "CALENDAR_YEAR_CONTROL"
          ? null
          : decision.candidates[0]?.candidateId,
    })),
  });
  let shownAtResult: number | undefined;
  const pending = executeDayCalendarSelection({
    target,
    targetDate: "2024-02-29",
    interactionDecisionProvider: provider,
  }).then((result) => {
    shownAtResult = displayedDayCalendarRoots(document).length;
    return result;
  });
  await vi.runAllTimersAsync();
  expect((await pending).status).toBe("needs-verification");
  expect(shownAtResult).toBe(0);
});

it("remembers the calendar it opened as a widget root after it gives up", async () => {
  vi.useFakeTimers();
  document.body.innerHTML = `<label>입사일<input readonly type="text" placeholder="YYYY-MM-DD"></label>`;
  const target = document.querySelector("input");
  if (!target) throw new Error("Missing target");
  const picker = installUiDatepicker(document);
  picker.attach(target, {
    trigger: true,
    yearRange: [2020, 2026],
    defaultDate: "2020-01-01",
  });
  const provider: InteractionDecisionProvider = async (request) => ({
    schemaVersion: 2,
    snapshotId: request.snapshotId,
    status: "COMPLETE",
    mode: "GENERIC",
    decisions: request.decisions.map((decision) => ({
      decisionId: decision.decisionId,
      role: decision.role,
      selection:
        decision.role === "CALENDAR_YEAR_CONTROL" ? "ABSTAINED" : "SELECTED",
      candidateId:
        decision.role === "CALENDAR_YEAR_CONTROL"
          ? null
          : decision.candidates[0]?.candidateId,
    })),
  });
  const pending = executeDayCalendarSelection({
    target,
    targetDate: "2024-02-29",
    interactionDecisionProvider: provider,
  });
  await vi.runAllTimersAsync();
  expect((await pending).status).toBe("needs-verification");
  // Hidden now, its year/month selects still belong to the widget.
  expect(rememberedCalendarRoots(document)).toEqual([picker.root]);
  picker.root.remove();
  expect(rememberedCalendarRoots(document)).toEqual([]);
});

it.each([false, true])(
  "requires opaque day-role classification before committing (abstain=%s)",
  async (abstain) => {
    vi.useFakeTimers();
    document.body.innerHTML = `<label>입사일<input readonly type="text" placeholder="YYYY-MM-DD"></label>`;
    const target = document.querySelector("input");
    if (!target) throw new Error("Missing target");
    installUiDatepicker(document).attach(target, {
      trigger: true,
      yearRange: [2020, 2026],
      defaultDate: "2020-01-01",
    });
    const roles: string[] = [];
    const provider: InteractionDecisionProvider = async (request) => {
      roles.push(...request.decisions.map((decision) => decision.role));
      return {
        schemaVersion: 2,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        mode: "GENERIC",
        decisions: request.decisions.map((decision) => ({
          decisionId: decision.decisionId,
          role: decision.role,
          selection:
            abstain && decision.role === "CALENDAR_DAY_CONTROL"
              ? "ABSTAINED"
              : "SELECTED",
          candidateId:
            abstain && decision.role === "CALENDAR_DAY_CONTROL"
              ? null
              : decision.candidates[0]?.candidateId,
        })),
      };
    };
    const pending = executeDayCalendarSelection({
      target,
      targetDate: "2024-02-29",
      interactionDecisionProvider: provider,
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.status).toBe(abstain ? "needs-verification" : "completed");
    expect(target.value).toBe(abstain ? "" : "2024-02-29");
    expect(roles).toEqual([
      "CALENDAR_OPENER",
      "CALENDAR_YEAR_CONTROL",
      "CALENDAR_NAVIGATION",
      "CALENDAR_MONTH_CONTROL",
      "CALENDAR_DAY_CONTROL",
    ]);
  },
);
