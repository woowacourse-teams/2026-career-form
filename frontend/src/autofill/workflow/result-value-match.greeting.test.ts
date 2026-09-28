import { afterEach, expect, it } from "vitest";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import { matchesResultValue } from "./result-value-match";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { resultFieldState } from "./result-field-state";
import { buildResultModel } from "./result-model";
import { createProgressTracker } from "./progress-model";
afterEach(() => document.body.replaceChildren());
function fixture(
  name = "educationalBackground.universities.0.enrollmentPeriod.startDate",
  key = "education.university.startDate",
) {
  document.body.innerHTML = `<button data-scope="date-picker" data-part="trigger" aria-controls="popup" name="${name}">2020.03</button>`;
  const trigger = document.querySelector("button")!;
  const handle: FieldCandidateHandle = {
    kind: "field",
    candidateId: "date",
    sectionId: "education",
    signature: createStructuralSignature([trigger]),
    candidate: {
      candidateId: "date",
      element: "custom",
      control: "button",
      visibility: "visible",
      domName: name,
    },
    elements: [],
    customElements: [trigger],
    optionElements: new Map(),
  };
  const item: ReviewPlanItem = {
    candidateId: "date",
    fieldLabel: "입학일",
    profileFieldKey: key,
    currentValue: "",
    profileValue: "2020-03-01",
    previewValue: "",
    status: "available",
    selected: true,
    disabled: false,
    revealed: true,
    reason: "",
    analysis: {
      candidateId: "date",
      matchType: "MATCH",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      autofillPolicy: "ALLOWED",
      valueBinding: { type: "DIRECT", profileFieldKey: key },
      writePlan: { command: "SET_TEXT" },
    },
  };
  return { item, handle, trigger };
}
it.each([
  [
    "educationalBackground.universities.0.enrollmentPeriod.startDate",
    "education.university.startDate",
  ],
  [
    "educationalBackground.graduateSchools.1.enrollmentPeriod.endDate",
    "education.graduateSchool.endDate",
  ],
  [
    "militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod.startDate",
    "military.military.serviceStartDate",
  ],
  [
    "militaryServicePreferentialEmploymentStatus.militaryService.servicePeriod.endDate",
    "military.military.serviceEndDate",
  ],
])("compares verified Greeting month precision for %s", (name, key) => {
  const { item, handle } = fixture(name, key);
  expect(matchesResultValue(item, "2020.03", "2020-03-01", handle)).toBe(true);
  expect(matchesResultValue(item, "2020.03", "2020-03", handle)).toBe(true);
  expect(matchesResultValue(item, "2020.04", "2020-03-01", handle)).toBe(false);
  expect(matchesResultValue(item, "2020.03", "2020-03-32", handle)).toBe(false);
});
it("keeps birthday full-day precision", () => {
  const { item, handle } = fixture(
    "basicInformation.birthdate",
    "personal.personal.birthDate",
  );
  expect(matchesResultValue(item, "2000.02.29", "2000-02-29", handle)).toBe(
    true,
  );
  expect(matchesResultValue(item, "2000.02", "2000-02-29", handle)).toBe(false);
  expect(matchesResultValue(item, "2000.02.28", "2000-02-29", handle)).toBe(
    false,
  );
});
it("requires matching live identity and adapter verification", () => {
  const { item, handle, trigger } = fixture();
  expect(matchesResultValue(item, "2020.03", "2020-03-01")).toBe(false);
  item.analysis!.mappingStatus = "LLM_SUGGESTED";
  expect(matchesResultValue(item, "2020.03", "2020-03-01", handle)).toBe(false);
  item.analysis!.mappingStatus = "ADAPTER_VERIFIED";
  trigger.name =
    "educationalBackground.universities.0.enrollmentPeriod.endDate";
  expect(matchesResultValue(item, "2020.03", "2020-03-01", handle)).toBe(false);
  trigger.name = handle.candidate.domName!;
  handle.isCurrentContext = () => false;
  expect(matchesResultValue(item, "2020.03", "2020-03-01", handle)).toBe(false);
});
it("keeps a written month date completed through live result and progress verification", () => {
  const { item, handle, trigger } = fixture();
  const registry = new CandidateRegistry();
  registry.registerField(handle);
  const tracker = createProgressTracker();
  const written = { candidateId: "date", status: "written" as const };
  const progress = tracker.record(item, written, registry);
  const model = () =>
    buildResultModel({
      reviewItems: [item],
      results: [written],
      progress,
      fieldStateFor: (id) => resultFieldState(registry, document, id),
      progressIdFor: (id) => tracker.progressIdFor(id, registry),
      progressStateFor: (id) => tracker.progressStateFor(id),
    });
  expect(model().pending).toEqual([]);
  expect(model().completed).toHaveLength(1);
  trigger.textContent = "2020.04";
  expect(model().completed).toEqual([]);
});

it("does not count an already-matching Greeting month as a new write", () => {
  const { item, handle } = fixture();
  item.currentValue = "2020.03";
  const registry = new CandidateRegistry();
  registry.registerField(handle);
  const [entry] = createProgressTracker().record(
    item,
    { candidateId: item.candidateId, status: "written" },
    registry,
  );
  expect(entry.unchanged).toBe(true);
});

it("compares only verified Greeting GPA scale and veteran number display formats", () => {
  const base = fixture().item;
  const scaleName = "educationalBackground.universities.0.gpa.scoreScale";
  const veteranName =
    "militaryServicePreferentialEmploymentStatus.veteranStatus.veteransRegistrationNumber";
  document.body.innerHTML = `<button name="${scaleName}">4.5</button><input name="${veteranName}" value="12345678">`;
  const scaleButton = document.querySelector("button")!;
  const veteranInput = document.querySelector("input")!;
  const scaleHandle: FieldCandidateHandle = {
    kind: "field",
    candidateId: "scale",
    sectionId: "education",
    signature: createStructuralSignature([scaleButton]),
    candidate: {
      candidateId: "scale",
      element: "input",
      control: "button",
      visibility: "visible",
      domName: scaleName,
    },
    elements: [],
    customElements: [scaleButton],
    optionElements: new Map(),
  };
  const veteranHandle: FieldCandidateHandle = {
    ...scaleHandle,
    candidateId: "veteran",
    candidate: {
      ...scaleHandle.candidate,
      candidateId: "veteran",
      control: "text",
      domName: veteranName,
    },
    signature: createStructuralSignature([veteranInput]),
    elements: [veteranInput],
    customElements: undefined,
  };
  const reviewed = (candidateId: string, key: string, profileValue: string) =>
    ({
      ...base,
      candidateId,
      profileFieldKey: key,
      profileValue,
      analysis: {
        ...base.analysis!,
        candidateId,
        valueBinding: { type: "DIRECT" as const, profileFieldKey: key },
      },
    }) satisfies ReviewPlanItem;
  const scale = reviewed("scale", "education.university.gpaScale", "4.50");
  const veteran = reviewed(
    "veteran",
    "veteran.veteran.veteranNumber",
    "12-345678",
  );
  expect(matchesResultValue(scale, "4.5", "4.50", scaleHandle)).toBe(true);
  expect(
    matchesResultValue(veteran, "12345678", "12-345678", veteranHandle),
  ).toBe(true);
  expect(matchesResultValue(scale, "4.0", "4.50", scaleHandle)).toBe(false);
  expect(
    matchesResultValue(veteran, "12345679", "12-345678", veteranHandle),
  ).toBe(false);
  expect(matchesResultValue(scale, "4.5", "4.50")).toBe(false);
  const registry = new CandidateRegistry();
  registry.registerField(scaleHandle);
  registry.registerField(veteranHandle);
  for (const item of [scale, veteran]) {
    const written = {
      candidateId: item.candidateId,
      status: "written" as const,
    };
    const tracker = createProgressTracker();
    const progress = tracker.record(item, written, registry);
    const model = buildResultModel({
      reviewItems: [item],
      results: [written],
      progress,
      fieldStateFor: (id) => resultFieldState(registry, document, id),
      progressIdFor: (id) => tracker.progressIdFor(id, registry),
      progressStateFor: (id) => tracker.progressStateFor(id),
    });
    expect.soft(model.pending).toEqual([]);
    expect.soft(model.completed).toHaveLength(1);
  }
});

it("rejects a mismatched mapping, detached trigger, and malformed rendered dates", () => {
  const { item, handle, trigger } = fixture();
  item.analysis!.valueBinding = {
    type: "DIRECT",
    profileFieldKey: "education.university.endDate",
  };
  expect(matchesResultValue(item, "2020.03", "2020-03-01", handle)).toBe(false);
  item.analysis!.valueBinding = {
    type: "DIRECT",
    profileFieldKey: "education.university.startDate",
  };
  trigger.remove();
  expect(matchesResultValue(item, "2020.03", "2020-03-01", handle)).toBe(false);
  const birthday = fixture(
    "basicInformation.birthdate",
    "personal.personal.birthDate",
  );
  expect(
    matchesResultValue(
      birthday.item,
      "2000.02-29",
      "2000-02-29",
      birthday.handle,
    ),
  ).toBe(false);
});

it("accepts the live Greeting date spacing only on a verified date trigger", () => {
  const { item, handle } = fixture();
  expect(matchesResultValue(item, "2019. 03", "2019-03-01", handle)).toBe(true);
  expect(matchesResultValue(item, "2023. 02", "2023-02", handle)).toBe(true);
  expect(matchesResultValue(item, "2019. 03", "2019-03-01")).toBe(false);
  expect(matchesResultValue(item, "2019 . 03", "2019-03-01", handle)).toBe(
    false,
  );
  expect(matchesResultValue(item, "2019. 04", "2019-03-01", handle)).toBe(
    false,
  );
  const birthday = fixture(
    "basicInformation.birthdate",
    "personal.personal.birthDate",
  );
  expect(
    matchesResultValue(
      birthday.item,
      "2000. 01. 01",
      "2000-01-01",
      birthday.handle,
    ),
  ).toBe(true);
  expect(
    matchesResultValue(
      birthday.item,
      "2000. 01",
      "2000-01-01",
      birthday.handle,
    ),
  ).toBe(false);
  expect(
    matchesResultValue(
      birthday.item,
      "2000. 01. 02",
      "2000-01-01",
      birthday.handle,
    ),
  ).toBe(false);
  expect(
    matchesResultValue(
      birthday.item,
      "2000. 01-01",
      "2000-01-01",
      birthday.handle,
    ),
  ).toBe(false);
});

it.each([
  [
    "educationalBackground.highSchool.enrollmentPeriod.startDate",
    "education.highSchool.startDate",
  ],
  [
    "workHistory.workExperiences.0.employmentPeriod.startDate",
    "careers.career.startDate",
  ],
  [
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.acquisitionDate",
    "languages.languageTest.acquisitionDate",
  ],
  [
    "languagesCertificationsAndOtherActivity.certificatesLicenses.0.acquisitionDate",
    "certifications.certificate.acquisitionDate",
  ],
])("reads the retained month for %s", (name, key) => {
  const { item, handle } = fixture(name, key);
  expect(matchesResultValue(item, "2020.03", "2020-03-01", handle)).toBe(true);
  expect(matchesResultValue(item, "2020.04", "2020-03-01", handle)).toBe(false);
});
