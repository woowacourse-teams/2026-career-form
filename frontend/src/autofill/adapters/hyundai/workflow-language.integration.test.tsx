import { fixturePolicy } from "../../../test/fixtures/execution-policy";
import { usePolicyFixture } from "../../../test/fixtures/execution-policy";
usePolicyFixture("hyundai");
import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { CATALOG_VERSION } from "../../../profile/catalog";
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
  {
    profileFieldKey: string;
    optionCodeMap: Record<string, string>;
    /** Profile value to site label; defaults to the identity of the codes. */
    optionMap?: Record<string, string>;
  }
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
      optionCodeMap: { TOEIC: "01", "TOEIC SPEAKING": "15", OPIC: "16" },
      // Mirrors HyundaiCompanyFormPolicyFactory's foreExamCd label aliases.
      optionMap: {
        TOEIC: "TOEIC",
        "TOEIC SPEAKING": "TOEIC SPEAKING",
        OPIC: "OPIC",
        "TOEIC Speaking": "TOEIC SPEAKING",
        토익스피킹: "TOEIC SPEAKING",
      },
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
    executionPolicy: fixturePolicy("hyundai"),
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
              optionMap:
                button.optionMap ??
                Object.fromEntries(
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

function reconfigureHyundaiUrl(): void {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
}

function hyundaiApiClient(): AnalysisApiClient {
  return {
    loadExecutionPolicy: async () => fixturePolicy("hyundai"),
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => analysis(request),
  };
}

it("refreshes changed exam mappings and skips only the failing language row", async () => {
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
    loadExecutionPolicy: async () => fixturePolicy("hyundai"),
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

it("selects TOEIC SPEAKING code for a catalog-selected TOEIC Speaking row", async () => {
  reconfigureHyundaiUrl();
  const exams = [
    ["01", "TOEIC"],
    ["15", "TOEIC SPEAKING"],
  ] as const;
  document.body.innerHTML = `<article id="foreign" class="field-form-apply">
    ${languageRow(1, exams)}
    ${languageRow(2, exams)}
  </article>`;
  wireMenus();
  const profile = createEmptyProfile();
  profile.languages = [
    {
      id: "language-1",
      sectionId: "languageTest",
      values: {
        language: "English",
        testName: "TOEIC Speaking",
        registrationNo: "FIXTURE-REG-1",
      },
      identity: {
        status: "selected",
        catalogId: "languageTest:toeic-speaking",
        displayName: "TOEIC Speaking",
        originalText: "토익스피킹",
        catalogVersion: CATALOG_VERSION,
      },
    },
    {
      id: "language-2",
      sectionId: "languageTest",
      values: {
        language: "English",
        testName: "TOEIC",
        registrationNo: "FIXTURE-REG-2",
      },
      identity: {
        status: "selected",
        catalogId: "languageTest:toeic",
        displayName: "TOEIC",
        originalText: "토익",
        catalogVersion: CATALOG_VERSION,
      },
    },
  ];

  render(
    <AutofillWorkflow
      apiClient={hyundaiApiClient()}
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
  expect(value("#row-1 [name='foreExamCd']")).toBe("15");
  expect(value("#foreExamCd_1")).toBe("TOEIC SPEAKING");
  expect(value("#row-2 [name='foreExamCd']")).toBe("01");
  expect(value("#foreExamCd_2")).toBe("TOEIC");
});
