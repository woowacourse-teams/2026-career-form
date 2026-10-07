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
