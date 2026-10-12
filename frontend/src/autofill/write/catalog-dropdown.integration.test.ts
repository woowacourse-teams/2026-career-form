import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { CATALOG_VERSION } from "../../profile/catalog";
import { mountButtonDropdowns } from "../dom/button-dropdown.fixture";
import { collectFieldsSnapshotWithDropdowns } from "../dom/collect";
import { buildReviewPlan } from "../review/review-plan";
import { buildResultModel } from "../workflow/result-model";
import { resultFieldState } from "../workflow/result-field-state";
import { executeApprovedWritesAfterPageSettles } from "./executor";

afterEach(() => {
  document.body.onmousedown = null;
  document.body.replaceChildren();
});

async function setup() {
  const { triggers, menus } = mountButtonDropdowns({ count: 1 });
  const options = menus[0].querySelectorAll('[role="menuitem"]');
  options[0].textContent = "SQLD";
  options[1].textContent = "SQLP";
  triggers[0].setAttribute("aria-label", "자격증명");
  const snapshot = await collectFieldsSnapshotWithDropdowns(document);
  const profile = createEmptyProfile();
  profile.certifications = [
    {
      id: "certificate-1",
      sectionId: "certificate",
      values: { name: "SQL 개발자" },
      identity: {
        status: "selected",
        catalogId: "certificate:kdata:sqld",
        displayName: "SQL 개발자",
        originalText: "SQLD",
        catalogVersion: CATALOG_VERSION,
      },
    },
  ];
  const field = snapshot.request.sections
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.control === "select");
  if (!field) throw new Error("Missing collected dropdown");
  const items = buildReviewPlan({
    profile,
    registry: snapshot.registry,
    analysis: {
      snapshotId: snapshot.request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: field.candidateId,
          matchType: "MATCH",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "READY",
          autofillPolicy: "ALLOWED",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "certifications.certificate.name",
          },
          writePlan: { command: "SELECT_OPTION" },
        },
      ],
    },
  }).items;
  return {
    profile,
    items,
    snapshot,
    triggers,
    menus,
    write: () =>
      executeApprovedWritesAfterPageSettles({
        items,
        registry: snapshot.registry,
        document,
        approvedCandidateIds: new Set([field.candidateId]),
      }),
  };
}

it("selects a verified dropdown alias and preserves final completion", async () => {
  const scenario = await setup();
  const results = await scenario.write();
  expect(scenario.triggers[0].textContent).toBe("SQLD");
  const model = buildResultModel({
    reviewItems: scenario.items,
    results,
    profile: scenario.profile,
    fieldStateFor: (id) =>
      resultFieldState(scenario.snapshot.registry, document, id),
  });
  expect(model.completed).toHaveLength(1);
  expect(model.pending).toHaveLength(0);
  expect(document.querySelector("input")?.value).toBe("기존 합성값");
  expect(scenario.menus[0].hidden).toBe(true);
});

it("rejects identity changed after dropdown review without selecting", async () => {
  const scenario = await setup();
  scenario.items[0].searchIdentity = {
    status: "selected",
    catalogId: "forged",
    displayName: "SQL 개발자",
    originalText: "SQLD",
    catalogVersion: CATALOG_VERSION,
  };
  await scenario.write();
  expect(scenario.triggers[0].textContent).toBe("선택해주세요.");
  expect(document.querySelector("input")?.value).toBe("기존 합성값");
});
