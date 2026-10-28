import { afterEach, describe, expect, it } from "vitest";
import type { FieldsAnalyzeResponse } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { attachSteppedPicker } from "../interaction/dialog-date-picker.test-fixtures";
import { buildReviewPlan } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";
import { createEmptyProfile } from "../../profile/model";

afterEach(() => document.body.replaceChildren());

// Fabricated career rows; no employer markup or applicant values.
function install(startText = "시작일") {
  const row = () => `
    <div class="career-item" data-repeatable-group="careers">
      <label>직장명 <input name="companyName" type="text" value=""></label>
      <div><span>재직 기간</span>
        <button type="button" aria-haspopup="dialog">${startText}</button></div>
    </div>`;
  document.body.innerHTML = `
    <form id="synthetic-application">
      <section id="career" aria-label="직장경력"><h2>직장경력</h2>${row()}${row()}</section>
      <section aria-label="기타"><label>메모 <input name="memo" type="text" value="유지"></label></section>
    </form>`;
  const buttons = [
    ...document.querySelectorAll<HTMLButtonElement>("button[aria-haspopup]"),
  ];
  buttons.forEach((button) =>
    attachSteppedPicker(button, { start: "years", precision: "day" }),
  );
  return buttons;
}

function profile() {
  const value = createEmptyProfile();
  value.careers = [
    { id: "career-a", sectionId: "career", values: { startDate: "2019-04-01" } },
    { id: "career-b", sectionId: "career", values: { startDate: "2022-11-15" } },
  ];
  return value;
}

function analysis(
  snapshot: ReturnType<typeof collectFieldsSnapshot>,
): FieldsAnalyzeResponse {
  return {
    snapshotId: snapshot.request.snapshotId,
    mode: "GENERIC",
    analysisStatus: "COMPLETE",
    fields: snapshot.request.sections
      .flatMap((section) => (section.items ?? []).flatMap((item) => item.fields))
      .filter((candidate) => candidate.control === "button")
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        matchType: "MATCH" as const,
        valueBinding: {
          type: "DIRECT" as const,
          profileFieldKey: "careers.career.startDate",
        },
        autofillPolicy: "ALLOWED" as const,
        mappingStatus: "LLM_SUGGESTED" as const,
        interactionStatus: "READY" as const,
        writePlan: { command: "SELECT_DATE" as const },
      })),
  };
}

describe("dialog date button review-to-write route", () => {
  it("approves each row's button and writes its own profile date", async () => {
    const buttons = install();
    const snapshot = collectFieldsSnapshot(document);
    const items = buildReviewPlan({
      analysis: analysis(snapshot),
      profile: profile(),
      registry: snapshot.registry,
    }).items.filter((item) => item.dialogDateApproval);

    expect(items.map((item) => [item.status, item.selected])).toEqual([
      ["available", true],
      ["available", true],
    ]);
    const results = await executeApprovedWritesAfterPageSettles({
      items,
      approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
      registry: snapshot.registry,
      document,
      calendarOnly: true,
    });

    expect(results.map((result) => result.status)).toEqual(["written", "written"]);
    expect(buttons.map((button) => button.textContent)).toEqual([
      "2019-04-01",
      "2022-11-15",
    ]);
  });

  it("keeps writing later fields after a dialog date in the ordinary batch", async () => {
    install();
    const snapshot = collectFieldsSnapshot(document);
    const items = buildReviewPlan({
      analysis: analysis(snapshot),
      profile: profile(),
      registry: snapshot.registry,
    }).items.filter((item) => item.dialogDateApproval);

    const results = await executeApprovedWritesAfterPageSettles({
      items,
      approvedCandidateIds: new Set(items.map((item) => item.candidateId)),
      registry: snapshot.registry,
      document,
    });

    expect(results.map((result) => result.status)).toEqual(["written", "written"]);
  });

  it("keeps a button that already shows another date as a conflict", () => {
    install("2018-01-01");
    const snapshot = collectFieldsSnapshot(document);
    const items = buildReviewPlan({
      analysis: analysis(snapshot),
      profile: profile(),
      registry: snapshot.registry,
    }).items.filter((item) => item.analysis?.writePlan?.command === "SELECT_DATE");

    expect(items.map((item) => item.status)).toEqual(["conflict", "conflict"]);
    expect(items.every((item) => !item.selected)).toBe(true);
  });
});
