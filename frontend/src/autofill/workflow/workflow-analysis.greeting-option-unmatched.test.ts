import { afterEach, beforeEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { greetingWorkflowAdapter } from "../adapters/greeting/workflow";
import { validateFieldsResponse } from "../api/validate-response";
import type { ApprovedWriteResult } from "../write/executor";
import { createAnalyzeFields } from "./workflow-analysis";

beforeEach(() =>
  (
    globalThis as unknown as {
      jsdom: { reconfigure(value: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://sample.career.greetinghr.com/ko/o/1/apply",
  }),
);
afterEach(() => document.body.replaceChildren());

const prefix =
  "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies.0";

function buttonField(name: string, popupId: string, options: string[]) {
  return `<div data-scope="field" data-part="root" role="group"><label>${popupId}</label><button type="button" name="${name}" data-scope="tooltip" data-part="trigger" role="combobox" aria-controls="${popupId}">선택</button></div><div id="${popupId}" role="listbox" hidden>${options
    .map((option) => `<button type="button" role="option">${option}</button>`)
    .join("")}</div>`;
}

function wireButton(name: string) {
  const trigger = document.querySelector<HTMLButtonElement>(
    `[name="${name}"]`,
  )!;
  const popup = document.getElementById(
    trigger.getAttribute("aria-controls")!,
  )!;
  trigger.onclick = () => {
    popup.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };
  popup.querySelectorAll<HTMLElement>("[role=option]").forEach((option) => {
    option.onclick = () => {
      trigger.textContent = option.textContent;
      trigger.setAttribute("aria-expanded", "false");
      popup.hidden = true;
    };
  });
}

async function analyze(
  unmatchedName: string,
  profileKey: string,
  language = "영어",
) {
  const inRow = unmatchedName.startsWith(prefix);
  document.body.innerHTML =
    '<div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item">' +
    buttonField(`${prefix}.foreignLanguage`, "languages", ["영어"]) +
    (inRow ? buttonField(unmatchedName, "levels", ["IH", "IM1"]) : "") +
    "</div></div>" +
    (inRow ? "" : buttonField(unmatchedName, "levels", ["IH", "IM1"]));
  wireButton(`${prefix}.foreignLanguage`);
  wireButton(unmatchedName);
  const profile = createEmptyProfile();
  profile.languages.push({
    id: "skill-row",
    sectionId: "languageSkill",
    values: { language, conversationalLevel: "유창함" },
  });
  profile.personal.gender = "유창함";
  const errors: string[] = [];
  let results: ApprovedWriteResult[] = [];
  const run = createAnalyzeFields({
    adapter: greetingWorkflowAdapter,
    pageDocument: document,
    addressRun: { current: { controller: new AbortController() } },
    addressSearch: async () => false,
    repository: { load: async () => profile },
    approvedSensitiveValues: { current: new Map() },
    consideredSensitiveValues: { current: new Map() },
    freshDefaultControls: { current: new WeakSet() },
    completedDriverKeys: { current: new Set() },
    completedGenericStateDrivers: { current: new Map() },
    deferredDriverGroups: { current: new Set() },
    apiClient: {
      analyzePreparation: async () => {
        throw Error("unexpected preparation");
      },
      analyzeFields: async (request) =>
        validateFieldsResponse(request, {
          snapshotId: request.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          fields: request.sections
            .flatMap((section) => [
              ...section.fields,
              ...(section.items ?? []).flatMap((row) => row.fields),
            ])
            .map((field) => ({
              candidateId: field.candidateId,
              matchType: "MATCH",
              mappingStatus: "ADAPTER_VERIFIED",
              interactionStatus: "READY",
              autofillPolicy: "ALLOWED",
              valueBinding: {
                type: "DIRECT",
                profileFieldKey:
                  field.domName === unmatchedName
                    ? profileKey
                    : "languages.languageSkill.language",
              },
              writePlan: { command: "SELECT_BUTTON_OPTION" },
            })),
        }),
    },
    setAddressResult: () => {},
    setExceptionTitle: (value) => {
      if (typeof value === "string") errors.push(value);
    },
    setStage: () => {},
    setFieldsSnapshot: () => {},
    setReviewItems: () => {},
    setPartial: () => {},
    setWarnings: () => {},
    setResults: (next) => {
      results = typeof next === "function" ? next(results) : next;
    },
  });
  await run(profile);
  const text = (name: string) =>
    document.querySelector(`[name="${name}"]`)?.textContent;
  return { errors, results, text };
}

it.each([`${prefix}.conversationalProficiency`])(
  "skips only %s when no option matches the profile value",
  async (name) => {
    const { errors, results, text } = await analyze(
      name,
      "languages.languageSkill.conversationalLevel",
    );

    expect(errors).toEqual([]);
    expect(text(`${prefix}.foreignLanguage`)).toBe("영어");
    expect(text(name)).toBe("선택");
    expect(results).toEqual([
      { candidateId: expect.any(String), status: "written" },
      expect.objectContaining({
        status: "skipped",
        failureCode: "OPTION_UNMATCHED",
        reason: expect.stringContaining("일치하는 항목을 찾지 못해"),
      }),
    ]);
  },
  10000,
);

it("keeps aborting when a revealing Greeting driver cannot be applied", async () => {
  const { errors, text } = await analyze(
    `${prefix}.conversationalProficiency`,
    "languages.languageSkill.conversationalLevel",
    "독일어",
  );

  expect(errors).toHaveLength(1);
  expect(text(`${prefix}.foreignLanguage`)).toBe("선택");
  expect(text(`${prefix}.conversationalProficiency`)).toBe("선택");
});
