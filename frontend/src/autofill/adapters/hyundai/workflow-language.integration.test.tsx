import { render, waitFor } from "@testing-library/react";
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

const BUTTON_BINDINGS = new Map<
  string,
  { profileFieldKey: string; optionCodeMap: Record<string, string> }
>([
  [
    "foreLang",
    {
      profileFieldKey: "languages.languageTest.language",
      optionCodeMap: { English: "02" },
    },
  ],
  [
    "foreExamCd",
    {
      profileFieldKey: "languages.languageTest.testName",
      optionCodeMap: { TOEIC: "01", OPIC: "16" },
    },
  ],
]);
const TEXT_BINDINGS = new Map([
  ["acqNm", "languages.languageTest.registrationNo"],
  ["acqDt", "languages.languageTest.acquisitionDate"],
]);

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
      const base = (field.domName ?? field.domId ?? "").replace(/_[0-9]+$/, "");
      const button = BUTTON_BINDINGS.get(base);
      if (button) {
        return [
          {
            candidateId: field.candidateId,
            matchType: "MATCH",
            valueBinding: {
              type: "BUTTON_OPTION",
              profileFieldKey: button.profileFieldKey,
              optionMap: Object.fromEntries(
                Object.keys(button.optionCodeMap).map((value) => [
                  value,
                  value,
                ]),
              ),
              optionCodeMap: button.optionCodeMap,
            },
            autofillPolicy: "CONDITIONAL",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "READY",
            writePlan: { command: "SELECT_BUTTON_OPTION" },
          },
        ];
      }
      const profileFieldKey = TEXT_BINDINGS.get(base);
      return profileFieldKey
        ? [
            {
              candidateId: field.candidateId,
              matchType: "MATCH",
              valueBinding: { type: "DIRECT", profileFieldKey },
              autofillPolicy: "ALLOWED",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "READY",
              writePlan: { command: "SET_TEXT" },
            },
          ]
        : [];
    }),
  };
}

function languageRow(
  index: number,
  examOptions: ReadonlyArray<readonly [string, string]>,
): string {
  const exams = examOptions
    .map(
      ([code, label]) =>
        `<button type="button" data-code="${code}">${label}</button>`,
    )
    .join("");
  return `<div class="field-content"><div class="field-group" id="row-${index}">
    <div class="select-wrap"><input type="hidden" class="js-field" name="foreLang" /><input type="button" class="btn-select" id="foreLang_${index}" /><div class="select-option"><button type="button" data-code="02">English</button></div></div>
    <div class="select-wrap"><input type="hidden" class="js-field" name="foreExamCd" /><input type="button" class="btn-select" id="foreExamCd_${index}" disabled /><div class="select-option">${exams}</div></div>
    <input name="acqNm" /><input name="acqDt" /><input name="point" />
  </div></div>`;
}

function wireMenus(): void {
  for (const option of document.querySelectorAll<HTMLButtonElement>(
    ".select-option button",
  )) {
    Object.defineProperty(option, "offsetParent", { value: document.body });
    option.addEventListener("click", () => {
      const wrap = option.closest(".select-wrap")!;
      wrap.querySelector<HTMLInputElement>("input[type='button']")!.value =
        option.textContent ?? "";
      wrap.querySelector<HTMLInputElement>("input[type='hidden']")!.value =
        option.dataset.code ?? "";
      if (wrap.querySelector("[name='foreLang']")) {
        wrap
          .closest(".field-group")!
          .querySelector<HTMLInputElement>("[id^='foreExamCd_']")!.disabled =
          false;
      }
    });
  }
}

it("skips only the language row whose exam selection fails", async () => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
  document.body.innerHTML = `<article id="foreign" class="field-form-apply">
    ${languageRow(1, [["99", "OTHER"]])}
    ${languageRow(2, [["16", "OPIC"]])}
  </article>`;
  wireMenus();
  const profile = createEmptyProfile();
  profile.languages = [
    {
      id: "language-1",
      sectionId: "languageTest",
      values: {
        language: "English",
        testName: "TOEIC",
        registrationNo: "FIXTURE-REG-1",
        acquisitionDate: "2024-01-15",
      },
    },
    {
      id: "language-2",
      sectionId: "languageTest",
      values: {
        language: "English",
        testName: "OPIC",
        registrationNo: "FIXTURE-REG-2",
        acquisitionDate: "2024-02-20",
      },
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
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  await waitFor(() => {
    expect(document.body.textContent).toContain("기입 결과");
    expect(
      document.querySelector<HTMLInputElement>("#row-2 [name='acqNm']")?.value,
    ).toBe("FIXTURE-REG-2");
  });
  const value = (selector: string) =>
    document.querySelector<HTMLInputElement>(selector)!.value;
  expect(value("#row-2 [name='foreExamCd']")).toBe("16");
  expect(value("#row-2 [name='acqDt']")).toBe("2024-02-20");
  expect(value("#row-1 [name='foreExamCd']")).toBe("");
  expect(value("#row-1 [name='acqNm']")).toBe("");
  expect(value("#row-1 [name='acqDt']")).toBe("");
  expect(document.body.textContent).not.toContain(
    "조건부 선택을 안전하게 완료하지 못했습니다",
  );
});
