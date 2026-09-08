import { afterEach, describe, expect, it } from "vitest";
import type { FieldsAnalyzeResponse, ValueBinding } from "../../api/types";
import { collectFieldsSnapshot } from "../../dom/collect";
import { buildReviewPlan } from "../../review/review-plan";
import { executeApprovedWrites } from "../../write/executor";
import { createEmptyProfile } from "../../../profile/model";

const bindings: Record<string, ValueBinding> = {
  carCorpName: {
    type: "DIRECT",
    profileFieldKey: "careers.career.companyName",
  },
  carDeptName: { type: "DIRECT", profileFieldKey: "careers.career.department" },
  carPosition: { type: "DIRECT", profileFieldKey: "careers.career.position" },
  carDescription: {
    type: "DIRECT",
    profileFieldKey: "careers.career.responsibilities",
  },
  carRetireDesc: {
    type: "DIRECT",
    profileFieldKey: "careers.career.terminationReason",
  },
  carFromDate: {
    type: "DERIVED",
    recipe: "YEAR_MONTH",
    profileFieldKey: "careers.career.startDate",
  },
  carToDate: {
    type: "DERIVED",
    recipe: "YEAR_MONTH",
    profileFieldKey: "careers.career.endDate",
  },
  carWorkingYN: {
    type: "LOOKUP",
    profileFieldKey: "careers.career.employmentStatus",
    optionMap: { 재직중: "재직 중", 퇴사: "퇴사" },
  },
};
function row(index: number): string {
  return `<div class="form-item-group career-item">
    <input name="carCorpName" id="carCorpName_${index}" />
    <input name="carDeptName" id="carDeptName_${index}" />
    <input name="carPosition" id="carPosition_${index}" />
    <input name="carJobRole" id="carJobRole_${index}" />
    <input name="carSalary" id="carSalary_${index}" />
    <input type="tel" name="carFromDate" id="carFromDate_${index}" maxlength="6" />
    <input type="tel" name="carToDate" id="carToDate_${index}" maxlength="6" />
    <select name="carWorkingYN"><option value="">재직여부</option><option value="1">재직 중</option><option value="0">퇴사</option></select>
    <textarea name="carDescription" id="carDescription_${index}"></textarea>
    <div style="display:none"><textarea name="carRetireDesc" id="carRetireDesc_${index}"></textarea></div>
  </div>`;
}
function setup() {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "https://www.skcareers.com/apply" });
  document.body.innerHTML = `<div id="applyContentCareer" class="apply-form-box career-root"><div class="form-body">${row(1)}${row(2)}</div></div><div style="display:none" id="Career_Item">${row(3)}</div>`;
  const profile = createEmptyProfile();
  profile.careers = [
    {
      id: "career-a",
      sectionId: "career",
      values: {
        companyName: "회사 A",
        department: "부서 A",
        position: "직위 A",
        responsibilities: "업무 A",
        startDate: "2020-03-15",
        endDate: "2022-07-31",
        employmentStatus: "퇴사",
        terminationReason: "사유 A",
      },
    },
    {
      id: "career-b",
      sectionId: "career",
      values: {
        companyName: "회사 B",
        department: "부서 B",
        position: "직위 B",
        responsibilities: "업무 B",
        startDate: "2023-08-01",
        employmentStatus: "재직중",
      },
    },
  ];
  const snapshot = collectFieldsSnapshot(document);
  const candidates = snapshot.request.sections.flatMap((s) => [
    ...s.fields,
    ...(s.items ?? []).flatMap((i) => i.fields),
  ]);
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: snapshot.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: candidates.map((c) =>
      bindings[c.domName ?? ""]
        ? {
            candidateId: c.candidateId,
            matchType: "MATCH",
            valueBinding: bindings[c.domName!]!,
            autofillPolicy: "ALLOWED",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus:
              c.visibility === "hidden" ? "MANUAL_REVEAL_REQUIRED" : "READY",
            writePlan: {
              command: c.control === "select" ? "SELECT_OPTION" : "SET_TEXT",
            },
          }
        : {
            candidateId: c.candidateId,
            matchType: "NO_MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            reasonCodes: ["NO_MATCH"],
            interactionStatus: "BLOCKED",
          },
    ),
  };
  return { profile, snapshot, analysis };
}
function value(id: string) {
  return document.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(`#${id}`)!.value;
}
afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});
describe("SK career policy binding and write integration", () => {
  it("binds two visible rows independently, omits the template and leaves unsupported and hidden fields untouched", () => {
    const { profile, snapshot, analysis } = setup();
    const plan = buildReviewPlan({
      analysis,
      profile,
      registry: snapshot.registry,
    });
    const approvedCandidateIds = new Set(
      plan.items
        .filter((i) => i.status === "available")
        .map((i) => i.candidateId),
    );
    const results = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds,
      registry: snapshot.registry,
    });
    expect(results.filter((r) => r.status === "written")).toHaveLength(13);
    expect([value("carCorpName_1"), value("carCorpName_2")]).toEqual([
      "회사 A",
      "회사 B",
    ]);
    expect([value("carDeptName_1"), value("carDeptName_2")]).toEqual([
      "부서 A",
      "부서 B",
    ]);
    expect([value("carPosition_1"), value("carPosition_2")]).toEqual([
      "직위 A",
      "직위 B",
    ]);
    expect([value("carDescription_1"), value("carDescription_2")]).toEqual([
      "업무 A",
      "업무 B",
    ]);
    expect(
      Array.from(
        document.querySelectorAll<HTMLSelectElement>(
          "select[name=carWorkingYN]",
        ),
      ).map((e) => e.value),
    ).toEqual(["0", "1", ""]);
    expect([
      value("carFromDate_1"),
      value("carToDate_1"),
      value("carFromDate_2"),
      value("carToDate_2"),
    ]).toEqual(["2020-03", "2022-07", "2023-08", ""]);
    expect([
      value("carJobRole_1"),
      value("carSalary_1"),
      value("carRetireDesc_1"),
      value("carCorpName_3"),
    ]).toEqual(["", "", "", ""]);
  });
  it("preserves existing values and refuses ambiguous row counts", () => {
    const { profile, snapshot, analysis } = setup();
    document.querySelector<HTMLInputElement>("#carCorpName_1")!.value =
      "기존 회사";
    const plan = buildReviewPlan({
      analysis,
      profile,
      registry: snapshot.registry,
    });
    executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set(
        plan.items
          .filter((i) => i.status === "available")
          .map((i) => i.candidateId),
      ),
      registry: snapshot.registry,
    });
    expect(value("carCorpName_1")).toBe("기존 회사");
    expect(value("carCorpName_2")).toBe("회사 B");
    profile.careers.pop();
    expect(
      buildReviewPlan({
        analysis,
        profile,
        registry: snapshot.registry,
      }).items.every((i) => i.status === "unavailable"),
    ).toBe(true);
  });
});
