import { afterEach, describe, expect, it } from "vitest";
import { executeCalendarSelection } from "./calendar-executor";

afterEach(() => {
  document.body.innerHTML = "";
});

const months = Array.from(
  { length: 12 },
  (_, index) =>
    `<button data-month="${index + 1}">${new Date(2026, index).toLocaleString("en", { month: "long" })}</button>`,
).join("");

describe("calendar executor", () => {
  it("clicks only the approved year and month then verifies the retained target value", async () => {
    document.body.innerHTML = `<section><input readonly type="text"><button type="button">월 선택</button><div role="dialog"><button data-year="2026">2026</button>${months}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("input")!;
    const year = document.querySelector<HTMLButtonElement>("[data-year]");
    const month = document.querySelector<HTMLButtonElement>("[data-month='3']");
    year!.addEventListener("click", () =>
      year!.setAttribute("aria-pressed", "true"),
    );
    month!.addEventListener("click", () => {
      target.setAttribute("data-rendered-value", "2026-03");
      document.querySelector("[role='dialog']")?.remove();
    });
    const result = await executeCalendarSelection({
      target,
      targetYearMonth: "2026-03",
      readTargetValue: (input) =>
        input.getAttribute("data-rendered-value") ?? "",
    });
    expect(result.status).toBe("completed");
    expect(year!.getAttribute("aria-pressed")).toBe("true");
  });

  it("opens an inspected hidden ARIA-linked popup before choosing only the approved month", async () => {
    document.body.innerHTML = `<section><input id="start-month" readonly type="text"><button type="button" aria-labelledby="start-month" aria-controls="month-picker">월 선택</button><div id="month-picker" role="dialog" hidden><button>2026</button>${months}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("input")!;
    const popup = document.querySelector<HTMLElement>("#month-picker")!;
    const opener =
      document.querySelector<HTMLButtonElement>("[aria-controls]")!;
    const clicked = new Set<string>();
    opener.addEventListener("click", () => popup.removeAttribute("hidden"));
    popup
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((button) =>
        button.addEventListener("click", () =>
          clicked.add(button.dataset.month ?? button.textContent!),
        ),
      );
    popup
      .querySelector<HTMLButtonElement>("[data-month='3']")!
      .addEventListener("click", () => {
        target.setAttribute("data-rendered-value", "2026-03");
        popup.setAttribute("hidden", "");
      });

    await expect(
      executeCalendarSelection({
        target,
        targetYearMonth: "2026-03",
        readTargetValue: (input) =>
          input.getAttribute("data-rendered-value") ?? "",
      }),
    ).resolves.toEqual({ status: "completed", targetYearMonth: "2026-03" });

    expect(clicked).toEqual(new Set(["2026", "3"]));
    expect(popup.hidden).toBe(true);
  });

  it("safely stops when target month is absent or another input changes", async () => {
    document.body.innerHTML = `<section><input readonly type="text"><input id="other"><button type="button">월 선택</button><div role="dialog"><button>2026</button>${months}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("input")!;
    await expect(
      executeCalendarSelection({ target, targetYearMonth: "2026-03" }),
    ).resolves.toMatchObject({ status: "needs-verification" });
  });

  it("does not report completion until the owned popup closes", async () => {
    document.body.innerHTML = `<section><input readonly type="text"><button type="button">월 선택</button><div role="dialog"><button>2026</button>${months}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("input")!;
    document
      .querySelector("[data-month='3']")!
      .addEventListener("click", () =>
        target.setAttribute("data-rendered-value", "2026-03"),
      );
    await expect(
      executeCalendarSelection({
        target,
        targetYearMonth: "2026-03",
        readTargetValue: (input) =>
          input.getAttribute("data-rendered-value") ?? "",
      }),
    ).resolves.toMatchObject({
      status: "needs-verification",
      reason: "popup_not_closed",
    });
  });

  it("stops when the target is replaced while selecting", async () => {
    document.body.innerHTML = `<section><input readonly type="text"><button type="button">월 선택</button><div role="dialog"><button>2026</button>${months}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("input")!;
    document
      .querySelector("[data-year], button")
      ?.addEventListener("click", () => {
        const replacement = target.cloneNode() as HTMLInputElement;
        target.replaceWith(replacement);
      });
    await expect(
      executeCalendarSelection({ target, targetYearMonth: "2026-03" }),
    ).resolves.toMatchObject({
      status: "needs-verification",
      reason: "stale_target",
    });
  });

  it("uses the opener and year-list roles, then applies only an owned calendar control", async () => {
    document.body.innerHTML = `<section><input id="target" readonly type="text"><button type="button" aria-labelledby="target" aria-controls="picker">월 선택</button><div id="picker" role="dialog" hidden><button type="button" aria-haspopup="listbox" aria-controls="year-list">연도 선택</button><div id="year-list" role="listbox" hidden><button role="option">2026</button></div>${months}<button type="button" data-calendar-apply>적용</button></div><button type="submit">저장</button></section>`;
    const target = document.querySelector<HTMLInputElement>("input")!;
    const popup = document.querySelector<HTMLElement>("#picker")!;
    const yearList = document.querySelector<HTMLElement>("#year-list")!;
    const opener =
      document.querySelector<HTMLButtonElement>("[aria-labelledby]")!;
    const trigger =
      document.querySelector<HTMLButtonElement>("[aria-haspopup]")!;
    const year = yearList.querySelector<HTMLButtonElement>("button")!;
    const month = popup.querySelector<HTMLButtonElement>("[data-month='3']")!;
    const apply = popup.querySelector<HTMLButtonElement>(
      "[data-calendar-apply]",
    )!;
    let applied = false;
    opener.addEventListener("click", () => popup.removeAttribute("hidden"));
    trigger.addEventListener("click", () => yearList.removeAttribute("hidden"));
    year.addEventListener("click", () => yearList.setAttribute("hidden", ""));
    month.addEventListener("click", () =>
      target.setAttribute("data-rendered-value", "2026-03"),
    );
    apply.addEventListener("click", () => {
      applied = true;
      popup.setAttribute("hidden", "");
    });
    const roles: string[] = [];
    const result = await executeCalendarSelection({
      target,
      targetYearMonth: "2026-03",
      readTargetValue: (input) =>
        input.getAttribute("data-rendered-value") ?? "",
      interactionDecisionProvider: async (request) => {
        const decision = request.decisions[0]!;
        roles.push(decision.role);
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
              candidateId: decision.candidates[0]!.candidateId,
            },
          ],
        };
      },
    });

    expect(result).toEqual({ status: "completed", targetYearMonth: "2026-03" });
    expect(roles).toEqual(["CALENDAR_OPENER", "CALENDAR_YEAR_TRIGGER"]);
    expect(applied).toBe(true);
  });

  it("rejects a target value that the site reverts after the calendar closes", async () => {
    document.body.innerHTML = `<section><input readonly type="text"><button type="button">월 선택</button><div role="dialog"><button>2026</button>${months}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("input")!;
    const popup = document.querySelector<HTMLElement>("[role='dialog']")!;
    popup
      .querySelector<HTMLButtonElement>("[data-month='3']")!
      .addEventListener("click", () => {
        target.setAttribute("data-rendered-value", "2026-03");
        popup.setAttribute("hidden", "");
        setTimeout(() => target.setAttribute("data-rendered-value", ""), 0);
      });

    await expect(
      executeCalendarSelection({
        target,
        targetYearMonth: "2026-03",
        readTargetValue: (input) =>
          input.getAttribute("data-rendered-value") ?? "",
      }),
    ).resolves.toEqual({
      status: "needs-verification",
      reason: "target_value_not_retained",
    });
  });

  it("does not click an opener after its role decision is aborted", async () => {
    document.body.innerHTML = `<section><input readonly type="text"><button type="button">월 선택</button><div role="dialog"><button>2026</button>${months}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("input")!;
    const opener = document.querySelector<HTMLButtonElement>("button")!;
    const controller = new AbortController();
    let clicks = 0;
    opener.addEventListener("click", () => clicks++);
    const pending = executeCalendarSelection({
      target,
      targetYearMonth: "2026-03",
      signal: controller.signal,
      interactionDecisionProvider: () => new Promise(() => {}),
    });
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      status: "needs-verification",
    });
    expect(clicks).toBe(0);
  });
});
