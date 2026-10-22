import { afterEach, describe, expect, it } from "vitest";
import type { FieldsAnalyzeResponse } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { installUiDatepicker } from "../interaction/ui-datepicker.test-fixtures";
import { buildReviewPlan, type ReviewPlanItem } from "../review/review-plan";
import { createEmptyProfile, type Profile } from "../../profile/model";
import {
  executeApprovedWritesAfterPageSettles,
  type ApprovedWriteResult,
} from "./executor";

afterEach(() => {
  document.body.replaceChildren();
});

type Snapshot = ReturnType<typeof collectFieldsSnapshot>;
type Mutation = "keep" | "change" | "replace" | "detach";

const UNCONFIRMED = {
  status: "skipped",
  outcome: "needs-verification",
  code: "RETAINED_VALUE_UNCONFIRMED",
};

function candidates(snapshot: Snapshot) {
  return snapshot.request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}

function analysis(
  snapshot: Snapshot,
  bindings: Record<string, string>,
): FieldsAnalyzeResponse {
  return {
    snapshotId: snapshot.request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: candidates(snapshot)
      .filter((candidate) => bindings[candidate.domName ?? ""])
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        matchType: "MATCH" as const,
        valueBinding: {
          type: "DIRECT" as const,
          profileFieldKey: bindings[candidate.domName!]!,
        },
        autofillPolicy: "ALLOWED" as const,
        mappingStatus: "LLM_SUGGESTED" as const,
        interactionStatus: "READY" as const,
        writePlan: { command: "SELECT_DATE" as const },
      })),
  };
}

function mutate(target: HTMLInputElement, mutation: Mutation, other: string) {
  if (mutation === "change") target.value = other;
  if (mutation === "replace") {
    const copy = target.cloneNode(true) as HTMLInputElement;
    copy.value = target.value;
    target.replaceWith(copy);
  }
  if (mutation === "detach") target.remove();
}

/**
 * Runs the product write path (no calendarOnly) and mutates the target
 * synchronously inside the first `written` notification for it, i.e. after
 * the calendar executor's own checks and before the common settle step.
 */
async function runWithMutation(
  snapshot: Snapshot,
  item: ReviewPlanItem,
  others: readonly ReviewPlanItem[],
  target: HTMLInputElement,
  mutation: Mutation,
  other: string,
) {
  const notifications: ApprovedWriteResult[] = [];
  let mutated = false;
  const results = await executeApprovedWritesAfterPageSettles({
    items: [{ ...item, selected: true }, ...others],
    approvedCandidateIds: new Set([item.candidateId]),
    registry: snapshot.registry,
    document,
    onResult: (entry, result) => {
      if (entry.candidateId !== item.candidateId) return;
      notifications.push(result);
      if (!mutated && result.status === "written") {
        mutated = true;
        mutate(target, mutation, other);
      }
    },
  });
  return { result: results[0]!, notifications };
}

function installMonthCalendar(initialValue = "") {
  document.body.innerHTML = `
    <section aria-label="합성 입력 항목">
      <label>입학 연월 <input id="calendar-target" name="startMonth" type="text" readonly></label>
      <button type="button" aria-labelledby="calendar-target" aria-controls="month-popup">월 선택</button>
      <div id="month-popup" role="dialog" hidden>
        <button type="button">2026</button>
        ${Array.from({ length: 12 }, (_, i) => `<button type="button">${i + 1}월</button>`).join("")}
      </div>
    </section>
    <label>학교 검색 <input name="schoolSearch" readonly><button type="button">학교 검색</button></label>
    <label>메모 <input name="memo" type="text" value="유지"></label>`;
  const target = document.querySelector<HTMLInputElement>("#calendar-target")!;
  target.value = initialValue;
  const popup = document.querySelector<HTMLElement>("#month-popup")!;
  document
    .querySelector<HTMLButtonElement>("[aria-controls='month-popup']")!
    .addEventListener("click", () => {
      popup.hidden = false;
    });
  popup.querySelectorAll("button").forEach((button) => {
    if (button.textContent === "3월")
      button.addEventListener("click", () => {
        target.value = "2026-03";
        popup.hidden = true;
      });
  });
  return target;
}

function monthItem(snapshot: Snapshot) {
  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "entry-one",
      sectionId: "university",
      values: { startDate: "2026-03-15" },
    },
  ];
  const items = buildReviewPlan({
    analysis: analysis(snapshot, {
      startMonth: "education.university.startDate",
    }),
    profile,
    registry: snapshot.registry,
  }).items;
  expect(items).toHaveLength(1);
  return items[0]!;
}

function otherMonthValues() {
  return [
    document.querySelector<HTMLInputElement>("[name='schoolSearch']")!.value,
    document.querySelector<HTMLInputElement>("[name='memo']")!.value,
  ];
}

async function runMonth(mutation: Mutation, initialValue = "") {
  const target = installMonthCalendar(initialValue);
  const snapshot = collectFieldsSnapshot(document);
  const item = monthItem(snapshot);
  expect(item).toMatchObject({ status: "available", profileValue: "2026-03" });
  return runWithMutation(snapshot, item, [], target, mutation, "2026-04");
}

function installDayCalendar(initialStart = "") {
  const row = (index: number) => `
    <div class="career-item" data-repeatable-group="careers">
      <label>직장명 <input name="companyName" type="text" value=""></label>
      <label>입사일 <input id="start-${index}" name="careerStart" type="text" readonly placeholder="YYYY-MM-DD"></label>
      <label>퇴사일 <input id="end-${index}" name="careerEnd" type="text" readonly placeholder="YYYY-MM-DD"></label>
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
        dateFormat: "yy-mm-dd",
      }),
    );
  const target = document.querySelector<HTMLInputElement>("#start-0")!;
  target.value = initialStart;
  return target;
}

function dayItems(snapshot: Snapshot) {
  const profile: Profile = createEmptyProfile();
  profile.careers = [
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
  const items = buildReviewPlan({
    analysis: analysis(snapshot, {
      careerStart: "careers.career.startDate",
      careerEnd: "careers.career.endDate",
    }),
    profile,
    registry: snapshot.registry,
  }).items;
  const start = document.getElementById("start-0");
  const item = items.find(
    (entry) => entry.dayCalendarApproval?.target === start,
  );
  if (!item) throw new Error("missing day calendar item");
  return { item, others: items.filter((entry) => entry !== item) };
}

function otherDayValues() {
  return [
    ...["end-0", "start-1", "end-1"].map(
      (id) => document.querySelector<HTMLInputElement>(`#${id}`)!.value,
    ),
    ...Array.from(
      document.querySelectorAll<HTMLInputElement>("[name='companyName']"),
    ).map((input) => input.value),
    document.querySelector<HTMLInputElement>("[name='memo']")!.value,
  ];
}

async function runDay(mutation: Mutation, initialStart = "") {
  const target = installDayCalendar(initialStart);
  const snapshot = collectFieldsSnapshot(document);
  const { item, others } = dayItems(snapshot);
  expect(item).toMatchObject({
    status: "available",
    dayCalendarApproval: { unit: "day", targetDate: "2020-02-29" },
  });
  return runWithMutation(
    snapshot,
    item,
    others,
    target,
    mutation,
    "2020-03-01",
  );
}

const DAY_OTHERS = ["", "", "", "", "", "유지"];

describe("calendar writes go through the common settle verification", () => {
  describe("year-month calendar", () => {
    it("(a) keeps written when the selected month is retained", async () => {
      const { result, notifications } = await runMonth("keep");
      expect(result).toMatchObject({ status: "written", outcome: "success" });
      expect(notifications.at(-1)).toMatchObject({ status: "written" });
      expect(
        document.querySelector<HTMLInputElement>("#calendar-target")!.value,
      ).toBe("2026-03");
      expect(otherMonthValues()).toEqual(["", "유지"]);
    });

    it("(b) reports an unconfirmed value when the page changes it after the write", async () => {
      const { result, notifications } = await runMonth("change");
      expect(result).toMatchObject(UNCONFIRMED);
      expect(notifications).toHaveLength(2);
      expect(notifications[1]).toMatchObject(UNCONFIRMED);
      expect(otherMonthValues()).toEqual(["", "유지"]);
    });

    it("(c) keeps the existing result when the value already matched", async () => {
      const { result } = await runMonth("change", "2026-03");
      expect(result).toMatchObject({
        status: "skipped",
        outcome: "unchanged",
        code: "ALREADY_MATCHED",
      });
      expect(otherMonthValues()).toEqual(["", "유지"]);
    });

    it("(d) reports an unconfirmed value when the target input is replaced", async () => {
      const { result, notifications } = await runMonth("replace");
      expect(result).toMatchObject(UNCONFIRMED);
      expect(notifications[1]).toMatchObject(UNCONFIRMED);
      expect(otherMonthValues()).toEqual(["", "유지"]);
    });

    it("(d) reports an unconfirmed value when the target input is detached", async () => {
      const { result } = await runMonth("detach");
      expect(result).toMatchObject(UNCONFIRMED);
      expect(otherMonthValues()).toEqual(["", "유지"]);
    });
  });

  describe("day calendar", () => {
    it("(a) keeps written when the selected day is retained", async () => {
      const { result, notifications } = await runDay("keep");
      expect(result).toMatchObject({ status: "written", outcome: "success" });
      expect(notifications.at(-1)).toMatchObject({ status: "written" });
      expect(document.querySelector<HTMLInputElement>("#start-0")!.value).toBe(
        "2020-02-29",
      );
      expect(otherDayValues()).toEqual(DAY_OTHERS);
    });

    it("(b) reports an unconfirmed value when the page changes it after the write", async () => {
      const { result, notifications } = await runDay("change");
      expect(result).toMatchObject(UNCONFIRMED);
      expect(notifications).toHaveLength(2);
      expect(notifications[1]).toMatchObject(UNCONFIRMED);
      expect(otherDayValues()).toEqual(DAY_OTHERS);
    });

    it("(c) keeps the existing result when the value already matched", async () => {
      const { result } = await runDay("change", "2020-02-29");
      expect(result).toMatchObject({
        status: "skipped",
        outcome: "unchanged",
        code: "ALREADY_MATCHED",
      });
      expect(otherDayValues()).toEqual(DAY_OTHERS);
    });

    it("(d) reports an unconfirmed value when the target input is replaced", async () => {
      const { result, notifications } = await runDay("replace");
      expect(result).toMatchObject(UNCONFIRMED);
      expect(notifications[1]).toMatchObject(UNCONFIRMED);
      expect(otherDayValues()).toEqual(DAY_OTHERS);
    });

    it("(d) reports an unconfirmed value when the target input is detached", async () => {
      const { result } = await runDay("detach");
      expect(result).toMatchObject(UNCONFIRMED);
      expect(otherDayValues()).toEqual(DAY_OTHERS);
    });
  });
});
