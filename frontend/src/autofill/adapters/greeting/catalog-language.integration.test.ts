import { afterEach, expect, it } from "vitest";
import { CATALOG_VERSION } from "../../../profile/catalog";
import {
  createEmptyProfile,
  type ProfileIdentity,
} from "../../../profile/model";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import { buildReviewPlan } from "../../review/review-plan";
import { matchesResultValue } from "../../workflow/result-value-match";
import { greetingWorkflowAdapter } from "./workflow";

afterEach(() => document.body.replaceChildren());

const selected: ProfileIdentity = {
  status: "selected",
  catalogId: "languageTest:opic",
  displayName: "OPIc",
  originalText: "오픽",
  catalogVersion: CATALOG_VERSION,
};

async function run(
  labels: string[],
  identity: ProfileIdentity = selected,
  value = "OPIc",
  rowLanguage?: string,
) {
  const profile = createEmptyProfile();
  profile.languages = [
    {
      id: "language-1",
      sectionId: "languageTest",
      values: {
        testName: value,
        language: "영어",
        grade: "IH",
        registrationNo: "DEMO-1",
      },
      identity,
    },
  ];
  const before = structuredClone(profile);
  const name =
    "languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.testName";
  document.body.innerHTML = `
    <input name="${name}" data-scope="combobox" data-part="input" role="combobox" aria-controls="exam-options">
    ${rowLanguage === undefined ? "" : `<button type="button" name="languagesCertificationsAndOtherActivity.certifiedLanguageTests.0.foreignLanguage" data-scope="select" data-part="trigger">${rowLanguage}</button>`}
    <div id="exam-options" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open"></div>
    <div data-scope="field" data-part="root"><label>이름</label><input name="basicInformation.name"></div>
    <div data-scope="field" data-part="root"><label>전화</label><input name="basicInformation.phoneNumber.nationalNumber"></div>`;
  const input = document.querySelector<HTMLInputElement>('[role="combobox"]');
  const popup = document.getElementById("exam-options");
  if (!input || !popup) throw new Error("Missing exam fixture");
  labels.forEach((label, index) => {
    const option = document.createElement("div");
    option.setAttribute("role", "option");
    option.setAttribute("data-scope", "combobox");
    option.setAttribute("data-part", "item");
    option.setAttribute("data-state", "unchecked");
    option.setAttribute("data-value", `exam-${index}`);
    option.textContent = label;
    option.onclick = () => {
      input.value = label;
      option.setAttribute("data-state", "checked");
      input.setAttribute("aria-expanded", "false");
    };
    popup.append(option);
  });
  const handle: FieldCandidateHandle = {
    kind: "field",
    candidateId: "exam",
    sectionId: "languages",
    itemIndex: 0,
    signature: createStructuralSignature([input]),
    candidate: {
      candidateId: "exam",
      domName: name,
      element: "input",
      control: "text",
      visibility: "visible",
    },
    elements: [input],
    optionElements: new Map(),
  };
  const registry = new CandidateRegistry();
  registry.registerField(handle);
  const item = buildReviewPlan({
    profile,
    registry,
    analysis: {
      snapshotId: "snapshot",
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "exam",
          matchType: "MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          autofillPolicy: "ALLOWED",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "languages.languageTest.testName",
          },
          writePlan: { command: "SEARCH_SELECTION" },
        },
      ],
    },
  }).items[0];
  const execute = greetingWorkflowAdapter.executeStateDriver;
  if (!execute) throw new Error("Missing Greeting state driver");
  if (item.status === "unavailable") {
    expect(item.disabled).toBe(true);
    expect(item.selected).toBe(false);
    expect(profile).toEqual(before);
    return { success: false, input, item, handle };
  }
  expect(item.searchIdentity).toEqual(identity);
  const success = await execute(
    document,
    handle,
    item,
    new AbortController().signal,
  );
  expect(profile).toEqual(before);
  return { success, input, item, handle };
}

it.each(["OPIC", "오픽"])(
  "selects verified exam alias %s and retains its result match",
  async (label) => {
    const { success, input, item, handle } = await run([label]);
    expect(success).toBe(true);
    expect(input.value).toBe(label);
    expect(matchesResultValue(item, input.value, "OPIc", handle)).toBe(true);
  },
);

it("does not choose between multiple exam aliases", async () => {
  const { success, input } = await run(["OPIC", "오픽"]);
  expect(success).toBe(false);
  expect(input.value).toBe("");
});

it("rejects a certificate identity attached to an exam name", async () => {
  const { success, input } = await run(["OPIc"], {
    ...selected,
    catalogId: "certificate:kdata:sqld",
  });
  expect(success).toBe(false);
  expect(input.value).toBe("");
});

it("does not expand TOEIC to TOEIC Speaking", async () => {
  const { success, input } = await run(
    ["TOEIC Speaking"],
    {
      ...selected,
      catalogId: "languageTest:toeic",
      displayName: "TOEIC",
    },
    "TOEIC",
  );
  expect(success).toBe(false);
  expect(input.value).toBe("");
}, 8000);

it("does not infer an exam identity for manually entered aliases", async () => {
  const { success, input } = await run(
    ["OPIc"],
    {
      status: "manual",
      originalText: "오픽",
    },
    "오픽",
  );
  expect(success).toBe(false);
  expect(input.value).toBe("");
}, 8000);

// Observed Greeting exam options (2026-10-07) qualify OPIc by language, e.g.
// "OPIc(영어)", and render no plain "OPIc" option.
const observedOpic = ["OPIc(러시아어)", "OPIc(영어)", "OPIc(일본어)"];

it("selects the OPIc option qualified by the row's visible language", async () => {
  const { success, input, item, handle } = await run(
    observedOpic,
    selected,
    "OPIc",
    "영어",
  );
  expect(success).toBe(true);
  expect(input.value).toBe("OPIc(영어)");
  expect(matchesResultValue(item, input.value, "OPIc", handle)).toBe(true);
});

it.each([
  { name: "no row language control", rowLanguage: undefined },
  { name: "an unselected row language", rowLanguage: "선택" },
  { name: "a language without an option", rowLanguage: "독일어" },
])(
  "keeps language-qualified OPIc fail-closed with $name",
  async ({ rowLanguage }) => {
    const { success, input } = await run(
      observedOpic,
      selected,
      "OPIc",
      rowLanguage,
    );
    expect(success).toBe(false);
    expect(input.value).toBe("");
  },
  8000,
);

it("does not treat OPI as OPIc even with a matching row language", async () => {
  const { success, input } = await run(
    ["OPI(English)", "OPI(영어)"],
    selected,
    "OPIc",
    "영어",
  );
  expect(success).toBe(false);
  expect(input.value).toBe("");
}, 8000);
