import { afterEach, expect, it } from "vitest";
import { PROFILE_CATEGORIES } from "../../profile/field-definitions";
import { createEmptyProfile } from "../../profile/model";
import type { MatchedFieldAnalysis } from "../api/types";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { collectPreparationSnapshot } from "../dom/collect";
import { getWorkflowAdapter } from "../adapters/workflow";
import { preparationItem } from "../workflow/workflow-model";
import { buildReviewPlan } from "./review-plan";

const categories = ["military", "veteran", "disability"] as const;
const values: Record<string, string> = {
  militaryStatus: "군필",
  militaryBranch: "육군",
  militaryRank: "병장",
  veteranStatus: "대상",
  disabilityStatus: "대상",
};
const fields = PROFILE_CATEGORIES.filter((category) =>
  categories.some((id) => id === category.id),
).flatMap((category) =>
  category.sections.flatMap((section) =>
    section.fields.map((field) => ({
      categoryId: category.id as (typeof categories)[number],
      fieldId: field.id,
      key: [category.id, section.id, field.id].join("."),
      value: values[field.id] ?? "합성 테스트값",
    })),
  ),
);

afterEach(() => document.body.replaceChildren());

function review(
  key: string,
  value: string,
  policy: MatchedFieldAnalysis["autofillPolicy"],
  current = "",
) {
  const profile = createEmptyProfile();
  const [category, , field] = key.split(".");
  Object.assign(profile[category as (typeof categories)[number]], {
    [field]: value,
  });
  const element = document.createElement("input");
  element.type = "text";
  element.value = current;
  document.body.append(element);
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "field",
    candidate: {
      candidateId: "field",
      element: "input",
      control: "text",
      visibility: "visible",
    },
    elements: [element],
    optionElements: new Map(),
    sectionId: "section",
    signature: createStructuralSignature([element]),
  });
  return buildReviewPlan({
    profile,
    registry,
    analysis: {
      snapshotId: "snapshot",
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "field",
          matchType: "MATCH",
          valueBinding: { type: "DIRECT", profileFieldKey: key },
          autofillPolicy: policy,
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ],
    },
  }).items[0];
}

it.each(fields)(
  "automatically includes $key without sensitive confirmation",
  ({ key, value }) => {
    for (const policy of ["ALLOWED", "SENSITIVE_CONFIRMATION"] as const) {
      expect(review(key, value, policy)).toMatchObject({
        status: "available",
        selected: true,
        disabled: false,
        revealed: true,
        previewValue: value,
      });
      expect(review(key, value, policy, "기존 테스트값")).toMatchObject({
        status: "conflict",
        selected: false,
        disabled: false,
        revealed: true,
        previewValue: value,
      });
    }
  },
);

it.each(categories)(
  "does not require a reveal/approval click to prepare %s",
  (category) => {
    const fieldId =
      category === "military"
        ? "militaryStatus"
        : category === "veteran"
          ? "veteranStatus"
          : "disabilityStatus";
    const profile = createEmptyProfile();
    profile[category][fieldId] = values[fieldId];
    document.body.innerHTML =
      '<section><label><input type="radio" name="status" value="1">대상</label></section>';
    const snapshot = collectPreparationSnapshot(document);
    const item = preparationItem(
      {
        command: "SELECT_OPTION_TO_REVEAL",
        actionCandidateId: "synthetic-action",
        profileFieldKey: [category, category, fieldId].join("."),
        optionDisplayName: values[fieldId],
        targetSectionId: "synthetic-section",
        expectedEffect: "TARGET_FIELDS_VISIBLE",
        expectedFieldNames: ["detail"],
      },
      snapshot,
      profile,
      getWorkflowAdapter("example.test"),
    );
    expect(item).toMatchObject({
      runnable: true,
      sensitive: false,
      profileValue: values[fieldId],
    });
  },
);

it("keeps unrelated compensation confirmation and profile-search masking", () => {
  expect(
    review("compensation.compensation.desiredSalary", "5000", "ALLOWED"),
  ).toMatchObject({
    status: "sensitive",
    selected: false,
    disabled: true,
    previewValue: "••••••••",
  });
  for (const id of categories)
    expect(
      PROFILE_CATEGORIES.find((category) => category.id === id)?.sensitive,
    ).toBe(true);
});

it.each([
  ["military.military.militaryStatus", "military-status:unverified"],
  ["veteran.veteran.veteranStatus", ""],
  ["disability.disability.disabilityStatus", "veteran-status:eligible"],
])("keeps unsupported or missing %s unavailable", (key, value) => {
  expect(review(key, value, "SENSITIVE_CONFIRMATION")).toMatchObject({
    status: "unavailable",
    selected: false,
    disabled: true,
  });
});
