import { afterEach, describe, expect, it } from "vitest";
import type { FieldsAnalyzeResponse } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { installUiDatepicker } from "../interaction/ui-datepicker.test-fixtures";
import { buildReviewPlan, type ReviewPlanItem } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";
import { createEmptyProfile, type Profile } from "../../profile/model";

afterEach(() => {
  document.body.replaceChildren();
});

// Fabricated career rows; no employer markup or applicant values.
function install({
  placeholder = "",
  endValue = "",
}: { placeholder?: string; endValue?: string } = {}) {
  const row = (index: number) => `
    <div class="career-item" data-repeatable-group="careers">
      <label>직장명 <input name="companyName" type="text" value=""></label>
      <label>입사일 <input id="start-${index}" name="careerStart" type="text" readonly ${placeholder}></label>
      <label>퇴사일 <input id="end-${index}" name="careerEnd" type="text" readonly ${placeholder} value="${index === 1 ? endValue : ""}"></label>
    </div>`;
  document.body.innerHTML = `
    <form id="synthetic-application">
      <section id="career" aria-label="직장경력">
        <h2>직장경력</h2>
        ${row(0)}${row(1)}
      </section>
      <section id="memo-section" aria-label="기타">
        <label>메모 <input name="memo" type="text" value="유지"></label>
      </section>
    </form>`;
  const picker = installUiDatepicker(document);
  document
    .querySelectorAll<HTMLInputElement>(
      "[name='careerStart'], [name='careerEnd']",
    )
    .forEach((input) =>
      picker.attach(input, {
        trigger: true,
        yearRange: [2015, 2026],
        dateFormat: placeholder.includes("YYYY.MM.DD")
          ? "yy.mm.dd"
          : "yy-mm-dd",
      }),
    );
  return picker;
}

function profile(): Profile {
  const value = createEmptyProfile();
  value.careers = [
    {
      id: "career-a",
      sectionId: "career",
      values: { startDate: "2020-02-29", endDate: "2021-12-31" },
    },
    {
      id: "career-b",
      sectionId: "career",
      values: { startDate: "2022-01-01", endDate: "2024-02-29" },
    },
  ];
  return value;
}

type Snapshot = ReturnType<typeof collectFieldsSnapshot>;

function candidates(snapshot: Snapshot) {
  return snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}

const BINDINGS: Record<string, string> = {
  careerStart: "careers.career.startDate",
  careerEnd: "careers.career.endDate",
};

function analysis(snapshot: Snapshot): FieldsAnalyzeResponse {
  return {
    snapshotId: snapshot.request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: candidates(snapshot)
      .filter((candidate) => BINDINGS[candidate.domName ?? ""])
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        matchType: "MATCH" as const,
        valueBinding: {
          type: "DIRECT" as const,
          profileFieldKey: BINDINGS[candidate.domName!]!,
        },
        autofillPolicy: "ALLOWED" as const,
        mappingStatus: "LLM_SUGGESTED" as const,
        interactionStatus: "READY" as const,
        writePlan: { command: "SELECT_DATE" as const },
      })),
  };
}

function plan(snapshot: Snapshot, value = profile()) {
  return buildReviewPlan({
    analysis: analysis(snapshot),
    profile: value,
    registry: snapshot.registry,
  }).items;
}

function byTarget(items: readonly ReviewPlanItem[], id: string) {
  const item = items.find(
    (entry) =>
      entry.dayCalendarApproval?.target === document.getElementById(id) ||
      entry.calendarApproval?.target === document.getElementById(id),
  );
  if (!item) throw new Error(`missing item for ${id}`);
  return item;
}

async function run(snapshot: Snapshot, items: readonly ReviewPlanItem[]) {
  const approved = items.filter((item) => item.status === "available");
  return executeApprovedWritesAfterPageSettles({
    items: items.map((item) =>
      approved.includes(item) ? { ...item, selected: true } : item,
    ),
    approvedCandidateIds: new Set(approved.map((item) => item.candidateId)),
    registry: snapshot.registry,
    document,
    calendarOnly: true,
  });
}

const value = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)!.value;

describe("readonly day calendar review-to-write route", () => {
  it("offers each career row date as a separately approved exact day", () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const items = plan(snapshot);

    expect(items).toHaveLength(4);
    expect(byTarget(items, "start-0")).toMatchObject({
      status: "available",
      selected: false,
      profileValue: "2020-02-29",
      profileEntryId: "career-a",
      itemIndex: 0,
      dayCalendarApproval: { unit: "day", targetDate: "2020-02-29" },
    });
    expect(byTarget(items, "end-1")).toMatchObject({
      profileValue: "2024-02-29",
      profileEntryId: "career-b",
      itemIndex: 1,
    });
    expect(byTarget(items, "start-0").calendarApproval).toBeUndefined();
  });

  it("selects every approved day through the UI and leaves other fields untouched", async () => {
    const picker = install();
    const snapshot = collectFieldsSnapshot(document);

    const results = await run(snapshot, plan(snapshot));

    expect(results.map((result) => result.status)).toEqual([
      "written",
      "written",
      "written",
      "written",
    ]);
    expect([
      value("start-0"),
      value("end-0"),
      value("start-1"),
      value("end-1"),
    ]).toEqual(["2020-02-29", "2021-12-31", "2022-01-01", "2024-02-29"]);
    expect(
      Array.from(
        document.querySelectorAll<HTMLInputElement>("[name='companyName']"),
      ).map((input) => input.value),
    ).toEqual(["", ""]);
    expect(
      document.querySelector<HTMLInputElement>("[name='memo']")!.value,
    ).toBe("유지");
    expect(picker.isOpen()).toBe(false);
  });

  it("shows and verifies the page's declared dotted notation", async () => {
    install({ placeholder: `placeholder="YYYY.MM.DD"` });
    const snapshot = collectFieldsSnapshot(document);
    const items = plan(snapshot);

    expect(byTarget(items, "end-1").profileValue).toBe("2024.02.29");
    await run(snapshot, items);
    expect(value("end-1")).toBe("2024.02.29");
  });

  it("keeps a pre-existing different value out of the approved set", async () => {
    install({ endValue: "2023-05-05" });
    const snapshot = collectFieldsSnapshot(document);
    const items = plan(snapshot);

    expect(byTarget(items, "end-1").status).toBe("conflict");
    const results = await run(snapshot, items);

    expect(value("end-1")).toBe("2023-05-05");
    expect(results[3]).toMatchObject({
      status: "skipped",
      code: "NOT_APPROVED",
    });
    expect(results.slice(0, 3).map((result) => result.status)).toEqual([
      "written",
      "written",
      "written",
    ]);
  });

  it("preserves a value that appears after approval and stops later calendar writes", async () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const items = plan(snapshot);
    document.querySelector<HTMLInputElement>("#end-0")!.value = "2023-05-05";

    const results = await run(snapshot, items);

    expect(results[1]).toMatchObject({ status: "skipped", code: "CONFLICT" });
    expect(value("end-0")).toBe("2023-05-05");
    expect(results.slice(2).map((result) => result.status)).toEqual([
      "skipped",
      "skipped",
    ]);
    expect([value("start-1"), value("end-1")]).toEqual(["", ""]);
  });

  it("stops when the widget writes a different day", async () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const items = plan(snapshot);
    const start = document.querySelector<HTMLInputElement>("#start-0")!;
    start.addEventListener("change", () => {
      start.value = "2020-02-28";
    });

    const results = await run(snapshot, items);

    expect(results[0]).toMatchObject({
      status: "skipped",
      code: "RETAINED_VALUE_UNCONFIRMED",
    });
    expect(
      results.slice(1).every((result) => result.status === "skipped"),
    ).toBe(true);
  });

  it("refuses an item that carries both month and day approvals", async () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const [first, ...rest] = plan(snapshot);
    const tampered = {
      ...first!,
      calendarApproval: {} as NonNullable<ReviewPlanItem["calendarApproval"]>,
    };

    const results = await run(snapshot, [tampered, ...rest]);

    expect(results[0]).toMatchObject({
      status: "skipped",
      code: "NOT_APPROVED",
    });
    expect(value("start-0")).toBe("");
  });

  it("refuses an item whose shown value differs from the approval", async () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const [first, ...rest] = plan(snapshot);

    const results = await run(snapshot, [
      { ...first!, profileValue: "2020-03-01" },
      ...rest,
    ]);

    expect(results[0]).toMatchObject({
      status: "skipped",
      code: "NOT_APPROVED",
    });
    expect(value("start-0")).toBe("");
  });

  it("marks an existing identical value as unchanged", async () => {
    install({ endValue: "2024-02-29" });
    const snapshot = collectFieldsSnapshot(document);
    const items = plan(snapshot);

    expect(byTarget(items, "end-1").reason).toContain("이미");
    const results = await run(snapshot, items);
    expect(results[3]).toMatchObject({
      status: "skipped",
      outcome: "unchanged",
      code: "ALREADY_MATCHED",
    });
  });

  it("holds a target whose format clue is month-only", () => {
    install({ placeholder: `placeholder="YYYY.MM"` });
    const snapshot = collectFieldsSnapshot(document);

    expect(plan(snapshot).every((item) => item.status === "unavailable")).toBe(
      true,
    );
  });

  it("holds a target bound to both a month picker and a day calendar", () => {
    install();
    const start = document.querySelector<HTMLInputElement>("#start-0")!;
    start.id = "ambiguous-start";
    start.insertAdjacentHTML(
      "afterend",
      `<button type="button" aria-labelledby="ambiguous-start" aria-controls="month-popup">월 선택</button><div id="month-popup" role="dialog" hidden><button type="button">2020</button>${Array.from({ length: 12 }, (_, i) => `<button type="button">${i + 1}월</button>`).join("")}</div>`,
    );
    const snapshot = collectFieldsSnapshot(document);
    const item = plan(snapshot).find(
      (entry) =>
        entry.status === "unavailable" &&
        entry.reason.includes("월 달력과 연월일 달력"),
    );

    expect(item).toBeDefined();
  });

  it("stops without writing when the approved row is replaced before execution", async () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const items = plan(snapshot);
    const start = document.querySelector<HTMLInputElement>("#start-0")!;
    start.setAttribute("name", "renamed");

    const results = await run(snapshot, items);

    expect(results[0]).toMatchObject({ status: "skipped" });
    expect(value("start-0")).toBe("");
    expect(
      results.slice(1).every((result) => result.status === "skipped"),
    ).toBe(true);
  });
});
