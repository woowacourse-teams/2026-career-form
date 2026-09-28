import { afterEach, beforeEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { greetingWorkflowAdapter } from "../adapters/greeting/workflow";
import { validateFieldsResponse } from "../api/validate-response";
import { createAnalyzeFields } from "./workflow-analysis";
import type { ReviewPlanItem } from "../review/review-plan";
beforeEach(() =>
  (
    globalThis as unknown as {
      jsdom: { reconfigure(v: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://sample.career.greetinghr.com/ko/o/1/apply",
  }),
);
afterEach(() => document.body.replaceChildren());
it.each([
  ["퇴사", false, 0],
  ["퇴사", true, 0],
  ["재직중", false, 1],
] as const)(
  "continues the real career pipeline for %s with checked=%s",
  async (status, checked, expectedClicks) => {
    const prefix = "workHistory.workExperiences.0";
    document.body.innerHTML = `<div data-scope="field" data-part="root"><label>직장경력</label><div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item"><input name="${prefix}.companyName"><label><input type="checkbox" name="${prefix}.employmentStatus" ${checked ? "checked" : ""}>재직 중</label><input name="${prefix}.department"><textarea name="${prefix}.dutiesResponsibility"></textarea></div></div></div>`;
    const checkbox = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    let clicks = 0;
    checkbox.onclick = () => {
      clicks++;
      const department = document.querySelector<HTMLInputElement>(
        `[name="${prefix}.department"]`,
      )!;
      department.replaceWith(department.cloneNode(true));
    };
    const profile = createEmptyProfile();
    profile.careers.push({
      id: "career",
      sectionId: "career",
      values: {
        employmentStatus: status,
        department: "개발",
        responsibilities: "구현",
      },
    });
    const errors: string[] = [];
    let items: ReviewPlanItem[] = [];
    let analyses = 0;
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
          throw Error("unexpected prep");
        },
        analyzeFields: async (request) => {
          analyses++;
          return validateFieldsResponse(request, {
            snapshotId: request.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            fields: request.sections
              .flatMap((s) => [
                ...s.fields,
                ...(s.items ?? []).flatMap((r) => r.fields),
              ])
              .map((field) => {
                const key = field.domName?.endsWith("employmentStatus")
                  ? "employmentStatus"
                  : field.domName?.endsWith("department")
                    ? "department"
                    : field.domName?.endsWith("dutiesResponsibility")
                      ? "responsibilities"
                      : undefined;
                return !key
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
                        profileFieldKey: `careers.career.${key}`,
                      },
                      writePlan: {
                        command:
                          key === "employmentStatus"
                            ? "CHECK_CHECKBOX"
                            : "SET_TEXT",
                      },
                    };
              }),
          });
        },
      },
      setAddressResult: () => {},
      setExceptionTitle: (v) => {
        if (typeof v === "string") errors.push(v);
      },
      setStage: () => {},
      setFieldsSnapshot: () => {},
      setReviewItems: (v) => {
        if (Array.isArray(v)) items = v;
      },
      setPartial: () => {},
      setWarnings: () => {},
      setResults: () => {},
    });
    await analyze(profile);
    expect(errors).toEqual([]);
    expect(clicks).toBe(expectedClicks);
    expect(checkbox.checked).toBe(checked || status === "재직중");
    expect(
      document.querySelector<HTMLInputElement>(`[name="${prefix}.department"]`)
        ?.value,
    ).toBe("개발");
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "구현",
    );
    if (status === "퇴사" && checked)
      expect(
        items.find(
          (item) => item.profileFieldKey === "careers.career.employmentStatus",
        ),
      ).toMatchObject({ status: "conflict", selected: false });
    else expect(analyses).toBeGreaterThanOrEqual(2);
  },
  10000,
);
