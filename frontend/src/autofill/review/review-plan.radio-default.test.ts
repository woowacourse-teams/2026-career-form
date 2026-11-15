import { afterEach, expect, it } from "vitest";
import type { FieldsAnalyzeResponse } from "../api/types";
import { collectFieldsSnapshot } from "../dom/collect";
import { createEmptyProfile } from "../../profile/model";
import { executeApprovedWrites } from "../write/native-executor";
import { buildReviewPlan } from "./review-plan";

afterEach(() => document.body.replaceChildren());

// The site pre-selects 비대상 before the applicant touches the form.
function mount() {
  document.body.innerHTML = `<form><section><h3>보훈/장애</h3>
    <div><div> 보훈여부 <span>필수</span></div><div><div><div>
      <input id="v0" type="radio" value="A" style="opacity:0;position:absolute"><label for="v0"> 대상 </label>
      <input id="v1" type="radio" value="B" checked style="opacity:0;position:absolute"><label for="v1"> 비대상 </label>
    </div></div></div></div></section></form>`;
  const snapshot = collectFieldsSnapshot(document);
  const field = snapshot.request.sections.flatMap((section) => section.fields)[0]!;
  const analysis: FieldsAnalyzeResponse = {
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
        valueBinding: { type: "DIRECT", profileFieldKey: "veteran.veteran.veteranStatus" },
        writePlan: { command: "CHECK_RADIO" },
      },
    ],
  };
  const profile = createEmptyProfile();
  profile.veteran.veteranStatus = "veteran-status:eligible";
  const [item] = buildReviewPlan({ analysis, profile, registry: snapshot.registry }).items;
  return { item: item!, registry: snapshot.registry };
}

it("replaces a site-preselected radio with the profile choice", () => {
  const { item, registry } = mount();
  expect(item).toMatchObject({ selected: true, disabled: false });
  const [result] = executeApprovedWrites({
    items: [item],
    approvedCandidateIds: new Set([item.candidateId]),
    registry,
  });
  expect(result).toMatchObject({ status: "written" });
  // Unnamed radios do not clear each other natively; the site's framework
  // re-renders the group from the click, so only the chosen radio is checked here.
  expect(document.querySelector<HTMLInputElement>("#v0")!.checked).toBe(true);
});

it("replaces a site-preselected dropdown choice with the profile choice", () => {
  document.body.innerHTML = `<form><section><h3>보훈/장애</h3>
    <label>장애여부 <select id="d"><option>대상</option><option selected>비대상</option></select></label>
  </section></form>`;
  const snapshot = collectFieldsSnapshot(document);
  const field = snapshot.request.sections.flatMap((section) => section.fields)[0]!;
  const profile = createEmptyProfile();
  profile.disability.disabilityStatus = "disability-status:eligible";
  const [item] = buildReviewPlan({
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
            profileFieldKey: "disability.disability.disabilityStatus",
          },
          writePlan: { command: "SELECT_OPTION" },
        },
      ],
    },
    profile,
    registry: snapshot.registry,
  }).items;
  expect(item).toMatchObject({ status: "conflict", selected: true });
});
