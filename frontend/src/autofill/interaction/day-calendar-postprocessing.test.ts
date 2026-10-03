import { afterEach, expect, it, vi } from "vitest";
import type { InteractionDecisionProvider } from "../api/interaction-types";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
import { executeDayCalendarSelection } from "./day-calendar-executor";
import { installUiDatepicker } from "./ui-datepicker.test-fixtures";

afterEach(() => {
  setAutofillDebugEnabled(false);
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it.each([false, true])(
  "completes day selection after positioning postprocessing during the year request (postprocess=%s)",
  async (postprocess) => {
    // Given: shared, initially empty day popup and a pending year decision.
    vi.useFakeTimers();
    setAutofillDebugEnabled(true);
    const diagnostic = vi.spyOn(console, "debug").mockImplementation(() => {});
    document.body.innerHTML = `<label>입사일<input readonly type="text" placeholder="YYYY-MM-DD"></label><input id="peer" value="synthetic-preserved">`;
    const target = document.querySelector("input");
    const peer = document.querySelector<HTMLInputElement>("#peer");
    if (!target || !peer) throw new Error("Missing synthetic inputs");
    const picker = installUiDatepicker(document);
    picker.attach(target, {
      trigger: true,
      yearRange: [2020, 2026],
      defaultDate: "2020-01-01",
    });
    let notifyYear = () => {};
    const yearRequested = new Promise<void>((resolve) => {
      notifyYear = resolve;
    });
    let releaseYear = () => {};
    const yearResponse = new Promise<void>((resolve) => {
      releaseYear = resolve;
    });
    const roles: string[] = [];
    let navigationClicks = 0;
    const provider: InteractionDecisionProvider = async (request) => {
      roles.push(request.decisions[0]?.role ?? "");
      if (request.decisions[0]?.role === "CALENDAR_YEAR_CONTROL") {
        picker.root
          .querySelectorAll("a[data-handler=prev], a[data-handler=next]")
          .forEach((link) =>
            link.addEventListener("click", () => navigationClicks++),
          );
        notifyYear();
        await yearResponse;
      }
      return {
        schemaVersion: 2,
        snapshotId: request.snapshotId,
        status: "COMPLETE",
        mode: "GENERIC",
        decisions: request.decisions.map((decision) => ({
          decisionId: decision.decisionId,
          role: decision.role,
          selection:
            decision.role === "CALENDAR_NAVIGATION" ? "ABSTAINED" : "SELECTED",
          candidateId:
            decision.role === "CALENDAR_NAVIGATION"
              ? null
              : decision.candidates[0]?.candidateId,
        })),
      };
    };

    // When: the site's 1ms postprocessing runs while the model is pending.
    const pending = executeDayCalendarSelection({
      target,
      targetDate: "2024-02-29",
      interactionDecisionProvider: provider,
    });
    await yearRequested;
    const year = picker.root.querySelector<HTMLSelectElement>(
      ".ui-datepicker-year",
    );
    const title = picker.root.querySelector<HTMLElement>(
      ".ui-datepicker-title",
    );
    const header = picker.root.querySelector<HTMLElement>(
      ".ui-datepicker-header",
    );
    if (!year || !title || !header) throw new Error("Missing day header");
    const original = year.outerHTML;
    if (postprocess) {
      setTimeout(() => {
        for (const direction of ["previous", "next"]) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = `${direction} year`;
          button.addEventListener("click", () => navigationClicks++);
          header.append(button);
        }
        header.append(title);
        picker.root
          .querySelectorAll<HTMLElement>(
            ".ui-datepicker-prev, .ui-datepicker-next, .ui-datepicker-month",
          )
          .forEach((element) => {
            element.style.position = "absolute";
            element.style.top = "5px";
            element.style.left = "100px";
          });
        year.style.position = "absolute";
        year.style.top = "5px";
        year.style.left = "200px";
      }, 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(year.outerHTML).not.toBe(original);
      expect(year.value).toBe("2020");
      expect(year.options.length).toBe(7);
    }
    releaseYear();
    await vi.runAllTimersAsync();

    // Then: no unused navigation authority is exercised; exact day persists.
    expect(await pending).toEqual({
      status: "completed",
      targetDate: "2024-02-29",
    });
    expect(target.value).toBe("2024-02-29");
    expect(peer.value).toBe("synthetic-preserved");
    expect(picker.isOpen()).toBe(false);
    expect(navigationClicks).toBe(0);
    expect(roles).toEqual([
      "CALENDAR_OPENER",
      "CALENDAR_YEAR_CONTROL",
      "CALENDAR_MONTH_CONTROL",
      "CALENDAR_DAY_CONTROL",
    ]);
    expect(diagnostic).not.toHaveBeenCalledWith(
      "[CareerForm] calendar-role",
      expect.objectContaining({ reason: "stale" }),
    );
  },
);
