import { expect, it } from "vitest";
import { greetingWorkflowAdapter } from "./workflow";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
it.each([
  ["basicInformation.gender", "SELECT_BUTTON_OPTION", 1],
  ["educationalBackground.highSchool.schoolName", "SEARCH_SELECTION", 2],
  ["workHistory.workExperiences.0.companyName", "SEARCH_SELECTION", 2],
  ["workHistory.workExperiences.0.employmentStatus", "CHECK_CHECKBOX", 1],
  [
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.foreignLanguage",
    "SELECT_BUTTON_OPTION",
    1,
  ],
  [
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.testName",
    "SEARCH_SELECTION",
    2,
  ],
  [
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.grade",
    "SELECT_BUTTON_OPTION",
    3,
  ],
  [
    "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies.0.conversationalProficiency",
    "SELECT_BUTTON_OPTION",
    3,
  ],
  [
    "languagesCertificationsAndOtherActivity.certificatesLicenses.0.credentials",
    "SEARCH_SELECTION",
    2,
  ],
])(
  "executes %s through the dependent selection stage",
  (name, command, stage) => {
    const item = {
      candidateId: "f",
      profileValue: "test",
      analysis: {
        candidateId: "f",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        writePlan: { command },
      },
    } as ReviewPlanItem;
    const handle = {
      candidateId: "f",
      candidate: { domName: name },
      elements: [],
      optionElements: new Map(),
    } as unknown as FieldCandidateHandle;
    expect(greetingWorkflowAdapter.isStateDriver(item, name as string)).toBe(
      true,
    );
    expect(greetingWorkflowAdapter.stateDriverStage?.(item, handle)).toBe(
      stage,
    );
  },
);

it("clicks only the exact approved native employment checkbox and preserves an existing selection", async () => {
  document.body.innerHTML = `<div data-scope="field" data-part="root"><label>직장경력</label><div data-scope="accordion" data-part="root"><div data-scope="accordion" data-part="item"><input name="workHistory.workExperiences.0.companyName"><label><input type="checkbox" name="workHistory.workExperiences.0.employmentStatus">재직중</label></div></div></div>`;
  const input = document.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  )!;
  const handle = {
    candidateId: "f",
    candidate: {
      candidateId: "f",
      domName: input.name,
      control: "checkbox",
      options: [{ optionId: "o", displayName: "재직중" }],
    },
    elements: [input],
    optionElements: new Map([["o", input]]),
  } as unknown as FieldCandidateHandle;
  const item = {
    candidateId: "f",
    profileValue: "재직중",
    analysis: {
      candidateId: "f",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "CHECK_CHECKBOX" },
    },
  } as ReviewPlanItem;
  let clicks = 0;
  input.addEventListener("click", () => clicks++);
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(true);
  expect(input.checked).toBe(true);
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(true);
  expect(clicks).toBe(1);
  expect(
    await greetingWorkflowAdapter.executeStateDriver?.(
      document,
      handle,
      { ...item, profileValue: "퇴사" },
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(input.checked).toBe(true);
  document.body.replaceChildren();
});
