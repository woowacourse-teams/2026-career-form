import {
  fixturePolicy,
  usePolicyFixture,
} from "../../test/fixtures/execution-policy";
usePolicyFixture("greeting");
import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import type { FieldsAnalyzeResponse } from "../api/types";
import { buildReviewPlan } from "./review-plan";

afterEach(() => document.body.replaceChildren());

function item(
  section: "highSchool" | "university",
  schoolRegion: string | undefined,
  pageValue = "",
) {
  const name =
    section === "highSchool"
      ? "educationalBackground.highSchool.schoolName"
      : "educationalBackground.universities.0.schoolName";
  document.body.innerHTML = `<input name="${name}" data-scope="combobox" data-part="input" role="combobox" aria-controls="choices">`;
  const input = document.querySelector<HTMLInputElement>("input")!;
  input.value = pageValue;
  const handle = {
    kind: "field",
    candidateId: "f",
    sectionId: "section",
    itemIndex: 0,
    signature: createStructuralSignature([input]),
    candidate: { candidateId: "f", domName: name, control: "text" },
    elements: [input],
    optionElements: new Map(),
  } as unknown as FieldCandidateHandle;
  const registry = new CandidateRegistry();
  registry.registerField(handle);
  const profile = createEmptyProfile();
  profile.education.push({
    id: "entry",
    sectionId: section,
    values: {
      schoolName: "예시학교",
      ...(schoolRegion === undefined ? {} : { schoolRegion }),
    },
  });
  const analysis: FieldsAnalyzeResponse = {
    executionPolicy: fixturePolicy("greeting"),
    snapshotId: "snapshot",
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: [
      {
        candidateId: "f",
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: `education.${section}.schoolName`,
        },
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: "ALLOWED",
        writePlan: { command: "SEARCH_SELECTION" },
      },
    ],
  };
  return buildReviewPlan({ analysis, registry, profile }).items[0];
}

it("carries the same high-school entry's region label as local searchRegion", () => {
  expect(item("highSchool", "region:seoul").searchRegion).toBe("서울");
  expect(item("highSchool", "서울특별시").searchRegion).toBe("서울");
  expect(item("highSchool", "어딘가").searchRegion).toBeUndefined();
  expect(item("highSchool", undefined).searchRegion).toBeUndefined();
  expect(item("university", "region:seoul").searchRegion).toBeUndefined();
});

it("keeps searchRegion on a high-school item with an existing page value", () => {
  const conflict = item("highSchool", "region:seoul", "다른학교");
  expect(conflict.status).toBe("conflict");
  expect(conflict.searchRegion).toBe("서울");
});
