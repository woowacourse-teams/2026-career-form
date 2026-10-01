import { afterEach, describe, expect, it } from "vitest";
import { calendarSurfaceFor } from "./calendar-surface";
import { dayCalendarSurfaceFor } from "./day-calendar-surface";
import { executeCalendarSelection } from "./calendar-executor";
import { resolveCalendarRole } from "./calendar-role-resolver";

afterEach(() => document.body.replaceChildren());

function deferredTarget(attributes: string) {
  document.body.innerHTML = `<section><label for="calendar-target">입학년월</label><input id="calendar-target" type="text" readonly ${attributes}><img class="ui-datepicker-trigger"></section><div id="ui-datepicker-div" class="ui-datepicker" style="display:none"></div>`;
  const target = document.querySelector("input");
  if (!target) throw new Error("Missing fixture target");
  return target;
}

describe("calendar unit evidence", () => {
  it("does not infer a month from an input class and an empty shared root", () => {
    const target = deferredTarget(`class="monthpicker hasDatepicker"`);
    expect(calendarSurfaceFor(target)).toBeUndefined();
  });

  it("recognizes an explicit month format without a monthpicker input class", () => {
    const target = deferredTarget(
      `class="hasDatepicker" placeholder="YYYY-MM"`,
    );
    expect(calendarSurfaceFor(target)?.rendering).toBe("deferred-jquery");
  });

  it("does not reinterpret a class-only focus calendar as a day field", () => {
    document.body.innerHTML = `<label for="target">기간 시작</label><input id="target" type="text" readonly placeholder="2001-02" class="input_month unqulifyinput input_st01 input_calender hasDatepicker"><select><option>Unrelated</option></select><div id="ui-datepicker-div" class="ui-datepicker" style="display:none"></div>`;
    const target = document.querySelector("input");
    if (!target) throw new Error("Missing fixture target");
    expect(calendarSurfaceFor(target)).toBeUndefined();
    expect(dayCalendarSurfaceFor(target)).toBeUndefined();
  });
});

describe("calendar decision boundary", () => {
  it("rejects provider instructions even when the opaque candidate matches", async () => {
    const element = document.createElement("button");
    document.body.append(element);
    const selected = await resolveCalendarRole({
      role: "CALENDAR_OPENER",
      evidence: {
        unit: "month",
        unitEvidence: "month-options",
        ownership: "single-field",
      },
      candidates: [{ candidateId: "c1", element }],
      canonicalFieldKey: "calendar-month",
      deadline: Date.now() + 1000,
      provider: async (request) => ({
        schemaVersion: 2,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        mode: "GENERIC",
        decisions: [
          {
            decisionId: "calendar-role",
            role: "CALENDAR_OPENER",
            selection: "SELECTED",
            candidateId: "c1",
            procedure: "click",
          },
        ],
      }),
    });
    expect(selected).toBeUndefined();
  });

  it("does not click after the provider introduces an existing target value", async () => {
    const target = deferredTarget(
      `class="monthpicker hasDatepicker" placeholder="YYYY-MM"`,
    );
    const opener = target.nextElementSibling;
    let clicks = 0;
    opener?.addEventListener("click", () => clicks++);
    const result = await executeCalendarSelection({
      target,
      targetYearMonth: "2026-03",
      interactionDecisionProvider: async (request) => {
        target.value = "2025-01";
        const decision = request.decisions[0];
        if (!decision) throw new Error("Missing role");
        return {
          schemaVersion: 2,
          snapshotId: request.snapshotId,
          status: "COMPLETE",
          mode: "GENERIC",
          decisions: [
            {
              decisionId: decision.decisionId,
              role: decision.role,
              selection: "SELECTED",
              candidateId: decision.candidates[0]?.candidateId,
            },
          ],
        };
      },
    });
    expect(result.status).toBe("needs-verification");
    expect(clicks).toBe(0);
    expect(target.value).toBe("2025-01");
  });
});
