import { afterEach, beforeEach, expect, it } from "vitest";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../dom/collect";
import { executeApprovedPreparationPlans } from "./executor";
import type { PreparationPlan } from "../api/types";

beforeEach(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://kakaomobility.career.greetinghr.com/ko/o/1/apply",
  });
});
afterEach(() => document.body.replaceChildren());

it.each([
  [
    "직장경력",
    "workHistory.workExperiences",
    "companyName",
    "careerscareer",
    "workExperiences",
  ],
  [
    "공인외국어시험",
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests",
    "testName",
    "languageslanguagetest",
    "certifiedLanguageTests",
  ],
  [
    "외국어활용능력",
    "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies",
    "foreignLanguage",
    "languageslanguageskill",
    "foreignLanguageProficiencies",
  ],
  [
    "자격증 / 면허증",
    "languagesCertificationsAndOtherActivity.certificatesLicenses",
    "credentials",
    "certificationscertificate",
    "certificatesLicenses",
  ],
])(
  "adds %s rows to the requested count and adds none on rerun",
  async (label, prefix, anchor, group, action) => {
    const row = (index: number) =>
      `<div data-scope="accordion" data-part="item" id="generated-${index}-item"><div data-scope="field" data-part="root"><label>항목</label>${anchor === "foreignLanguage" ? `<button type="button" name="${prefix}.${index}.${anchor}">선택</button>` : `<input name="${prefix}.${index}.${anchor}" role="combobox">`}</div></div>`;
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>${label}</label><div data-scope="accordion" data-part="root">${row(0)}</div><button type="button" data-scope="tooltip" data-part="trigger">항목 추가</button></div>`;
    const rows = document.querySelector('[data-scope="accordion"]')!;
    const add = document.querySelector<HTMLButtonElement>(
      '[data-scope="tooltip"]',
    )!;
    let clicks = 0;
    add.onclick = () => {
      clicks++;
      rows.insertAdjacentHTML("beforeend", row(rows.children.length));
    };
    const snapshot = () => {
      const collected = collectPreparationSnapshot(document);
      const candidate = collected.request.sections
        .flatMap((section) => section.actionCandidates)
        .find((candidate) => candidate.domId === `greeting:add:${action}`)!;
      return {
        candidate,
        registry: collected.registry,
        isTargetSectionVisible: () => true,
        countRepeatableGroups: (
          plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
        ) => collected.countRepeatableGroups(plan.actionCandidateId),
      };
    };
    for (let run = 0; run < 2; run++) {
      const initial = snapshot();
      expect(initial.candidate).toBeDefined();
      const result = await executeApprovedPreparationPlans({
        approvedPlans: [
          {
            plan: {
              actionCandidateId: initial.candidate.candidateId,
              command: "ADD_REPEATABLE_GROUP",
              expectedEffect: "GROUP_COUNT_INCREMENT",
            },
            approved: true,
            localItemCount: 3,
          },
        ],
        initialSnapshot: initial,
        refreshSnapshot: async () => snapshot(),
        countRepeatableGroups: (current, plan) =>
          current.countRepeatableGroups?.(plan) ?? -1,
      });
      expect(result.status).toBe("completed");
      expect(clicks).toBe(2);
    }
    expect(
      collectFieldsSnapshot(document)
        .request.sections.flatMap((section) => section.items ?? [])
        .flatMap((item) => item.fields)
        .map((field) => field.semanticContext?.repeat),
    ).toEqual([
      { groupId: group, rowIndex: 0, rowCount: 3 },
      { groupId: group, rowIndex: 1, rowCount: 3 },
      { groupId: group, rowIndex: 2, rowCount: 3 },
    ]);
  },
);

it("emits the high-school singleton with row index zero and row count one", () => {
  document.body.innerHTML =
    '<div data-scope="field" data-part="root"><label>고등학교</label><div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item"><input name="educationalBackground.highSchool.schoolName"></div></div></div>';
  const fields = collectFieldsSnapshot(document)
    .request.sections.flatMap((section) => section.items ?? [])
    .flatMap((item) => item.fields);
  expect(fields[0]?.semanticContext?.repeat).toEqual({
    groupId: "educationhighschool",
    rowIndex: 0,
    rowCount: 1,
  });
  expect(
    collectPreparationSnapshot(document).request.sections.flatMap(
      (section) => section.actionCandidates,
    ),
  ).toEqual([]);
});

it("adds both university additional majors and preserves the count on a second run", async () => {
  const prefix = "educationalBackground.universities.0";
  const major = (index: number) =>
    `<button type="button" name="${prefix}.majors.${index}.majorClassification">주전공</button><button type="button" name="${prefix}.majors.${index}.majorField">선택</button><input name="${prefix}.majors.${index}" role="combobox">`;
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>대학교</label><div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item"><input name="${prefix}.schoolName"><div data-scope="field" data-part="root"><label>전공</label>${major(0)}<button type="button" data-scope="tooltip" data-part="trigger">전공 추가</button></div></div></div></div>`;
  const add = document.querySelector<HTMLButtonElement>(
    '[data-scope="tooltip"]',
  )!;
  let count = 1;
  add.onclick = () => {
    add.insertAdjacentHTML("beforebegin", major(count));
    count++;
  };
  const snapshot = () => {
    const collected = collectPreparationSnapshot(document);
    const action = collected.request.sections
      .flatMap((section) => section.actionCandidates)
      .find(
        (candidate) => candidate.domId === "greeting:add:universities:0:majors",
      )!;
    return {
      action,
      registry: collected.registry,
      isTargetSectionVisible: () => true,
      countRepeatableGroups: (
        plan: Extract<PreparationPlan, { command: "ADD_REPEATABLE_GROUP" }>,
      ) => collected.countRepeatableGroups(plan.actionCandidateId),
    };
  };
  for (let run = 0; run < 2; run++) {
    const initial = snapshot();
    const result = await executeApprovedPreparationPlans({
      approvedPlans: [
        {
          plan: {
            actionCandidateId: initial.action.candidateId,
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          },
          approved: true,
          localItemCount: 3,
        },
      ],
      initialSnapshot: initial,
      refreshSnapshot: async () => snapshot(),
      countRepeatableGroups: (current, plan) =>
        current.countRepeatableGroups?.(plan) ?? -1,
    });
    expect(result.status).toBe("completed");
    expect(count).toBe(3);
    expect(result.executedPlanCount).toBe(run === 0 ? 2 : 0);
  }
});
