import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../../profile/model";
import type {
  AnalysisApiClient,
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../../api/types";
import { AutofillWorkflow } from "../../workflow/AutofillWorkflow";
import {
  installSkAutocompleteMainBridge,
  type SkAutocompleteItem,
  type SkJQuery,
} from "./autocomplete-main";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function candidates(request: FieldsAnalyzeRequest): FieldCandidate[] {
  return request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}

function response(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: candidates(request).map((field) => {
      const profileFieldKey =
        field.domName === "lngLanguageType"
          ? "languages.languageTest.language"
          : field.domName === "eduEducationName"
            ? "education.university.schoolName"
            : field.domName === "cerCertName"
              ? "certifications.certificate.name"
              : field.domName === "lngExamName"
                ? "languages.languageTest.testName"
                : field.domName === "lngExamScore" ||
                    field.domName === "lngExamScoreSel"
                  ? "languages.languageTest.grade"
                  : field.domName === "lngAbilityLanguage"
                    ? "languages.languageSkill.language"
                    : undefined;
      if (!profileFieldKey) {
        return {
          candidateId: field.candidateId,
          matchType: "NO_MATCH" as const,
          mappingStatus: "ADAPTER_VERIFIED" as const,
          interactionStatus: "BLOCKED" as const,
          reasonCodes: ["NO_MATCH" as const],
        };
      }
      const isScore = profileFieldKey.endsWith(".grade");
      return {
        candidateId: field.candidateId,
        matchType: "MATCH" as const,
        valueBinding: { type: "DIRECT" as const, profileFieldKey },
        autofillPolicy:
          field.domName === "lngLanguageType" || field.domName === "lngExamName"
            ? ("CONDITIONAL" as const)
            : ("ALLOWED" as const),
        mappingStatus: "ADAPTER_VERIFIED" as const,
        interactionStatus:
          isScore && field.visibility !== "visible"
            ? ("BLOCKED" as const)
            : ("READY" as const),
        ...(!isScore || field.visibility === "visible"
          ? {
              writePlan: {
                command:
                  field.domName === "lngLanguageType" ||
                  field.domName === "lngExamScoreSel"
                    ? ("SELECT_OPTION" as const)
                    : ("SET_TEXT" as const),
              },
            }
          : {}),
      };
    }),
  };
}

interface Widget {
  input: HTMLInputElement;
  menu: HTMLElement;
  item?: SkAutocompleteItem;
  reveal: () => void;
}

function installWidgets(widgets: readonly Widget[]): () => void {
  const items = new WeakMap<Element, SkAutocompleteItem>();
  const data = new WeakMap<Element, Map<string, unknown>>();
  widgets.forEach((widget) => {
    document.body.append(widget.menu);
    const instance: {
      menu: { element: { 0: HTMLElement; length: number } };
      selectedItem?: SkAutocompleteItem;
      term: string;
      pending: number;
    } = {
      menu: { element: { 0: widget.menu, length: 1 } },
      term: "",
      pending: 0,
    };
    const inputData = new Map<string, unknown>([
      ["ui-autocomplete", instance],
      ["confirmed", false],
    ]);
    data.set(widget.input, inputData);
    widget.input.addEventListener("blur", () => {
      if (inputData.get("confirmed") !== true) widget.input.value = "";
    });
    widget.input.addEventListener("input", () => {
      instance.term = widget.input.value;
      instance.pending = 1;
      setTimeout(() => {
        if (!widget.item) {
          instance.pending = 0;
          return;
        }
        const item = widget.item;
        const result = document.createElement("li");
        result.className = "ui-menu-item";
        const action = document.createElement("div");
        action.className = "ui-menu-item-wrapper";
        action.textContent = String(item.label);
        action.addEventListener("click", () => {
          widget.input.value = String(item.value);
          inputData.set("confirmed", true);
          instance.selectedItem = item;
          widget.reveal();
        });
        result.append(action);
        items.set(result, item);
        widget.menu.append(result);
        instance.pending = 0;
      }, 0);
    });
  });
  const jquery: SkJQuery = (element) => ({
    data: (key) =>
      key === "ui-autocomplete-item"
        ? items.get(element)
        : data.get(element)?.get(key),
    autocomplete: () => data.get(element)?.get("ui-autocomplete") as never,
  });
  return installSkAutocompleteMainBridge(document, jquery);
}

function examRow(id: string, score: "input" | "select"): HTMLDivElement {
  const row = document.createElement("div");
  row.id = id;
  row.className = "form-item-group langExam-Item";
  row.innerHTML = `
    <select name="lngLanguageType"><option value="">언어</option><option value="en">English</option></select>
    <input name="lngExamName" />
    ${score === "input" ? '<input name="lngExamScore" hidden />' : '<select name="lngExamScoreSel" hidden><option value="">등급</option><option value="advanced">Advanced</option></select>'}`;
  return row;
}

it("maps two delayed widget-local exam results and retains both names through the final stage", async () => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/fixture",
  });
  const firstRow = examRow("first-exam", "input");
  const secondRow = examRow("second-exam", "select");
  const examRoot = document.createElement("div");
  examRoot.className = "apply-form-box";
  examRoot.append(firstRow, secondRow);
  const abilityRoot = document.createElement("div");
  abilityRoot.className = "apply-form-box";
  abilityRoot.innerHTML =
    '<div class="form-item-group langAbility-item"><input name="lngAbilityLanguage" /></div>';
  document.body.append(examRoot, abilityRoot);
  const firstExam =
    firstRow.querySelector<HTMLInputElement>("[name=lngExamName]")!;
  const secondExam =
    secondRow.querySelector<HTMLInputElement>("[name=lngExamName]")!;
  const firstScore = firstRow.querySelector<HTMLInputElement>(
    "[name=lngExamScore]",
  )!;
  const secondScore = secondRow.querySelector<HTMLSelectElement>(
    "[name=lngExamScoreSel]",
  )!;
  const removeBridge = installWidgets([
    {
      input: firstExam,
      item: { id: "exam-a", label: "Exam Alpha", value: "Exam Alpha" },
      menu: Object.assign(document.createElement("ul"), {
        className: "ui-menu ui-autocomplete",
      }),
      reveal: () => {
        firstScore.hidden = false;
      },
    },
    {
      input: secondExam,
      item: { id: "exam-b", label: "Exam Beta", value: "Exam Beta" },
      menu: Object.assign(document.createElement("ul"), {
        className: "ui-menu ui-autocomplete",
      }),
      reveal: () => {
        secondScore.hidden = false;
      },
    },
  ]);
  Array.from(
    document.querySelectorAll<HTMLSelectElement>("[name=lngLanguageType]"),
  ).forEach((select) => {
    select.addEventListener("change", () => {
      firstScore.hidden = true;
      secondScore.hidden = true;
    });
  });
  const profile = createEmptyProfile();
  profile.languages = [
    {
      id: "exam-a",
      sectionId: "languageTest",
      values: { language: "English", testName: "Exam Alpha", grade: "830" },
    },
    {
      id: "skill",
      sectionId: "languageSkill",
      values: { language: "Spanish" },
    },
    {
      id: "exam-b",
      sectionId: "languageTest",
      values: { language: "English", testName: "Exam Beta", grade: "Advanced" },
    },
  ];
  let analysisCount = 0;
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => {
      analysisCount += 1;
      return response(request);
    },
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
    expect(firstScore.value).toBe("830");
    expect(secondScore.value).toBe("advanced");
  });
  expect(firstExam.value).toBe("Exam Alpha");
  expect(secondExam.value).toBe("Exam Beta");
  expect(
    document.querySelector<HTMLInputElement>("[name=lngAbilityLanguage]")
      ?.value,
  ).toBe("Spanish");
  expect(analysisCount).toBe(4);
  removeBridge();
});

it.each([
  [
    "eduEducationName",
    "educationUniv-item",
    "education.university.schoolName",
    "school-name",
  ],
  [
    "cerCertName",
    "cert-Item",
    "certifications.certificate.name",
    "certificate-name",
  ],
] as const)(
  "restores an unconfirmed %s search instead of accepting native text",
  async (name, rowClass, profileFieldKey, entryId) => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://www.skcareers.com/Application/Index/fixture",
    });
    document.body.innerHTML = `
      <div class="apply-form-box"><div class="form-item-group ${rowClass}">
        <input name="${name}" />
      </div></div>`;
    const input = document.querySelector<HTMLInputElement>(`[name=${name}]`)!;
    const removeBridge = installWidgets([
      {
        input,
        menu: Object.assign(document.createElement("ul"), {
          className: "ui-menu ui-autocomplete",
        }),
        reveal: () => undefined,
      },
    ]);
    const profile = createEmptyProfile();
    if (profileFieldKey.startsWith("education.")) {
      profile.education = [
        {
          id: entryId,
          sectionId: "university",
          values: { schoolName: "Verified School" },
        },
      ];
    } else {
      profile.certifications = [
        {
          id: entryId,
          sectionId: "certificate",
          values: { name: "Verified Certificate" },
        },
      ];
    }
    const apiClient: AnalysisApiClient = {
      analyzePreparation: async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        preparationPlans: [],
      }),
      analyzeFields: async (request) => response(request),
    };
    render(
      createElement(AutofillWorkflow, {
        apiClient,
        repository: { load: async () => profile },
        pageDocument: document,
        onExit: () => undefined,
      }),
    );
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        "조건부 선택 뒤 입력란을 안전하게 준비하지 못했습니다",
      ),
    );
    expect(input.value).toBe("");
    removeBridge();
  },
);
