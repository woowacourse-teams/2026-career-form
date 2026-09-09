import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../api/types";
import { createEmptyProfile } from "../../profile/model";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function candidates(request: FieldsAnalyzeRequest) {
  return request.sections.flatMap(
    (section) =>
      section.items?.flatMap((item) => item.fields) ?? section.fields,
  );
}

function fieldResponse(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  const fields = candidates(request).flatMap<
    FieldsAnalyzeResponse["fields"][number]
  >((field) => {
    const buttonBinding:
      | { profileFieldKey: string; optionCodeMap: Record<string, string> }
      | undefined =
      field.domId === "foreLang_1"
        ? {
            profileFieldKey: "languages.languageTest.language",
            optionCodeMap: { English: "02" },
          }
        : field.domId === "foreExamCd_1"
          ? {
              profileFieldKey: "languages.languageTest.testName",
              optionCodeMap: { OPIC: "16" },
            }
          : field.domId === "gradeForeLang_1"
            ? {
                profileFieldKey: "languages.languageTest.grade",
                optionCodeMap: { IH: "34" },
              }
            : undefined;
    if (buttonBinding) {
      return [
        {
          candidateId: field.candidateId,
          matchType: "MATCH" as const,
          valueBinding: {
            type: "BUTTON_OPTION" as const,
            profileFieldKey: buttonBinding.profileFieldKey,
            optionMap: Object.fromEntries(
              Object.keys(buttonBinding.optionCodeMap).map((value) => [
                value,
                value,
              ]),
            ),
            optionCodeMap: buttonBinding.optionCodeMap,
          },
          autofillPolicy: "CONDITIONAL" as const,
          mappingStatus: "ADAPTER_VERIFIED" as const,
          interactionStatus: "READY" as const,
          writePlan: { command: "SELECT_BUTTON_OPTION" as const },
        },
      ];
    }
    const profileFieldKey =
      field.domName === "acqNm"
        ? "languages.languageTest.registrationNo"
        : field.domName === "acqDt"
          ? "languages.languageTest.acquisitionDate"
          : field.domName === "point"
            ? "languages.languageTest.grade"
            : undefined;
    return profileFieldKey
      ? [
          {
            candidateId: field.candidateId,
            matchType: "MATCH" as const,
            valueBinding: { type: "DIRECT" as const, profileFieldKey },
            autofillPolicy: "ALLOWED" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          },
        ]
      : [];
  });
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER" as const,
    analysisStatus: "COMPLETE" as const,
    fields,
  };
}

it("runs Hyundai language, exam, direct-entry, then text stages in one workflow", async () => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
  document.body.innerHTML = `
    <article id="foreign" class="field-form-apply"><div class="field-content"><div class="field-group">
      <div class="select-wrap"><input type="hidden" class="js-field" name="foreLang" /><input type="button" id="foreLang_1" /></div>
      <div class="select-wrap"><input type="hidden" class="js-field" name="foreExamCd" /><input type="button" id="foreExamCd_1" disabled /></div>
      <input name="acqNm" disabled /><input name="acqDt" disabled />
      <div class="select-wrap"><input type="hidden" class="js-field" name="grade" /><input type="button" id="gradeForeLang_1" class="btn-select" disabled /></div>
    </div></div></article>`;
  const language = document.querySelector<HTMLInputElement>("#foreLang_1")!;
  const exam = document.querySelector<HTMLInputElement>("#foreExamCd_1")!;
  language.addEventListener("click", () => {
    if (language.closest(".select-wrap")?.querySelector(".select-option")) {
      return;
    }
    const option = document.createElement("button");
    option.dataset.code = "02";
    option.textContent = "English";
    Object.defineProperty(option, "offsetParent", { value: document.body });
    option.addEventListener("click", () => {
      language.value = "English";
      document.querySelector<HTMLInputElement>("[name='foreLang']")!.value =
        "02";
      exam.disabled = false;
      const examOption = document.createElement("button");
      examOption.dataset.code = "16";
      examOption.textContent = "OPIC";
      Object.defineProperty(examOption, "offsetParent", {
        value: document.body,
      });
      examOption.addEventListener("click", () => {
        exam.value = "OPIC";
        document.querySelector<HTMLInputElement>("[name='foreExamCd']")!.value =
          "16";
        const direct = document.createElement("button");
        direct.className = "exam_cancle";
        direct.textContent = "직접입력";
        direct.addEventListener("click", () => {
          ["acqNm", "acqDt"].forEach((name) => {
            document.querySelector<HTMLInputElement>(
              `[name='${name}']`,
            )!.disabled = false;
          });
          const grade =
            document.querySelector<HTMLInputElement>("#gradeForeLang_1")!;
          grade.disabled = false;
          setTimeout(() => {
            const gradeOption = document.createElement("button");
            gradeOption.dataset.code = "34";
            gradeOption.textContent = "IH";
            Object.defineProperty(gradeOption, "offsetParent", {
              value: document.body,
            });
            gradeOption.addEventListener("click", () => {
              grade.value = "IH";
              document.querySelector<HTMLInputElement>(
                "[name='grade']",
              )!.value = "34";
            });
            const gradeMenu = document.createElement("div");
            gradeMenu.className = "select-option";
            gradeMenu.append(gradeOption);
            grade.closest(".select-wrap")!.append(gradeMenu);
          }, 0);
        });
        document.querySelector(".field-group")!.append(direct);
      });
      const menu = document.createElement("div");
      menu.className = "select-option";
      menu.append(examOption);
      exam.closest(".select-wrap")!.append(menu);
    });
    const menu = document.createElement("div");
    menu.className = "select-option";
    menu.append(option);
    language.closest(".select-wrap")!.append(menu);
  });
  setTimeout(() => language.click(), 0);
  exam.addEventListener("click", () => undefined);
  const profile = createEmptyProfile();
  profile.languages = [
    {
      id: "language-1",
      sectionId: "languageTest",
      values: {
        language: "English",
        testName: "OPIC",
        registrationNo: "FIXTURE-REG",
        acquisitionDate: "2024-01-15",
        grade: "IH",
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
    analyzeFields: async (request) => fieldResponse(request),
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
    expect(
      document.querySelector<HTMLInputElement>("[name='acqNm']")?.value,
    ).toBe("FIXTURE-REG");
  });
  expect(
    document.querySelector<HTMLInputElement>("[name='acqDt']")?.value,
  ).toBe("2024-01-15");
  expect(
    document.querySelector<HTMLInputElement>("#gradeForeLang_1")?.value,
  ).toBe("IH");
});
