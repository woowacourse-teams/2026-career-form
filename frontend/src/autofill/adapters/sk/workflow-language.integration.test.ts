import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../../profile/model";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../../api/types";
import { AutofillWorkflow } from "../../workflow/AutofillWorkflow";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function analysis(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  const fields = request.sections.flatMap(
    (section) =>
      section.items?.flatMap((item) => item.fields) ?? section.fields,
  );
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: fields.flatMap<FieldsAnalyzeResponse["fields"][number]>((field) => {
      if (field.domName === "lngLanguageType") {
        return [
          {
            candidateId: field.candidateId,
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "languages.languageTest.language",
            },
            autofillPolicy: "CONDITIONAL",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            writePlan: { command: "SELECT_OPTION" },
          },
        ];
      }
      if (field.domName === "prsEngFirstName") {
        return [
          {
            candidateId: field.candidateId,
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "personal.personal.englishGivenName",
            },
            autofillPolicy: "ALLOWED",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            writePlan: { command: "SET_TEXT" },
          },
        ];
      }
      return [];
    }),
  };
}

it("skips only the exam row whose language selection fails", async () => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/fixture",
  });
  const row = (
    id: string,
  ) => `<div class="form-item-group langExam-Item" id="${id}">
      <select name="lngLanguageType"><option value="">언어</option><option value="en">English</option></select>
    </div>`;
  document.body.innerHTML = `<div class="apply-form-box"><input name="prsEngFirstName"></div>
    <div class="apply-form-box">${row("row-a")}${row("row-b")}</div>`;
  const profile = createEmptyProfile();
  profile.personal.englishGivenName = "Example";
  profile.languages = [
    {
      id: "language-a",
      sectionId: "languageTest",
      values: { language: "Unlisted Language" },
    },
    {
      id: "language-b",
      sectionId: "languageTest",
      values: { language: "English" },
    },
  ];
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => analysis(request),
  };

  render(
    createElement(AutofillWorkflow, {
      apiClient,
      repository: { load: async () => profile },
      pageDocument: document,
      onExit: () => undefined,
    }),
  );

  await waitFor(() => {
    expect(document.body.textContent).toContain("기입 결과");
    expect(
      document.querySelector<HTMLSelectElement>("#row-b select")?.value,
    ).toBe("en");
  });
  expect(
    document.querySelector<HTMLSelectElement>("#row-a select")!.value,
  ).toBe("");
  expect(
    document.querySelector<HTMLInputElement>("[name=prsEngFirstName]")!.value,
  ).toBe("Example");
  expect(document.body.textContent).not.toContain(
    "조건부 선택을 안전하게 완료하지 못했습니다",
  );
});
