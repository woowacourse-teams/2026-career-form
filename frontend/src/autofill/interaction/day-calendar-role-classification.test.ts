import { afterEach, expect, it, vi } from "vitest";
import { executeDayCalendarSelection } from "./day-calendar-executor";
import { installUiDatepicker } from "./ui-datepicker.test-fixtures";
import type { InteractionDecisionProvider } from "../api/interaction-types";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
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
