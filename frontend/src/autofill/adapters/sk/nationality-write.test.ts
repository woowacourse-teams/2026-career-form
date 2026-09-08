import { afterEach, describe, expect, it } from "vitest";

import type { FieldsAnalyzeResponse } from "../../api/types";
import { collectFieldsSnapshot } from "../../dom/collect";
import { buildReviewPlan } from "../../review/review-plan";
import { executeApprovedWrites } from "../../write/executor";
import { createEmptyProfile } from "../../../profile/model";

function setPageUrl(url: string): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

function nationalityAnalysis(
  snapshot: ReturnType<typeof collectFieldsSnapshot>,
): FieldsAnalyzeResponse {
  const candidate = snapshot.request.sections.flatMap(
    (section) => section.fields,
  )[0]!;
  return {
    snapshotId: snapshot.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: candidate.candidateId,
        matchType: "MATCH",
        valueBinding: {
          type: "LOOKUP",
          profileFieldKey: "personal.personal.nationality",
          optionMap: { 대한민국: "대한민국" },
        },
        autofillPolicy: "CONDITIONAL",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command: "SELECT_OPTION" },
      },
    ],
  };
}

function profileWithKoreanNationality() {
  const profile = createEmptyProfile();
  profile.personal.nationality = "대한민국";
  return profile;
}

afterEach(() => {
  document.body.replaceChildren();
  setPageUrl("http://localhost:3000");
});

describe("SK nationality policy binding and write integration", () => {
  it("collects prsNationality and writes 대한민국 through the approved lookup", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = `
      <div class="apply-form-box">
        <label for="prsNationality">국적</label>
        <select id="prsNationality" name="prsNationality" title="국적">
          <option value="">선택</option>
          <option value="대한민국">대한민국</option>
        </select>
      </div>
    `;
    const select =
      document.querySelector<HTMLSelectElement>("#prsNationality")!;
    const events: string[] = [];
    select.addEventListener("input", () => events.push("input"));
    select.addEventListener("change", () => events.push("change"));

    const snapshot = collectFieldsSnapshot(document);
    const candidate = snapshot.request.sections[0]!.fields[0]!;
    const plan = buildReviewPlan({
      analysis: nationalityAnalysis(snapshot),
      profile: profileWithKoreanNationality(),
      registry: snapshot.registry,
    });
    const approvedItems = plan.items.map((item) => ({
      ...item,
      selected: true,
    }));
    const results = executeApprovedWrites({
      items: approvedItems,
      approvedCandidateIds: new Set([candidate.candidateId]),
      registry: snapshot.registry,
    });

    expect(candidate).toMatchObject({
      element: "select",
      control: "select",
      domId: "prsNationality",
      domName: "prsNationality",
      options: [{ displayName: "선택" }, { displayName: "대한민국" }],
    });
    expect(plan.items[0]).toMatchObject({
      status: "needs-review",
      profileValue: "대한민국",
    });
    expect(select.value).toBe("대한민국");
    expect(events).toEqual(["input", "change", "input", "change"]);
    expect(results).toEqual([
      { candidateId: candidate.candidateId, status: "written" },
    ]);
  });

  it("preserves a different existing nationality as a review conflict", () => {
    setPageUrl("https://www.skcareers.com/Application/Index/");
    document.body.innerHTML = `
      <div class="apply-form-box">
        <label for="prsNationality">국적</label>
        <select id="prsNationality" name="prsNationality" title="국적">
          <option value="대한민국">대한민국</option>
          <option value="미국" selected>미국</option>
        </select>
      </div>
    `;
    const select =
      document.querySelector<HTMLSelectElement>("#prsNationality")!;
    const snapshot = collectFieldsSnapshot(document);
    const candidate = snapshot.request.sections[0]!.fields[0]!;
    const plan = buildReviewPlan({
      analysis: nationalityAnalysis(snapshot),
      profile: profileWithKoreanNationality(),
      registry: snapshot.registry,
    });
    const results = executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set(
        plan.items
          .filter((item) => item.selected)
          .map((item) => item.candidateId),
      ),
      registry: snapshot.registry,
    });

    expect(plan.items[0]).toMatchObject({
      status: "conflict",
      selected: false,
    });
    expect(select.value).toBe("미국");
    expect(results).toEqual([
      {
        candidateId: candidate.candidateId,
        status: "skipped",
        reason: "사용자가 승인한 입력 항목이 아닙니다.",
      },
    ]);
  });
});
