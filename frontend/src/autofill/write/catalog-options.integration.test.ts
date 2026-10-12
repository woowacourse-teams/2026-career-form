import { afterEach, expect, it } from "vitest";
import { createEmptyProfile, type ProfileIdentity } from "../../profile/model";
import { CATALOG_VERSION } from "../../profile/catalog";
import {
  CandidateRegistry,
  createStructuralSignature,
} from "../dom/candidate-registry";
import { buildReviewPlan } from "../review/review-plan";
import {
  executeApprovedWrites,
  executeApprovedWritesAfterPageSettles,
} from "./executor";
import { buildResultModel } from "../workflow/result-model";
import { resultFieldState } from "../workflow/result-field-state";
import { settledGenericResult } from "./native-executor";

afterEach(() => document.body.replaceChildren());
const selection = {
  status: "selected",
  catalogId: "certificate:kdata:sqld",
  displayName: "SQL 개발자",
  originalText: "SQLD",
  catalogVersion: CATALOG_VERSION,
} as const;

function setup(
  labels: string[],
  identity: ProfileIdentity = selection,
  mapped = false,
) {
  const profile = createEmptyProfile();
  profile.certifications = [
    {
      id: "certificate-1",
      sectionId: "certificate",
      values: { name: "SQL 개발자", issuer: "사용자 기관" },
      identity,
    },
  ];
  const select = document.createElement("select");
  select.append(new Option("선택", ""));
  const options = labels.map(
    (label, index) => new Option(label, `site-${index}`),
  );
  select.append(...options);
  const protectedField = document.createElement("input");
  protectedField.value = "보존";
  document.body.append(select, protectedField);
  const registry = new CandidateRegistry();
  registry.registerField({
    kind: "field",
    candidateId: "certificate",
    sectionId: "section",
    itemIndex: 0,
    signature: createStructuralSignature([select]),
    elements: [select],
    candidate: {
      candidateId: "certificate",
      element: "select",
      control: "select",
      visibility: "visible",
      options: labels.map((displayName, index) => ({
        optionId: `option-${index}`,
        displayName,
      })),
    },
    optionElements: new Map(
      options.map((option, index) => [`option-${index}`, option]),
    ),
  });
  const items = buildReviewPlan({
    profile,
    registry,
    analysis: {
      snapshotId: "snapshot",
      mode: mapped ? "ADAPTER" : "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: "certificate",
          matchType: "MATCH",
          mappingStatus: mapped ? "ADAPTER_VERIFIED" : "LLM_SUGGESTED",
          interactionStatus: "READY",
          autofillPolicy: "ALLOWED",
          valueBinding: mapped
            ? {
                type: "LOOKUP",
                profileFieldKey: "certifications.certificate.name",
                optionMap: { "SQL 개발자": "SQLD" },
              }
            : {
                type: "DIRECT",
                profileFieldKey: "certifications.certificate.name",
              },
          writePlan: { command: "SELECT_OPTION" },
        },
      ],
    },
  }).items;
  return {
    select,
    protectedField,
    items,
    profile,
    registry,
    write: () =>
      executeApprovedWrites({
        items,
        registry,
        approvedCandidateIds: new Set(["certificate"]),
      }),
  };
}

it("selects a catalog alias through generic review and native select without changing siblings", () => {
  const scenario = setup(["SQLD"]);
  const result = scenario.write();
  expect(result[0]?.status).toBe("written");
  expect(scenario.select.value).toBe("site-0");
  expect(scenario.protectedField.value).toBe("보존");
});

it("retains a selected alias in the actual final result model", () => {
  const scenario = setup(["SQLD"]);
  const results = scenario.write();
  const model = buildResultModel({
    reviewItems: scenario.items,
    results,
    profile: scenario.profile,
    fieldStateFor: (id) => resultFieldState(scenario.registry, document, id),
  });
  expect(model.completed).toHaveLength(1);
  expect(model.pending).toHaveLength(0);
});

it("rejects a retained catalog label whose selected site code changed", () => {
  const scenario = setup(["SQLD"]);
  expect(scenario.write()[0]?.status).toBe("written");
  scenario.select.selectedOptions[0].value = "different-site-code";
  expect(
    settledGenericResult(scenario.items[0], scenario.registry).status,
  ).toBe("skipped");
});

it("does not repair a changed catalog selection through the static retry loop", async () => {
  const scenario = setup(["SQLD"], selection, true);
  let changed = false;
  const results = await executeApprovedWritesAfterPageSettles({
    items: scenario.items,
    registry: scenario.registry,
    document,
    approvedCandidateIds: new Set(["certificate"]),
    onResult: (_item, result) => {
      if (!changed && result.status === "written") {
        changed = true;
        scenario.select.selectedOptions[0].value = "user-changed-code";
      }
    },
  });
  expect(changed).toBe(true);
  expect(results[0]?.status).toBe("skipped");
  expect(scenario.select.value).toBe("user-changed-code");
});

it("preserves authorized static LOOKUP mappings with the canonical identity source", () => {
  const scenario = setup(["SQLD"], selection, true);
  expect(scenario.write()[0]?.status).toBe("written");
  expect(scenario.select.value).toBe("site-0");
});

it("rejects invalid selected identity before an otherwise exact option write", () => {
  const scenario = setup(["SQL 개발자"], {
    ...selection,
    catalogId: "unknown",
  });
  scenario.write();
  expect(scenario.items[0]?.status).toBe("unavailable");
  expect(scenario.select.value).toBe("");
});

it("rejects two live labels identifying the same selected qualification", () => {
  const scenario = setup(["SQL 개발자", "SQLD"]);
  scenario.write();
  expect(scenario.select.value).toBe("");
});

it("rejects a selected identity changed after review before writing", () => {
  const scenario = setup(["SQLD"]);
  scenario.items[0].searchIdentity = { ...selection, catalogVersion: "old" };
  scenario.write();
  expect(scenario.select.value).toBe("");
});

it("preserves manual exact matching without inferring a catalog identity", () => {
  const scenario = setup(["SQL 개발자"], {
    status: "manual",
    originalText: "SQL 개발자",
  });
  expect(scenario.write()[0]?.status).toBe("written");
  expect(scenario.select.value).toBe("site-0");
});
