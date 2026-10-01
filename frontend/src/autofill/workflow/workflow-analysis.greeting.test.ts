import { beforeEach as useGreetingHost } from "vitest";
useGreetingHost(() => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://kakaomobility.career.greetinghr.com/ko/o/1/apply",
  });
});
import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { greetingWorkflowAdapter } from "../adapters/greeting/workflow";
import { validateFieldsResponse } from "../api/validate-response";
import { createAnalyzeFields } from "./workflow-analysis";

afterEach(() => document.body.replaceChildren());
it("executes server-approved Greeting birth and education dates through their owned calendars", async () => {
  const university = "educationalBackground.universities.0";
  const picker = (name: string, id: string, label: string) =>
    `<div data-scope="field" data-part="root"><label>${label}</label><button type="button" name="${name}" data-scope="date-picker" data-part="trigger" aria-controls="${id}">선택</button></div><div id="${id}" data-scope="date-picker" data-part="content" role="application" aria-label="calendar" hidden><input data-scope="date-picker" data-part="input"></div>`;
  document.body.innerHTML = `<section>${picker("basicInformation.birthdate", "birth", "생년월일")}</section><div data-scope="field" data-part="root"><label>대학교</label><div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item"><input name="${university}.schoolName" data-scope="combobox" data-part="input" role="combobox" aria-controls="schools"><div id="schools" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"><div role="option" data-scope="combobox" data-part="item" data-value="K1" data-state="unchecked">서울대학교</div></div>${picker(`${university}.enrollmentPeriod.startDate`, "start", "입학일")}</div></div></div>`;
  document
    .querySelectorAll<HTMLButtonElement>("button[aria-controls]")
    .forEach((button) => {
      const popup = document.getElementById(
        button.getAttribute("aria-controls")!,
      )!;
      button.onclick = () => {
        popup.hidden = false;
        button.setAttribute("data-state", "open");
      };
      popup.querySelector<HTMLInputElement>("input")!.onkeydown = (event) => {
        if (event.key === "Enter") {
          button.textContent = (event.target as HTMLInputElement).value;
          popup.hidden = true;
          button.setAttribute("data-state", "closed");
        }
      };
    });
  const school = document.querySelector<HTMLInputElement>(
    `[name="${university}.schoolName"]`,
  )!;
  document.querySelector<HTMLElement>('[data-value="K1"]')!.onclick = (
    event,
  ) => {
    school.value = "서울대학교";
    (event.currentTarget as HTMLElement).setAttribute("data-state", "checked");
    school.setAttribute("aria-expanded", "false");
  };
  const profile = createEmptyProfile();
  profile.personal.birthDate = "1990-01-02";
  profile.education.push({
    id: "u1",
    sectionId: "university",
    values: { startDate: "2019-03-01", schoolName: "서울대학교" },
  });
  const errors: string[] = [];
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
        throw new Error("unexpected preparation");
      },
      analyzeFields: async (request) =>
        validateFieldsResponse(
          { ...request, supportedWriteCommands: ["SELECT_DATE"] },
          {
            snapshotId: request.snapshotId,
            mode: "ADAPTER",
            analysisStatus: "COMPLETE",
            fields: request.sections
              .flatMap((section) => [
                ...section.fields,
                ...(section.items ?? []).flatMap((item) => item.fields),
              ])
              .map((field) =>
                !(
                  field.domName?.endsWith("birthdate") ||
                  field.domName?.endsWith("startDate") ||
                  field.domName?.endsWith("schoolName")
                )
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
                        profileFieldKey: field.domName?.endsWith("birthdate")
                          ? "personal.personal.birthDate"
                          : field.domName?.endsWith("schoolName")
                            ? "education.university.schoolName"
                            : "education.university.startDate",
                      },
                      writePlan: {
                        command: field.domName?.endsWith("schoolName")
                          ? "SEARCH_SELECTION"
                          : "SELECT_DATE",
                      },
                    },
              ),
          },
        ),
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
  expect(school.value).toBe("서울대학교");
  expect(
    document.querySelector('[name="basicInformation.birthdate"]')?.textContent,
  ).toBe("1990.01.02");
  expect(
    document.querySelector(`[name="${university}.enrollmentPeriod.startDate"]`)
      ?.textContent,
  ).toBe("2019. 03");
});

it("stops before a Greeting calendar click when the saved profile changes after analysis", async () => {
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>생년월일*</label><button type="button" name="basicInformation.birthdate" data-scope="date-picker" data-part="trigger" aria-controls="birth">선택</button></div>`;
  const trigger = document.querySelector<HTMLButtonElement>("button")!;
  let clicks = 0;
  trigger.onclick = () => clicks++;
  const profile = createEmptyProfile();
  profile.personal.birthDate = "2000-01-01";
  const changedProfile = createEmptyProfile();
  changedProfile.personal.birthDate = "2001-01-01";
  let analyzed = false;
  const errors: string[] = [];
  const analyze = createAnalyzeFields({
    adapter: greetingWorkflowAdapter,
    pageDocument: document,
    addressRun: { current: { controller: new AbortController() } },
    addressSearch: async () => false,
    repository: { load: async () => (analyzed ? changedProfile : profile) },
    approvedSensitiveValues: { current: new Map() },
    consideredSensitiveValues: { current: new Map() },
    freshDefaultControls: { current: new WeakSet() },
    completedDriverKeys: { current: new Set() },
    completedGenericStateDrivers: { current: new Map() },
    deferredDriverGroups: { current: new Set() },
    apiClient: {
      analyzePreparation: async () => {
        throw new Error("unexpected preparation");
      },
      analyzeFields: async (request) => {
        analyzed = true;
        return {
          snapshotId: request.snapshotId,
          mode: "ADAPTER" as const,
          analysisStatus: "COMPLETE" as const,
          fields: request.sections.flatMap((section) =>
            section.fields.map((field) => ({
              candidateId: field.candidateId,
              matchType: "MATCH" as const,
              mappingStatus: "ADAPTER_VERIFIED" as const,
              interactionStatus: "READY" as const,
              autofillPolicy: "ALLOWED" as const,
              valueBinding: {
                type: "DIRECT" as const,
                profileFieldKey: "personal.personal.birthDate",
              },
              writePlan: { command: "SELECT_DATE" as const },
            })),
          ),
        };
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
  expect(clicks).toBe(0);
  expect(errors).toContain(
    "분석 후 프로필이 변경되었습니다. 다시 시작해 주세요",
  );
});

it("recollects a Greeting control after a preceding selection rerenders the form", async () => {
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>이름</label><input name="basicInformation.name"></div><div data-scope="field" data-part="root"><label>연락처</label><input name="basicInformation.phoneNumber.nationalNumber"></div>`;
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "예시";
  profile.contact.phoneNumber = "010-0000-0000";
  let usedFreshPhone = false;
  const errors: string[] = [];
  const analyze = createAnalyzeFields({
    adapter: {
      ...greetingWorkflowAdapter,
      stateDriverStage: () => 1,
      executeStateDriver: async (_document, handle) => {
        const input = handle.elements[0] as HTMLInputElement;
        if (!input.isConnected) return false;
        if (input.name === "basicInformation.name") {
          input.value = "예시";
          document
            .querySelector(
              '[name="basicInformation.phoneNumber.nationalNumber"]',
            )!
            .replaceWith(
              Object.assign(document.createElement("input"), {
                name: "basicInformation.phoneNumber.nationalNumber",
              }),
            );
          return true;
        }
        usedFreshPhone = true;
        input.value = "010-0000-0000";
        return true;
      },
    },
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
        throw new Error("unexpected preparation");
      },
      analyzeFields: async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "COMPLETE" as const,
        fields: request.sections.flatMap((section) =>
          section.fields.map((field) => ({
            candidateId: field.candidateId,
            matchType: "MATCH" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "READY" as const,
            autofillPolicy: "ALLOWED" as const,
            valueBinding: {
              type: "DIRECT" as const,
              profileFieldKey:
                field.domName === "basicInformation.name"
                  ? "personal.personal.koreanFamilyName"
                  : "contact.contact.phoneNumber",
            },
            writePlan: { command: "SET_TEXT" as const },
          })),
        ),
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
    setResults: () => {},
  });

  await analyze(profile);
  expect(usedFreshPhone).toBe(true);
  expect(errors).toEqual([]);
});
