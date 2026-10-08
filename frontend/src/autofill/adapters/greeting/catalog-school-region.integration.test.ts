import { afterEach, expect, it, vi } from "vitest";
import { CATALOG_VERSION } from "../../../profile/catalog";
import { createEmptyProfile } from "../../../profile/model";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../../dom/candidate-registry";
import { buildReviewPlan } from "../../review/review-plan";
import { greetingWorkflowAdapter } from "./workflow";
import type { FieldCandidateHandle } from "../../dom/types";
import type { FieldsAnalyzeResponse } from "../../api/types";
import { matchesResultValue } from "../../workflow/result-value-match";

// Observed Greeting school options (2026-10-07): high schools show the name and
// one sido abbreviation as item-description; universities show only the name.
const HIGH_SCHOOL = {
  section: "highSchool",
  name: "educationalBackground.highSchool.schoolName",
  school: "강동고등학교",
  catalogId: "highSchool:kess:110041601:fc3a718f5d1bacf6",
};
const UNIVERSITY = {
  section: "university",
  name: "educationalBackground.universities.0.schoolName",
  school: "서울대학교",
  catalogId: "university:kess:51012000:a7149b19bd06a284",
};

afterEach(() => document.body.replaceChildren());

async function run(
  target: typeof HIGH_SCHOOL,
  options: { description?: string; hidden?: boolean }[],
) {
  const profile = createEmptyProfile();
  profile.education.push({
    id: "entry",
    sectionId: target.section,
    values: { schoolName: target.school },
    identity: {
      status: "selected",
      catalogId: target.catalogId,
      displayName: target.school,
      originalText: target.school,
      catalogVersion: CATALOG_VERSION,
    },
  });
  document.body.innerHTML = `<input name="${target.name}" data-scope="combobox" data-part="input" role="combobox" aria-controls="choices"><div id="choices" data-scope="scroll-area" data-part="viewport" role="presentation" data-state="open">${options
    .map(
      (option, i) =>
        `<div role="option" data-scope="combobox" data-part="item" data-state="unchecked" data-value="S${i}">${target.school}${option.description ? `<span data-part="item-description" ${option.hidden ? "hidden" : ""}>${option.description}</span>` : ""}<div data-part="item-indicator"></div></div>`,
    )
    .join(
      "",
    )}</div><div data-scope="field" data-part="root"><label>이름</label><input name="basicInformation.name"></div><div data-scope="field" data-part="root"><label>전화</label><input name="basicInformation.phoneNumber.nationalNumber"></div>`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  const clicked = vi.fn();
  document
    .querySelectorAll<HTMLElement>('[role="option"]')
    .forEach((option, i) => {
      option.onclick = () => {
        clicked(i);
        input.value = target.school;
        option.setAttribute("data-state", "checked");
        input.setAttribute("aria-expanded", "false");
      };
    });
  const handle = {
    kind: "field",
    candidateId: "f",
    sectionId: "section",
    itemIndex: 0,
    signature: createStructuralSignature([input]),
    candidate: { candidateId: "f", domName: target.name, control: "text" },
    elements: [input],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const registry = new CandidateRegistry();
  registry.registerField(handle);
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: "snapshot",
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: "f",
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: `education.${target.section}.schoolName`,
        },
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: "ALLOWED",
        writePlan: { command: "SEARCH_SELECTION" },
      },
    ],
  };
  const item = buildReviewPlan({ analysis, registry, profile }).items[0];
  const success = await greetingWorkflowAdapter.executeStateDriver!(
    document,
    handle,
    item,
    new AbortController().signal,
  );
  return { success, clicked, input, item, handle };
}

it("selects the same-name high school whose visible sido matches the catalog entry", async () => {
  const result = await run(HIGH_SCHOOL, [
    { description: "대구" },
    { description: "서울" },
    { description: "울산" },
  ]);
  expect(result.success).toBe(true);
  expect(result.clicked.mock.calls).toEqual([[1]]);
  expect(
    matchesResultValue(
      result.item,
      result.input.value,
      HIGH_SCHOOL.school,
      result.handle,
    ),
  ).toBe(true);
});

it.each([
  { name: "another sido only", options: [{ description: "대구" }] },
  { name: "no visible sido", options: [{}] },
  { name: "hidden sido", options: [{ description: "서울", hidden: true }] },
  {
    name: "duplicate matching sido",
    options: [{ description: "서울" }, { description: "서울" }],
  },
  { name: "unrelated description", options: [{ description: "서울 캠퍼스" }] },
])(
  "keeps the high school fail-closed for $name",
  async ({ options }) => {
    const result = await run(HIGH_SCHOOL, options);
    expect(result.success).toBe(false);
    expect(result.clicked).not.toHaveBeenCalled();
    expect(result.input.value).toBe("");
  },
  8000,
);

it("selects a description-less university when every same-name campus shares the school code", async () => {
  const result = await run(UNIVERSITY, [{}]);
  expect(result.success).toBe(true);
  expect(result.clicked.mock.calls).toEqual([[0]]);
  expect(
    matchesResultValue(
      result.item,
      result.input.value,
      UNIVERSITY.school,
      result.handle,
    ),
  ).toBe(true);
});

it.each([
  {
    name: "a same-name school with another school code",
    target: {
      ...UNIVERSITY,
      school: "국립한밭대학교",
      catalogId: "university:kess:51030000:a7149b19bd06a284",
    },
    options: [{}],
  },
  {
    name: "an unverified description",
    target: UNIVERSITY,
    options: [{ description: "부산" }],
  },
  { name: "duplicate options", target: UNIVERSITY, options: [{}, {}] },
])(
  "keeps the university fail-closed for $name",
  async ({ target, options }) => {
    const result = await run(target, options);
    expect(result.success).toBe(false);
    expect(result.clicked).not.toHaveBeenCalled();
    expect(result.input.value).toBe("");
  },
  8000,
);
