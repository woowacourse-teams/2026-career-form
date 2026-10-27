import { afterEach, describe, expect, it } from "vitest";
import { calendarSurfaceFor } from "./calendar-surface";
import { dayCalendarSurfaceFor } from "./day-calendar-surface";
import { executeCalendarSelection } from "./calendar-executor";
import { executeDayCalendarSelection } from "./day-calendar-executor";
import {
  createCalendarApproval,
  revalidateCalendarApproval,
} from "../review/calendar-approval";
import {
  createDayCalendarApproval,
  revalidateDayCalendarApproval,
} from "../review/day-calendar-approval";

afterEach(() => {
  document.body.replaceChildren();
});

const FAST = { openWaitMs: 200, closeWaitMs: 300, retentionMs: 30 };

/** A portal month picker that mounts on open and unmounts on Escape. */
function installMonthPortal(
  target: HTMLInputElement,
  opener: HTMLElement,
  options: { roots?: number; separator?: string; kind?: "month" | "day" } = {},
) {
  const portals: HTMLElement[] = [];
  const close = () => portals.splice(0).forEach((portal) => portal.remove());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  opener.addEventListener("click", () => {
    if (portals.length) return close();
    for (let index = 0; index < (options.roots ?? 1); index++) {
      const portal = document.createElement("div");
      portal.className = "picker-portal";
      let year = 2026;
      if (options.kind === "day") {
        portal.innerHTML = `<select><option value="2025">2025</option><option value="2026" selected>2026</option></select><select>${Array.from({ length: 12 }, (_, m) => `<option value="${m}">${m + 1}월</option>`).join("")}</select><table>${Array.from({ length: 30 }, (_, d) => `<td><button type="button">${d + 1}</button></td>`).join("")}</table>`;
      } else {
        portal.innerHTML = `<button type="button" data-year="2025">2025</button><button type="button" data-year="2026">2026</button>${Array.from({ length: 12 }, (_, m) => `<button type="button" data-month="${m + 1}">${m + 1}월</button>`).join("")}`;
        portal
          .querySelectorAll<HTMLButtonElement>("[data-year]")
          .forEach((button) =>
            button.addEventListener("click", () => {
              year = Number(button.dataset.year);
            }),
          );
        portal
          .querySelectorAll<HTMLButtonElement>("[data-month]")
          .forEach((button) =>
            button.addEventListener("click", () => {
              target.value = `${year}${options.separator ?? "-"}${button.dataset.month!.padStart(2, "0")}`;
              close();
            }),
          );
      }
      document.body.append(portal);
      portals.push(portal);
    }
  });
  return { portals };
}

function monthField(extra = "", placeholder = "YYYY-MM") {
  document.body.innerHTML = `<form><div class="row"><div class="field"><label for="start">입사년월</label><div class="wrap"><input id="start" type="text" readonly placeholder="${placeholder}"></div>${extra}</div><div class="field"><label for="memo">메모</label><input id="memo" type="text" value="유지"></div></div></form>`;
  return document.querySelector<HTMLInputElement>("#start")!;
}

describe("deferred generic month calendar", () => {
  it("approves a readonly month field whose single icon opener mounts a portal on click", async () => {
    const target = monthField(
      `<button type="button" aria-label="달력 열기"></button>`,
    );
    const opener = document.querySelector<HTMLButtonElement>(".field button")!;
    const { portals } = installMonthPortal(target, opener);

    const surface = calendarSurfaceFor(target);
    expect(surface).toMatchObject({ opener, rendering: "deferred-generic" });
    const approval = createCalendarApproval({
      target,
      originalDate: "2025-03-15",
      targetYearMonth: "2025-03",
    });
    expect(approval).toMatchObject({
      confirmation: "pending-structure",
      monthClue: "pending-month-structure",
    });
    expect(revalidateCalendarApproval(approval)).toEqual({ status: "valid" });

    await expect(
      executeCalendarSelection({
        target,
        targetYearMonth: "2025-03",
        assertCurrent: () =>
          revalidateCalendarApproval(approval).status === "valid",
      }),
    ).resolves.toEqual({ status: "completed", targetYearMonth: "2025-03" });
    expect(target.value).toBe("2025-03");
    expect(portals).toHaveLength(0);
    expect(document.querySelector<HTMLInputElement>("#memo")!.value).toBe(
      "유지",
    );
  });

  it("opens through the target itself when the field group has no opener and accepts its declared notation", async () => {
    const target = monthField("", "YYYY.MM");
    installMonthPortal(target, target, { separator: "." });

    expect(calendarSurfaceFor(target)).toMatchObject({
      opener: target,
      rendering: "deferred-generic",
    });
    await expect(
      executeCalendarSelection({ target, targetYearMonth: "2026-11" }),
    ).resolves.toEqual({ status: "completed", targetYearMonth: "2026-11" });
    expect(target.value).toBe("2026.11");
  });

  it("does not toggle closed a calendar the target already opened on focus", async () => {
    const target = monthField();
    const { portals } = installMonthPortal(target, target);
    target.addEventListener("focus", () => target.click());

    await expect(
      executeCalendarSelection({ target, targetYearMonth: "2026-03" }),
    ).resolves.toEqual({ status: "completed", targetYearMonth: "2026-03" });
    expect(target.value).toBe("2026-03");
    expect(portals).toHaveLength(0);
  });

  it("closes and fails when the gesture mounts two calendar roots", async () => {
    const target = monthField();
    const { portals } = installMonthPortal(target, target, { roots: 2 });

    await expect(
      executeCalendarSelection({ target, targetYearMonth: "2026-03" }),
    ).resolves.toEqual({
      status: "needs-verification",
      reason: "calendar_month_structure_unconfirmed",
    });
    expect(portals).toHaveLength(0);
    expect(target.value).toBe("");
  });

  it("fails when the gesture mounts no calendar root", async () => {
    const target = monthField();

    await expect(
      executeCalendarSelection({ target, targetYearMonth: "2026-03" }),
    ).resolves.toEqual({
      status: "needs-verification",
      reason: "calendar_month_structure_unconfirmed",
    });
  });

  it("closes and fails when a month field opens a day calendar", async () => {
    const target = monthField();
    const { portals } = installMonthPortal(target, target, { kind: "day" });

    await expect(
      executeCalendarSelection({ target, targetYearMonth: "2026-03" }),
    ).resolves.toEqual({
      status: "needs-verification",
      reason: "calendar_month_structure_unconfirmed",
    });
    expect(portals).toHaveLength(0);
  });

  it.each([
    [
      "two opener buttons",
      `<button type="button" aria-label="달력"></button><button type="button" aria-label="달력"></button>`,
    ],
    ["a risky lone button", `<button type="button">삭제</button>`],
  ])("rejects an ambiguous field group with %s", (_name, extra) => {
    const target = monthField(extra);
    expect(calendarSurfaceFor(target)).toBeUndefined();
    expect(() =>
      createCalendarApproval({
        target,
        originalDate: "2026-03-15",
        targetYearMonth: "2026-03",
      }),
    ).toThrow("Calendar surface is not approved.");
  });

  it("keeps a day-precision profile date off a field without month evidence", () => {
    document.body.innerHTML = `<div class="field"><input id="start" type="text" readonly></div>`;
    expect(
      calendarSurfaceFor(document.querySelector<HTMLInputElement>("#start")!),
    ).toBeUndefined();
  });
});

function dayField(extra = "") {
  document.body.innerHTML = `<form><div class="row"><div class="field"><label for="got">취득일</label><input id="got" type="text" readonly placeholder="YYYY-MM-DD">${extra}</div><div class="field"><label for="memo">메모</label><input id="memo" type="text" value="유지"></div></div></form>`;
  return document.querySelector<HTMLInputElement>("#got")!;
}

/** A portal day picker with year/month selects and a day button grid. */
function installDayPortal(target: HTMLInputElement, opener: HTMLElement) {
  let portal: HTMLElement | undefined;
  let year = 2026;
  let month = 0;
  const close = () => {
    portal?.remove();
    portal = undefined;
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  const render = () => {
    // A re-render scheduled before the widget closed must not resurrect it.
    if (!portal) return;
    const days = new Date(year, month + 1, 0).getDate();
    portal!.innerHTML = `<div class="head"><select class="y">${[2024, 2025, 2026].map((value) => `<option value="${value}"${value === year ? " selected" : ""}>${value}</option>`).join("")}</select><select class="m">${Array.from({ length: 12 }, (_, m) => `<option value="${m}"${m === month ? " selected" : ""}>${m + 1}월</option>`).join("")}</select></div><table role="grid">${Array.from({ length: days }, (_, d) => `<td><button type="button" data-day="${d + 1}">${d + 1}</button></td>`).join("")}</table>`;
    portal!.querySelector<HTMLSelectElement>(".y")!.addEventListener(
      "change",
      (event) => {
        year = Number((event.target as HTMLSelectElement).value);
        setTimeout(render, 10);
      },
    );
    portal!.querySelector<HTMLSelectElement>(".m")!.addEventListener(
      "change",
      (event) => {
        month = Number((event.target as HTMLSelectElement).value);
        setTimeout(render, 10);
      },
    );
    portal!
      .querySelectorAll<HTMLButtonElement>("[data-day]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          target.value = `${year}-${String(month + 1).padStart(2, "0")}-${button.dataset.day!.padStart(2, "0")}`;
          close();
        }),
      );
  };
  opener.addEventListener("click", () => {
    if (portal) return close();
    portal = document.createElement("div");
    document.body.append(portal);
    // Portals commonly mount on the next frame.
    setTimeout(render, 20);
  });
  return { open: () => portal !== undefined };
}

describe("deferred generic day calendar", () => {
  it("fills a popover day picker whose month select precedes the year and whose grid nests gridcells, leaving it closed", async () => {
    document.body.innerHTML = `<form><div class="row"><div class="cell"><div class="wrap"><button type="button" aria-expanded="false"><input id="in" class="w-full" type="text" readonly placeholder="입학일"><svg></svg></button></div></div><div class="cell"><input id="memo" type="text" placeholder="전공"></div></div></form>`;
    const target = document.querySelector<HTMLInputElement>("#in")!;
    const opener = target.closest("button")!;
    let panel: HTMLElement | undefined;
    let year = 2026;
    let month = 0;
    const close = () => {
      panel?.remove();
      panel = undefined;
      opener.setAttribute("aria-expanded", "false");
      opener.removeAttribute("aria-controls");
      opener.removeAttribute("data-headlessui-state");
      target.className = "w-full";
    };
    const render = () => {
      if (!panel) return;
      const days = new Date(year, month + 1, 0).getDate();
      panel.innerHTML = `<div><select class="m">${Array.from({ length: 12 }, (_, m) => `<option value="${m}"${m === month ? " selected" : ""}>${m + 1}월</option>`).join("")}</select><select class="y">${[2018, 2019, 2026].map((value) => `<option value="${value}"${value === year ? " selected" : ""}>${value}</option>`).join("")}</select><button type="button" aria-label="Go to previous month"></button><button type="button" aria-label="Go to next month"></button></div><div role="grid">${Array.from({ length: days }, (_, d) => `<div role="gridcell"><button type="button" role="gridcell">${d + 1}</button></div>`).join("")}</div>`;
      panel.querySelector<HTMLSelectElement>(".y")!.addEventListener("change", (event) => {
        year = Number((event.target as HTMLSelectElement).value);
        render();
      });
      panel.querySelector<HTMLSelectElement>(".m")!.addEventListener("change", (event) => {
        month = Number((event.target as HTMLSelectElement).value);
        render();
      });
      panel.querySelectorAll<HTMLButtonElement>("[role=grid] button").forEach((button) =>
        button.addEventListener("click", () => {
          target.value = `${year}.${String(month + 1).padStart(2, "0")}.${button.textContent!.padStart(2, "0")}`;
          close();
        }),
      );
    };
    // Escape is ignored; only the opener toggles the popover.
    opener.addEventListener("click", () => {
      if (panel) return close();
      panel = document.createElement("div");
      panel.id = "popover-panel";
      document.body.append(panel);
      opener.setAttribute("aria-expanded", "true");
      opener.setAttribute("aria-controls", "popover-panel");
      opener.setAttribute("data-headlessui-state", "open");
      target.className = "";
      render();
    });

    const approval = createDayCalendarApproval({
      target,
      originalDate: "2019-03-02",
    });
    const result = await executeDayCalendarSelection({
      target,
      targetDate: "2019-03-02",
      timings: FAST,
      assertCurrent: () =>
        revalidateDayCalendarApproval(approval).status === "valid",
    });

    expect(result).toEqual({ status: "completed", targetDate: "2019-03-02" });
    expect(panel).toBeUndefined();
    expect(target.value).toBe("2019.03.02");
  });

  it("approves an unlabeled readonly field whose placeholder names a day and whose wrapping button opens the grid", async () => {
    // The placeholder is the only name; the button wraps the input and an icon.
    document.body.innerHTML = `<form><div class="row"><div class="cell"><div class="wrap"><button type="button"><input id="in" type="text" readonly placeholder="입학일"><svg></svg></button></div></div><div class="cell"><input id="memo" type="text" placeholder="전공"></div></div></form>`;
    const target = document.querySelector<HTMLInputElement>("#in")!;
    const opener = target.closest("button")!;
    installDayPortal(target, opener);

    expect(dayCalendarSurfaceFor(target)).toMatchObject({
      opener,
      rendering: "deferred-generic",
    });
    const approval = createDayCalendarApproval({
      target,
      originalDate: "2024-02-29",
    });
    await expect(
      executeDayCalendarSelection({
        target,
        targetDate: "2024-02-29",
        timings: FAST,
        assertCurrent: () =>
          revalidateDayCalendarApproval(approval).status === "valid",
      }),
    ).resolves.toEqual({ status: "completed", targetDate: "2024-02-29" });
    expect(target.value).toBe("2024-02-29");
  });

  it("approves and selects the exact day through a portal grid mounted on click", async () => {
    const target = dayField(`<button type="button" aria-label="날짜 선택"></button>`);
    const opener = document.querySelector<HTMLButtonElement>(".field button")!;
    const picker = installDayPortal(target, opener);

    expect(dayCalendarSurfaceFor(target)).toMatchObject({
      opener,
      openBy: "trigger",
      rendering: "deferred-generic",
    });
    expect(calendarSurfaceFor(target)).toBeUndefined();
    const approval = createDayCalendarApproval({
      target,
      originalDate: "2024-02-29",
    });
    expect(revalidateDayCalendarApproval(approval)).toEqual({
      status: "valid",
    });

    await expect(
      executeDayCalendarSelection({
        target,
        targetDate: "2024-02-29",
        timings: FAST,
        assertCurrent: () =>
          revalidateDayCalendarApproval(approval).status === "valid",
      }),
    ).resolves.toEqual({ status: "completed", targetDate: "2024-02-29" });
    expect(target.value).toBe("2024-02-29");
    expect(picker.open()).toBe(false);
    expect(document.querySelector<HTMLInputElement>("#memo")!.value).toBe(
      "유지",
    );
  });

  it("closes and fails when a day field opens a month-only calendar", async () => {
    const target = dayField();
    const { portals } = installMonthPortal(target, target);

    expect(dayCalendarSurfaceFor(target)).toMatchObject({
      opener: target,
      openBy: "target",
    });
    await expect(
      executeDayCalendarSelection({
        target,
        targetDate: "2024-02-29",
        timings: FAST,
      }),
    ).resolves.toEqual({
      status: "needs-verification",
      reason: "calendar_day_structure_unconfirmed",
    });
    expect(portals).toHaveLength(0);
  });

  it("does not toggle closed a day calendar the target opened on focus", async () => {
    const target = dayField();
    const picker = installDayPortal(target, target);
    target.addEventListener("focus", () => target.click());

    await expect(
      executeDayCalendarSelection({
        target,
        targetDate: "2025-07-04",
        timings: FAST,
      }),
    ).resolves.toEqual({ status: "completed", targetDate: "2025-07-04" });
    expect(picker.open()).toBe(false);
  });

  it("rejects a day field group with two openers", () => {
    const target = dayField(
      `<button type="button" aria-label="달력"></button><button type="button" aria-label="달력"></button>`,
    );
    expect(dayCalendarSurfaceFor(target)).toBeUndefined();
  });
});
