import { afterEach, describe, expect, it } from "vitest";
import type { FieldsAnalyzeResponse } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";
import { createEmptyProfile } from "../../profile/model";

afterEach(() => {
  document.body.replaceChildren();
});

function installCalendar() {
  document.body.innerHTML = `
    <section aria-label="합성 입력 항목">
      <label>입학 연월 <input id="calendar-target" name="startMonth" type="text" readonly></label>
      <button type="button" aria-labelledby="calendar-target" aria-controls="month-popup">월 선택</button>
      <div id="month-popup" role="dialog" hidden>
        <button type="button">2026</button>
        ${Array.from({ length: 12 }, (_, i) => `<button type="button">${i + 1}월</button>`).join("")}
      </div>
    </section>
    <label>학교 검색 <input name="schoolSearch" readonly><button type="button">학교 검색</button></label>`;
  const target = document.querySelector<HTMLInputElement>("#calendar-target")!;
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
  return {
    target,
    popup,
    school: document.querySelector<HTMLInputElement>("[name='schoolSearch']")!,
  };
}

describe("review-to-write calendar route", () => {
  it("selects only the explicitly approved month through UI clicks and retains the value", async () => {
    const { target, popup, school } = installCalendar();
    const snapshot = collectFieldsSnapshot(document);
    const candidate = snapshot.request.sections
      .flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ])
      .find((field) => field.domName === "startMonth");
    expect(candidate).toBeDefined();
    const profile = createEmptyProfile();
    profile.education = [
      {
        id: "entry-one",
        sectionId: "university",
        values: { startDate: "2026-03-15" },
      },
    ];
    const response: FieldsAnalyzeResponse = {
      snapshotId: snapshot.request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: candidate!.candidateId,
          matchType: "MATCH",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "education.university.startDate",
          },
          autofillPolicy: "ALLOWED",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "READY",
          writePlan: { command: "SELECT_DATE" },
        },
      ],
    };
    const plan = buildReviewPlan({
      analysis: response,
      profile,
      registry: snapshot.registry,
    });
    const item = plan.items[0]!;
    expect(item).toMatchObject({
      status: "available",
      selected: false,
      profileValue: "2026-03",
    });
    expect(target.value).toBe("");
    expect(popup.hidden).toBe(true);
    const result = await executeApprovedWritesAfterPageSettles({
      items: [{ ...item, selected: true }],
      approvedCandidateIds: new Set([item.candidateId]),
      registry: snapshot.registry,
      document,
      calendarOnly: true,
    });
    expect(result[0]).toMatchObject({ status: "written", outcome: "success" });
    expect(target.value).toBe("2026-03");
    expect(school.value).toBe("");
    expect(popup.hidden).toBe(true);
  });
});
