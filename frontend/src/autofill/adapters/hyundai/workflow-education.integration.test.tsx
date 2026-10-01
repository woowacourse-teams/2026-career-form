import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../../profile/model";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../../api/types";
import { AutofillWorkflow } from "../../workflow/AutofillWorkflow";

const OPTIONS = [
  ["고등학교", "3"],
  ["전문대학", "4"],
  ["학사", "5"],
  ["석사", "6"],
  ["박사", "7"],
] as const;

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function addEducationRow(article: HTMLElement, index: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "field-content";
  row.innerHTML = `<div class="field-group"><div class="field"><div class="select-wrap"><input class="js-field" type="hidden" name="schGb" /><input class="btn-select" type="button" id="schGb_${index}" value="" /><div class="select-option education-option"></div></div></div></div><input type="checkbox" name="finalEducation" value="Y" /><div class="button-wrap"><button class="btn-group-add" type="button">추가</button></div>`;
  const hidden = row.querySelector<HTMLInputElement>("input[name='schGb']")!;
  const trigger = row.querySelector<HTMLInputElement>(`#schGb_${index}`)!;
  const options = row.querySelector<HTMLElement>(".education-option")!;
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "btn-option-reset";
  reset.dataset.code = "";
  reset.textContent = "선택하세요.";
  reset.addEventListener("click", () => {
    hidden.value = "";
    trigger.value = "";
    row
      .querySelectorAll<HTMLInputElement>(".js-education input")
      .forEach((input) => {
        input.value = "";
      });
  });
  options.append(reset);
  for (const [label, code] of OPTIONS) {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.dataset.code = code;
    choice.textContent = label;
    choice.addEventListener("click", () => {
      hidden.value = code;
      trigger.value = label;
      if (row.querySelector(".js-education")) return;
      row.insertAdjacentHTML(
        "beforeend",
        `<div class="js-education"><input id="schNm_${index}" name="schNm" type="text" /><input id="whiStDt_${index}" name="whiStDt" type="text" maxlength="7" /><input id="whiEndDt_${index}" name="whiEndDt" type="text" maxlength="7" /><input id="rcd_${index}" name="rcd" type="text" /></div>`,
      );
    });
    options.append(choice);
  }
  article.append(row);
  row
    .querySelector<HTMLButtonElement>(".btn-group-add")!
    .addEventListener("click", () => {
      article.dataset.addClicks = String(
        Number(article.dataset.addClicks ?? "0") + 1,
      );
      addEducationRow(
        article,
        article.querySelectorAll(":scope > .field-content").length + 1,
      );
    });
  return row;
}

function fieldsResponse(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections.flatMap((section) =>
      (section.items ?? []).flatMap((item) => {
        const sectionId =
          item.itemGroupId === "educationhighschool"
            ? "highSchool"
            : item.itemGroupId === "educationuniversity"
              ? "university"
              : item.itemGroupId === "educationgraduateschool"
                ? "graduateSchool"
                : undefined;
        if (!sectionId) return [];
        return item.fields.flatMap((field) => {
          const fieldId = field.domId ?? "";
          const fieldName = fieldId.startsWith("whiStDt_")
            ? "startDate"
            : fieldId.startsWith("whiEndDt_")
              ? "endDate"
              : fieldId.startsWith("rcd_")
                ? "gpaScore"
                : undefined;
          return fieldName
            ? [
                {
                  candidateId: field.candidateId,
                  matchType: "MATCH" as const,
                  valueBinding: {
                    type: "DIRECT" as const,
                    profileFieldKey: `education.${sectionId}.${fieldName}`,
                  },
                  autofillPolicy: "ALLOWED" as const,
                  mappingStatus: "ADAPTER_VERIFIED" as const,
                  interactionStatus: "READY" as const,
                  writePlan: { command: "SET_TEXT" as const },
                },
              ]
            : [];
        });
      }),
    ),
  };
}

it("prepares Hyundai education once, binds each collected section index, and preserves existing values on rerun", async () => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
  document.body.innerHTML = `<article id="academic" class="field-form-apply"></article>`;
  const article = document.querySelector<HTMLElement>("#academic")!;
  const firstRow = addEducationRow(article, 1);
  firstRow.querySelector<HTMLButtonElement>("button[data-code='3']")!.click();
  firstRow.querySelector<HTMLInputElement>("#schNm_1")!.value = "기존 학교";

  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "high-1",
      sectionId: "highSchool",
      values: { startDate: "2017-03", endDate: "2020-02", gpaScore: "4.0" },
    },
    {
      id: "university-1",
      sectionId: "university",
      values: {
        degreeLevel: "전문학사",
        startDate: "2020-03",
        endDate: "2022-02",
        gpaScore: "4.2",
      },
    },
    {
      id: "university-2",
      sectionId: "university",
      values: {
        degreeLevel: "학사",
        startDate: "2022-03",
        endDate: "2024-02",
        gpaScore: "4.3",
      },
    },
    {
      id: "graduate-1",
      sectionId: "graduateSchool",
      values: {
        degreeLevel: "석사",
        startDate: "2024-03",
        endDate: "2026-02",
        gpaScore: "4.5",
      },
    },
  ];
  let preparationCalls = 0;
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => {
      preparationCalls += 1;
      const action = request.sections
        .flatMap((section) => section.actionCandidates)
        .find((candidate) => candidate.domId === "hyundai:add:academic");
      if (!action) throw new Error("missing verified Hyundai academic action");
      return {
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        preparationPlans: [
          {
            actionCandidateId: action.candidateId,
            command: "ADD_REPEATABLE_GROUP",
            expectedEffect: "GROUP_COUNT_INCREMENT",
          },
        ],
      };
    },
    analyzeFields: async (request) => fieldsResponse(request),
  };
  const workflow = () => (
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />
  );

  const first = render(workflow());
  await waitFor(() => {
    expect(document.querySelector<HTMLInputElement>("#rcd_4")?.value).toBe(
      "4.5",
    );
  });

  expect(article.dataset.addClicks).toBe("3");
  expect(
    Array.from(
      article.querySelectorAll<HTMLInputElement>("input[name='schGb']"),
      (input) => input.value,
    ),
  ).toEqual(["3", "4", "5", "6"]);
  expect(firstRow.querySelector<HTMLInputElement>("#schNm_1")!.value).toBe(
    "기존 학교",
  );
  expect(
    Array.from(
      article.querySelectorAll<HTMLInputElement>("[id^='whiStDt_']"),
      (input) => input.value,
    ),
  ).toEqual(["2017-03", "2020-03", "2022-03", "2024-03"]);

  first.unmount();
  render(workflow());
  await waitFor(() => expect(preparationCalls).toBe(2));
  expect(article.dataset.addClicks).toBe("3");
  expect(firstRow.querySelector<HTMLInputElement>("#schNm_1")!.value).toBe(
    "기존 학교",
  );
});
