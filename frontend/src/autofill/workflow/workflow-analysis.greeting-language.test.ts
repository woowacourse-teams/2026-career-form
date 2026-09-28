import { afterEach, beforeEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { greetingWorkflowAdapter } from "../adapters/greeting/workflow";
import { validateFieldsResponse } from "../api/validate-response";
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
it.each([false, true])(
  "recollects language then test before filling its newly revealed grade (numeric=%s)",
  async (numeric) => {
    const prefix =
      "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0";
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>공인외국어시험</label><div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item"><button name="${prefix}.foreignLanguage" data-scope="select" data-part="trigger" aria-controls="language">선택</button><input name="${prefix}.testName" disabled data-scope="combobox" data-part="input" role="combobox" aria-controls="tests"><button name="${prefix}.grade" data-scope="tooltip" data-part="trigger" role="combobox" disabled aria-controls="grades">선택</button></div></div></div><div id="language" role="listbox" hidden><button role="option">영어</button></div><div id="tests" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-value="TEST1" data-state="unchecked">${numeric ? "TOEIC" : "OPIc(영어)"}</div></div><div id="grades" role="listbox" hidden><button role="option">Advanced Low</button></div>`;
    const order: string[] = [];
    const language = document.querySelector<HTMLButtonElement>(
      `[name="${prefix}.foreignLanguage"]`,
    )!;
    language.onclick = () => {
      document.getElementById("language")!.hidden = false;
      language.setAttribute("aria-expanded", "true");
    };
    document.querySelector<HTMLElement>('#language [role="option"]')!.onclick =
      () => {
        language.textContent = "영어";
        language.setAttribute("aria-expanded", "false");
        document.getElementById("language")!.hidden = true;
        const old = document.querySelector<HTMLInputElement>(
          `[name="${prefix}.testName"]`,
        )!;
        const fresh = old.cloneNode(true) as HTMLInputElement;
        fresh.disabled = false;
        old.replaceWith(fresh);
        order.push("language");
      };
    document.querySelector<HTMLElement>('#tests [role="option"]')!.onclick = (
      event,
    ) => {
      const test = document.querySelector<HTMLInputElement>(
        `[name="${prefix}.testName"]`,
      )!;
      test.setAttribute("aria-expanded", "false");
      (event.currentTarget as HTMLElement).setAttribute(
        "data-state",
        "checked",
      );
      const old = document.querySelector<HTMLButtonElement>(
        `[name="${prefix}.grade"]`,
      )!;
      if (numeric) {
        const input = document.createElement("input");
        input.name = `${prefix}.score.score`;
        old.replaceWith(input);
      } else {
        const grade = old.cloneNode(true) as HTMLButtonElement;
        grade.disabled = false;
        old.replaceWith(grade);
        grade.onclick = () => {
          document.getElementById("grades")!.hidden = false;
          grade.setAttribute("aria-expanded", "true");
        };
        document.querySelector<HTMLElement>(
          '#grades [role="option"]',
        )!.onclick = () => {
          grade.textContent = "Advanced Low";
          grade.setAttribute("aria-expanded", "false");
          document.getElementById("grades")!.hidden = true;
          order.push("grade");
        };
      }
      order.push("test");
    };
    const profile = createEmptyProfile();
    profile.languages.push({
      id: "test-row",
      sectionId: "languageTest",
      values: {
        language: "영어",
        testName: numeric ? "TOEIC" : "OPIc(영어)",
        grade: numeric ? "900" : "Advanced Low",
      },
    });
    const errors: string[] = [];
    const requests: string[][] = [];
    const analyze = createAnalyzeFields({
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
        analyzeFields: async (request) => {
          const candidates = request.sections.flatMap((s) => [
            ...s.fields,
            ...(s.items ?? []).flatMap((row) => row.fields),
          ]);
          requests.push(candidates.map((f) => f.domName ?? ""));
          return validateFieldsResponse(request, {
            snapshotId: request.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            fields: candidates.map((field) => {
              const name = field.domName ?? "";
              const key = name.endsWith(".foreignLanguage")
                ? "language"
                : name.endsWith(".testName")
                  ? "testName"
                  : name.endsWith(".grade") || name.endsWith(".score.score")
                    ? "grade"
                    : undefined;
              return !key || field.disabled
                ? {
                    candidateId: field.candidateId,
                    matchType: "NO_MATCH",
                    mappingStatus: "ADAPTER_VERIFIED",
                    interactionStatus: "BLOCKED",
                    reasonCodes: ["NO_MATCH"],
                  }
                : {
                    candidateId: field.candidateId,
                    matchType: "MATCH",
                    mappingStatus: "ADAPTER_VERIFIED",
                    interactionStatus: "READY",
                    autofillPolicy: "ALLOWED",
                    valueBinding: {
                      type: "DIRECT",
                      profileFieldKey: `languages.languageTest.${key}`,
                    },
                    writePlan: {
                      command:
                        key === "testName"
                          ? "SEARCH_SELECTION"
                          : name.endsWith(".score.score")
                            ? "SET_TEXT"
                            : "SELECT_BUTTON_OPTION",
                    },
                  };
            }),
          });
        },
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
      setResults: () => {},
    });
    await analyze(profile);
    expect(errors).toEqual([]);
    expect(order).toEqual(
      numeric ? ["language", "test"] : ["language", "test", "grade"],
    );
    expect(requests.length).toBeGreaterThanOrEqual(3);
    if (numeric) {
      expect(requests.at(-1)).toContain(`${prefix}.score.score`);
      expect(
        document.querySelector<HTMLInputElement>(
          `[name="${prefix}.score.score"]`,
        )?.value,
      ).toBe("900");
    } else
      expect(
        document.querySelector(`[name="${prefix}.grade"]`)?.textContent,
      ).toBe("Advanced Low");
  },
  10000,
);
