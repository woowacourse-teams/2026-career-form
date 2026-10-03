import { afterEach, expect, it, vi } from "vitest";
import type {
  InteractionDecisionProvider,
  InteractionDecisionRequest,
  InteractionDecisionResponse,
} from "../api/interaction-types";
import { executeCalendarSelection } from "./calendar-executor";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function fixture() {
  document.body.innerHTML = `<section><label for="target">입학년월</label><input id="target" readonly type="text" maxlength="7" class="alternate-calendar-input hasDatepicker"><img class="ui-datepicker-trigger"></section><input id="other" value="keep"><div id="ui-datepicker-div" class="ui-datepicker" style="display:none"></div>`;
  const target = document.querySelector<HTMLInputElement>("#target");
  const popup = document.querySelector<HTMLElement>("#ui-datepicker-div");
  const opener = document.querySelector<HTMLElement>("img");
  if (!target || !popup || !opener) throw new Error("Missing fixture");
  let year = "2025",
    month = "0";
  const events: string[] = [];
  const render = () => {
    popup.innerHTML = `<a href="#" data-handler="prev">Previous</a><a href="#" data-handler="next">Next</a><select class="ui-datepicker-year"><option>2025</option><option>2026</option></select><select class="ui-datepicker-month">${Array.from({ length: 12 }, (_, index) => `<option value="${index}">${index + 1}월</option>`).join("")}</select><table class="ui-datepicker-calendar" style="display:none"><tbody><tr><td>1</td></tr></tbody></table><button type="button" class="ui-datepicker-close" data-handler="hide">Close</button>`;
    popup
      .querySelectorAll("a")
      .forEach((link) =>
        link.addEventListener("click", () => events.push("navigation")),
      );
    const selects = popup.querySelectorAll("select");
    const yearSelect = selects[0],
      monthSelect = selects[1];
    if (!yearSelect || !monthSelect) throw new Error("Missing header");
    yearSelect.value = year;
    monthSelect.value = month;
    yearSelect.addEventListener("change", () => {
      events.push("year");
      year = yearSelect.value;
      render();
    });
    monthSelect.addEventListener("change", () => {
      events.push("month");
      month = monthSelect.value;
      render();
    });
    popup.querySelector("button")?.addEventListener("click", () => {
      events.push("apply");
      target.value = `${year}-${String(Number(month) + 1).padStart(2, "0")}`;
      popup.style.display = "none";
    });
  };
  opener.addEventListener("click", () => {
    events.push("open");
    popup.style.display = "block";
    render();
  });
  return { target, popup, events };
}

function selected(
  request: InteractionDecisionRequest,
): InteractionDecisionResponse {
  return {
    schemaVersion: 2,
    snapshotId: request.snapshotId,
    status: "COMPLETE",
    mode: "GENERIC",
    decisions: request.decisions.map((decision) => ({
      decisionId: decision.decisionId,
      role: decision.role,
      selection: "SELECTED",
      candidateId: decision.candidates[0]?.candidateId,
    })),
  };
}

it("classifies structural year/month/apply controls with four bounded calls and no date disclosure", async () => {
  vi.useFakeTimers();
  const { target, events } = fixture();
  const requests: InteractionDecisionRequest[] = [];
  const pending = executeCalendarSelection({
    target,
    targetYearMonth: "2026-03",
    interactionDecisionProvider: async (request) => {
      requests.push(request);
      return selected(request);
    },
  });
  await vi.runAllTimersAsync();
  expect(await pending).toEqual({
    status: "completed",
    targetYearMonth: "2026-03",
  });
  expect(events).toEqual(["open", "year", "month", "apply"]);
  expect(
    requests.flatMap((request) =>
      request.decisions.map((decision) => decision.role),
    ),
  ).toEqual([
    "CALENDAR_OPENER",
    "CALENDAR_YEAR_CONTROL",
    "CALENDAR_NAVIGATION",
    "CALENDAR_MONTH_CONTROL",
    "CALENDAR_APPLY",
  ]);
  const payload = JSON.stringify(requests.map((request) => request.decisions));
  expect(payload).not.toMatch(
    /2026|2025|2026-03|입학년월|ui-datepicker|<select/,
  );
  expect(
    requests[1]?.decisions[0]?.candidates[0]?.calendarStructure,
  ).toMatchObject({
    tag: "select",
    activation: "change",
    valueShape: "year-options",
    unit: "month",
  });
});

it.each(["ABSTAINED", "error", "stale", "other-field", "visible-grid"])(
  "stops before selecting a date on %s",
  async (failure) => {
    const { target, popup, events } = fixture();
    const provider: InteractionDecisionProvider = async (request) => {
      if (request.decisions[0]?.role !== "CALENDAR_OPENER") {
        if (failure === "error") throw new Error("private provider payload");
        if (failure === "stale")
          popup
            .querySelector("select")
            ?.replaceWith(document.createElement("select"));
        if (failure === "other-field") {
          const other = document.querySelector<HTMLInputElement>("#other");
          if (other) other.value = "changed";
        }
        if (failure === "visible-grid") {
          const table = popup.querySelector("table");
          if (table) table.style.display = "table";
        }
        if (failure === "ABSTAINED")
          return {
            ...selected(request),
            decisions: request.decisions.map((decision) => ({
              decisionId: decision.decisionId,
              role: decision.role,
              selection: "ABSTAINED",
              candidateId: null,
            })),
          };
      }
      return selected(request);
    };
    const result = await executeCalendarSelection({
      target,
      targetYearMonth: "2026-03",
      interactionDecisionProvider: provider,
    });
    expect(result.status).toBe("needs-verification");
    expect(events).toEqual(["open"]);
    expect(target.value).toBe("");
  },
);

it.each([
  ["CALENDAR_NAVIGATION", ["open", "year", "month", "apply"]],
  ["CALENDAR_YEAR_CONTROL", ["open"]],
  ["CALENDAR_MONTH_CONTROL", ["open", "year"]],
  ["CALENDAR_APPLY", ["open", "year", "month"]],
] as const)(
  "does not let observation-only abstention authorize or veto required selection: %s",
  async (abstainedRole, expectedEvents) => {
    vi.useFakeTimers();
    const { target, events } = fixture();
    const pending = executeCalendarSelection({
      target,
      targetYearMonth: "2026-03",
      interactionDecisionProvider: async (request) => ({
        ...selected(request),
        decisions: selected(request).decisions.map((decision) =>
          decision.role === abstainedRole
            ? { ...decision, selection: "ABSTAINED", candidateId: null }
            : decision,
        ),
      }),
    });

    await vi.runAllTimersAsync();
    const result = await pending;
    const completes = abstainedRole === "CALENDAR_NAVIGATION";
    expect(result.status).toBe(completes ? "completed" : "needs-verification");
    expect(target.value).toBe(completes ? "2026-03" : "");
    expect(events).toEqual(expectedEvents);
    expect(events).not.toContain("navigation");
  },
);
