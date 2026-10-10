import { afterEach, expect, it } from "vitest";

import {
  collectFieldsSnapshot,
  collectFieldsSnapshotWithDropdowns,
} from "../dom/collect";
import { mountButtonDropdowns } from "../dom/button-dropdown.fixture";
import { buildReviewPlan } from "../review/review-plan";
import { createEmptyProfile } from "../../profile/model";
import {
  renderHplaceLogin,
  resetHplacePage,
} from "../workflow/test-utils/hplace.fixture";
import {
  executeApprovedWrites,
  executeApprovedWritesAfterPageSettles,
} from "./executor";

afterEach(() => {
  document.body.onmousedown = null;
  resetHplacePage();
});

it.each(["before-execution", "before-mutation"] as const)(
  "blocks specialized dropdown writes when Hplace is identified %s",
  async (phase) => {
    renderHplaceLogin();
    const assets = document.head.innerHTML;
    const roots = [...document.body.children];
    document.head.replaceChildren();
    const { triggers } = mountButtonDropdowns({ count: 1 });
    const snapshot = await collectFieldsSnapshotWithDropdowns(document);
    const field = snapshot.request.sections
      .flatMap((section) => section.fields)
      .find((field) => field.control === "select")!;
    const profile = createEmptyProfile();
    profile.personal.koreanGivenName = "해당";
    const plan = buildReviewPlan({
      registry: snapshot.registry,
      profile,
      analysis: {
        snapshotId: snapshot.request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: [
          {
            candidateId: field.candidateId,
            matchType: "MATCH",
            valueBinding: {
              type: "DIRECT",
              profileFieldKey: "personal.personal.koreanGivenName",
            },
            autofillPolicy: "ALLOWED",
            mappingStatus: "LLM_SUGGESTED",
            interactionStatus: "READY",
            writePlan: { command: "SELECT_OPTION" },
          },
        ],
      },
    });
    const identify = () => {
      document.head.innerHTML = assets;
      document.body.append(...roots);
    };
    let clicks = 0;
    triggers[0].addEventListener("click", () => {
      clicks += 1;
    });
    if (phase === "before-execution") identify();
    const results = await executeApprovedWritesAfterPageSettles({
      items: plan.items,
      approvedCandidateIds: new Set([field.candidateId]),
      registry: snapshot.registry,
      document,
      beforeWrite: async () => {
        if (phase === "before-mutation") identify();
      },
    });
    expect(clicks).toBe(0);
    expect(triggers[0].textContent).toBe("선택해주세요.");
    expect(results.some((result) => result.status === "written")).toBe(false);
  },
);

it("does not fall back to a native writer on an identified Hplace screen", () => {
  renderHplaceLogin();
  const snapshot = collectFieldsSnapshot(document);
  const field = snapshot.request.sections.flatMap(
    (section) => section.fields,
  )[0];
  const profile = createEmptyProfile();
  profile.contact.email = "synthetic@example.test";
  const plan = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: {
      snapshotId: snapshot.request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: field.candidateId,
          matchType: "MATCH",
          profileFieldKey: "contact.contact.email",
          autofillPolicy: "ALLOWED",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        },
      ],
    },
  });
  const results = executeApprovedWrites({
    items: plan.items,
    approvedCandidateIds: new Set([field.candidateId]),
    registry: snapshot.registry,
  });

  expect(results.some((result) => result.status === "written")).toBe(false);
  expect(document.querySelector<HTMLInputElement>("[name=email]")!.value).toBe(
    "",
  );
});
