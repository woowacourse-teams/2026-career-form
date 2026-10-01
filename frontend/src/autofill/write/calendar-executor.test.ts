import { afterEach, describe, expect, it, vi } from "vitest";
import type { InteractionDecisionProvider } from "../api/interaction-types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import {
  createCalendarApproval,
  revalidateCalendarApproval,
} from "../review/calendar-approval";
import type { ReviewPlanItem } from "../review/review-plan";
import { executeApprovedCalendarWrite } from "./calendar-executor";
import { executeApprovedWritesAfterPageSettles } from "./executor";

afterEach(() => {
  document.body.innerHTML = "";
});

function calendarItem(): ReviewPlanItem {
  return {
    candidateId: "calendar-field",
    fieldLabel: "입사 가능 월",
    currentValue: "",
    profileValue: "2026-03",
    previewValue: "2026-03",
    profileFieldKey: "experience.experience.availableMonth",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "",
    analysis: {
      candidateId: "calendar-field",
      matchType: "MATCH",
      autofillPolicy: "ALLOWED",
      mappingStatus: "LLM_SUGGESTED",
      interactionStatus: "READY",
      valueBinding: {
        type: "DIRECT",
        profileFieldKey: "experience.experience.availableMonth",
      },
      writePlan: { command: "SELECT_DATE" },
    },
  };
}

describe("approved calendar writes", () => {
  it("does not activate a calendar without separate calendar approval", async () => {
    document.body.innerHTML = `<section><input readonly><button type="button">월 선택</button><div role="dialog"><button data-year="2026">2026</button><button data-month="3">March</button></div></section>`;
    const opener = document.querySelector<HTMLButtonElement>("button")!;
    const clicked = vi.fn();
    opener.addEventListener("click", clicked);

    const result = await executeApprovedCalendarWrite({
      item: calendarItem(),
      registry: { lookupField: vi.fn() } as never,
    });

    expect(result).toMatchObject({
      candidateId: "calendar-field",
      status: "skipped",
      code: "NOT_APPROVED",
      effect: "stop",
    });
    expect(clicked).not.toHaveBeenCalled();
  });

  it("forwards only opaque candidates and stops before selecting on an unsafe decision", async () => {
    document.body.innerHTML = `<section>
      <input id="month" type="text" readonly>
      <button type="button" aria-labelledby="month" aria-controls="calendar">월 선택</button>
      <div id="calendar" role="dialog" hidden><button>2026</button>${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month) => `<button>${month}</button>`).join("")}</div>
    </section>`;
    const target = document.querySelector<HTMLInputElement>("#month")!;
    const opener =
      document.querySelector<HTMLButtonElement>("[aria-controls]")!;
    opener.addEventListener("click", () => {
      document.querySelector<HTMLElement>("#calendar")!.hidden = false;
    });
    const year = document.querySelector<HTMLButtonElement>("#calendar button")!;
    const month = Array.from(
      document.querySelectorAll<HTMLButtonElement>("#calendar button"),
    ).find((button) => button.textContent === "March")!;
    const item = calendarItem();
    item.calendarApproval = createCalendarApproval({
      target,
      originalDate: "2026-03-01",
      targetYearMonth: "2026-03",
      profileFieldKey: "experience.experience.availableMonth",
    });
    const yearClicked = vi.fn();
    const monthClicked = vi.fn();
    year.addEventListener("click", yearClicked);
    month.addEventListener("click", monthClicked);
    const provider = vi.fn(
      async (request: Parameters<InteractionDecisionProvider>[0]) =>
        ({
          schemaVersion: 2 as const,
          snapshotId: request.snapshotId,
          status: "COMPLETE" as const,
          mode: "GENERIC" as const,
          decisions: [
            {
              decisionId: request.decisions[0]!.decisionId,
              role: request.decisions[0]!.role,
              selection: "SELECTED" as const,
              candidateId: "not-an-observed-candidate",
            },
          ],
        }) satisfies Awaited<ReturnType<InteractionDecisionProvider>>,
    );

    expect(revalidateCalendarApproval(item.calendarApproval!).status).toBe(
      "valid",
    );
    const result = await executeApprovedCalendarWrite({
      item,
      registry: {
        lookupField: vi.fn(() => ({
          status: "blocked",
          reason: "readonly",
          handle: { kind: "field", elements: [target] },
        })),
      } as never,
      interactionDecisionProvider: provider,
    });

    expect(result).toMatchObject({ status: "skipped", effect: "stop" });
    expect(provider).toHaveBeenCalledTimes(1);
    const request = vi.mocked(provider).mock.calls[0]![0];
    expect(request.decisions[0]).toMatchObject({
      canonicalFieldKey: "experience.experience.availableMonth",
    });
    expect(request.decisions[0]!.candidates).toEqual([
      {
        candidateId: "calendar-opener-1",
        element: "button",
        control: "button",
        visibility: "visible",
        relationToTarget: "SAME_FIELD_GROUP",
      },
    ]);
    expect(JSON.stringify(request.decisions[0]!.candidates)).not.toContain(
      "2026",
    );
    expect(JSON.stringify(request.decisions[0]!.candidates)).not.toContain(
      "March",
    );
    expect(yearClicked).not.toHaveBeenCalled();
    expect(monthClicked).not.toHaveBeenCalled();
  });

  it("does not click when approval becomes stale before activation", async () => {
    document.body.innerHTML = `<section><input id="month" type="text" readonly><button type="button" aria-labelledby="month" aria-controls="calendar">월 선택</button><div id="calendar" role="dialog"><button>2026</button>${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month) => `<button>${month}</button>`).join("")}</div></section>`;
    const target = document.querySelector<HTMLInputElement>("#month")!;
    const opener =
      document.querySelector<HTMLButtonElement>("[aria-controls]")!;
    const clicked = vi.fn();
    opener.addEventListener("click", clicked);
    const item = calendarItem();
    item.calendarApproval = createCalendarApproval({
      target,
      originalDate: "2026-03-01",
      targetYearMonth: "2026-03",
      profileFieldKey: "experience.experience.availableMonth",
    });

    const result = await executeApprovedCalendarWrite({
      item,
      registry: {
        lookupField: vi.fn(() => ({
          status: "blocked",
          reason: "readonly",
          handle: { kind: "field", elements: [target] },
        })),
      } as never,
      assertCurrent: () => false,
    });

    expect(clicked).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "skipped",
      code: "STALE_TARGET",
      effect: "stop",
    });
  });
});

function syntheticCalendar(value = "") {
  document.body.innerHTML = `<section><input id="month" type="text" readonly value="${value}"><button id="opener" type="button" aria-labelledby="month" aria-controls="calendar">월 선택</button><div id="calendar" role="dialog" hidden><button data-year="2026">2026</button>${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month) => `<button>${month}</button>`).join("")}</div><input id="other" type="text"></section>`;
  const target = document.querySelector<HTMLInputElement>("#month")!;
  const popup = document.querySelector<HTMLElement>("#calendar")!;
  const opener = document.querySelector<HTMLButtonElement>("#opener")!;
  const monthButtons = Array.from(
    popup.querySelectorAll<HTMLButtonElement>("button"),
  ).slice(1);
  const events = { opener: vi.fn(), year: vi.fn(), month: vi.fn() };
  opener.addEventListener("click", () => {
    events.opener();
    popup.hidden = false;
  });
  popup
    .querySelector<HTMLButtonElement>("[data-year]")!
    .addEventListener("click", events.year);
  monthButtons[2]!.addEventListener("click", () => {
    events.month();
    target.value = "2026-03";
    popup.setAttribute("aria-hidden", "true");
  });
  return { target, popup, opener, events };
}

function registryFor(target: HTMLInputElement): CandidateRegistry {
  const registry = new CandidateRegistry();
  registry.registerField(
    {
      kind: "field",
      candidateId: "calendar-field",
      sectionId: "experience",
      signature: createStructuralSignature([target]),
      candidate: {} as never,
      elements: [target],
      optionElements: new Map(),
    },
    "readonly",
  );
  return registry;
}

function approvedItem(
  target: HTMLInputElement,
  options: {
    profileEntryId?: string;
    itemIndex?: number;
    repeatRow?: { itemId?: string; itemGroupId?: string; itemIndex?: number };
  } = {},
): ReviewPlanItem {
  const item = calendarItem();
  item.profileEntryId = options.profileEntryId;
  item.itemIndex = options.itemIndex;
  item.calendarApproval = createCalendarApproval({
    target,
    originalDate: "2026-03-01",
    targetYearMonth: "2026-03",
    profileFieldKey: "experience.experience.availableMonth",
    ...options,
  });
  return item;
}

describe("calendar write guards", () => {
  it("does not click when the current value already matches", async () => {
    const { target, events } = syntheticCalendar("2026-03");
    const result = await executeApprovedCalendarWrite({
      item: approvedItem(target),
      registry: registryFor(target),
    });
    expect(result).toMatchObject({
      status: "skipped",
      code: "ALREADY_MATCHED",
      effect: "continue",
    });
    expect(events.opener).not.toHaveBeenCalled();
    expect(events.year).not.toHaveBeenCalled();
    expect(events.month).not.toHaveBeenCalled();
  });

  it("stops on a different existing value without clicking", async () => {
    const { target, events } = syntheticCalendar("2026-04");
    const result = await executeApprovedCalendarWrite({
      item: approvedItem(target),
      registry: registryFor(target),
    });
    expect(result).toMatchObject({
      status: "skipped",
      code: "CONFLICT",
      effect: "stop",
    });
    expect(events.opener).not.toHaveBeenCalled();
    expect(events.year).not.toHaveBeenCalled();
    expect(events.month).not.toHaveBeenCalled();
  });

  it("rejects changed profile identity and repeat-row approval without clicking", async () => {
    const { target, events } = syntheticCalendar();
    const item = approvedItem(target, {
      profileEntryId: "entry-1",
      itemIndex: 0,
      repeatRow: { itemId: "row-1", itemGroupId: "rows", itemIndex: 0 },
    });
    item.profileEntryId = "entry-2";
    const result = await executeApprovedCalendarWrite({
      item,
      registry: registryFor(target),
    });
    expect(result).toMatchObject({
      status: "skipped",
      code: "NOT_APPROVED",
      effect: "stop",
    });
    expect(events.opener).not.toHaveBeenCalled();

    const { target: secondTarget, events: secondEvents } = syntheticCalendar();
    const secondItem = approvedItem(secondTarget, {
      itemIndex: 0,
      repeatRow: { itemId: "row-1", itemGroupId: "rows", itemIndex: 0 },
    });
    secondItem.calendarApproval!.repeatRow = {
      itemId: "row-2",
      itemGroupId: "rows",
      itemIndex: 0,
    };
    const secondResult = await executeApprovedCalendarWrite({
      item: secondItem,
      registry: registryFor(secondTarget),
    });
    expect(secondResult).toMatchObject({
      status: "skipped",
      code: "STALE_TARGET",
      effect: "stop",
    });
    expect(secondEvents.opener).not.toHaveBeenCalled();
  });

  it("does not duplicate events when the same invocation is repeated after the first write", async () => {
    const { target, events } = syntheticCalendar();
    const item = approvedItem(target);
    const first = await executeApprovedCalendarWrite({
      item,
      registry: registryFor(target),
    });
    const second = await executeApprovedCalendarWrite({
      item,
      registry: registryFor(target),
    });
    expect(first).toMatchObject({ status: "written", effect: "continue" });
    expect(second).toMatchObject({
      status: "skipped",
      code: "ALREADY_MATCHED",
      effect: "continue",
    });
    expect(events.opener).toHaveBeenCalledTimes(1);
    expect(events.year).toHaveBeenCalledTimes(1);
    expect(events.month).toHaveBeenCalledTimes(1);
  });

  it("aborts a delayed provider before any calendar event", async () => {
    const { target, events } = syntheticCalendar();
    const controller = new AbortController();
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = vi.fn(
      async (request: Parameters<InteractionDecisionProvider>[0]) => {
        await delayed;
        return {
          schemaVersion: 2 as const,
          snapshotId: request.snapshotId,
          status: "COMPLETE" as const,
          mode: "GENERIC" as const,
          decisions: [],
        };
      },
    );
    const execution = executeApprovedCalendarWrite({
      item: approvedItem(target),
      registry: registryFor(target),
      interactionDecisionProvider: provider,
      signal: controller.signal,
    });
    controller.abort();
    release();
    const result = await execution;
    expect(result).toMatchObject({ status: "skipped", effect: "stop" });
    expect(events.opener).not.toHaveBeenCalled();
    expect(events.year).not.toHaveBeenCalled();
    expect(events.month).not.toHaveBeenCalled();
  });

  it("stops before year and month when aborted by opener click", async () => {
    const { target, opener, popup, events } = syntheticCalendar();
    popup.setAttribute("aria-hidden", "true");
    const controller = new AbortController();
    opener.addEventListener("click", () => controller.abort(), { once: true });

    const result = await executeApprovedCalendarWrite({
      item: approvedItem(target),
      registry: registryFor(target),
      signal: controller.signal,
    });

    expect(result).toMatchObject({ status: "skipped", effect: "stop" });
    expect(events.opener).toHaveBeenCalledTimes(1);
    expect(events.year).not.toHaveBeenCalled();
    expect(events.month).not.toHaveBeenCalled();
  });

  it("stops when another input changes during calendar selection", async () => {
    const { target, events } = syntheticCalendar();
    document
      .querySelector<HTMLInputElement>("#opener")!
      .addEventListener("click", () => {
        document.querySelector<HTMLInputElement>("#other")!.value = "changed";
      });
    const result = await executeApprovedCalendarWrite({
      item: approvedItem(target),
      registry: registryFor(target),
    });
    expect(result).toMatchObject({
      status: "skipped",
      code: "RETAINED_VALUE_UNCONFIRMED",
      effect: "stop",
    });
    expect(events.opener).toHaveBeenCalledTimes(1);
    expect(events.month).toHaveBeenCalledTimes(1);
  });
});

describe("calendar-only orchestration with field presentation", () => {
  it("presents an approved calendar and reports the retained write once", async () => {
    const { target, events } = syntheticCalendar();
    const registry = registryFor(target);
    const item = approvedItem(target);
    const order: string[] = [];
    const result = await executeApprovedWritesAfterPageSettles({
      items: [item],
      approvedCandidateIds: new Set([item.candidateId]),
      registry,
      calendarOnly: true,
      document,
      beforeWrite: async () => {
        expect(target.value).toBe("");
        order.push("presented");
      },
      onResult: (reportedItem, reportedResult, reportedRegistry) => {
        expect(reportedItem).toBe(item);
        expect(reportedRegistry).toBe(registry);
        expect(target.value).toBe("2026-03");
        order.push(reportedResult.status);
      },
    });
    expect(result[0]).toMatchObject({ status: "written" });
    expect(order).toEqual(["presented", "written"]);
    expect(events.month).toHaveBeenCalledTimes(1);
  });

  it("does not activate after the presentation aborts the run", async () => {
    const { target, events } = syntheticCalendar();
    const controller = new AbortController();
    const item = approvedItem(target);
    const result = await executeApprovedWritesAfterPageSettles({
      items: [item],
      approvedCandidateIds: new Set([item.candidateId]),
      registry: registryFor(target),
      calendarOnly: true,
      document,
      signal: controller.signal,
      beforeWrite: async () => {
        controller.abort();
      },
    });
    expect(result[0]).toMatchObject({
      status: "skipped",
      code: "STALE_TARGET",
    });
    expect(events.opener).not.toHaveBeenCalled();
    expect(target.value).toBe("");
  });

  it("stops subsequent calendars after a failed first selection", async () => {
    const { target, events } = syntheticCalendar("2026-04");
    const item = approvedItem(target);
    const second = { ...item, candidateId: "later-calendar" };
    const presented = vi.fn(async () => {});
    const result = await executeApprovedWritesAfterPageSettles({
      items: [item, second],
      approvedCandidateIds: new Set([item.candidateId, second.candidateId]),
      registry: registryFor(target),
      calendarOnly: true,
      document,
      beforeWrite: presented,
    });
    expect(result.map((entry) => entry.status)).toEqual(["skipped", "skipped"]);
    expect(result[0]).toMatchObject({ code: "CONFLICT" });
    expect(result[1]).toMatchObject({ code: "STALE_TARGET" });
    expect(presented).toHaveBeenCalledTimes(1);
    expect(events.opener).not.toHaveBeenCalled();
  });

  it("keeps ordinary items out of the calendar-only mutation path", async () => {
    const { target, events } = syntheticCalendar();
    const ordinary = document.querySelector<HTMLInputElement>("#other")!;
    const registry = registryFor(target);
    registry.registerField({
      kind: "field",
      candidateId: "ordinary",
      sectionId: "experience",
      signature: createStructuralSignature([ordinary]),
      candidate: {
        candidateId: "ordinary",
        element: "input",
        control: "text",
        visibility: "visible",
      },
      elements: [ordinary],
      optionElements: new Map(),
    });
    const date = approvedItem(target);
    const text: ReviewPlanItem = {
      ...calendarItem(),
      candidateId: "ordinary",
      profileValue: "secret",
      analysis: {
        ...calendarItem().analysis!,
        candidateId: "ordinary",
        writePlan: { command: "SET_TEXT" },
      },
    };
    const result = await executeApprovedWritesAfterPageSettles({
      items: [text, date],
      approvedCandidateIds: new Set([text.candidateId, date.candidateId]),
      registry,
      calendarOnly: true,
      document,
    });
    expect(result[0]).toMatchObject({
      status: "skipped",
      code: "NOT_APPROVED",
    });
    expect(result[1]).toMatchObject({ status: "written" });
    expect(ordinary.value).toBe("");
    expect(events.month).toHaveBeenCalledTimes(1);
  });
});
