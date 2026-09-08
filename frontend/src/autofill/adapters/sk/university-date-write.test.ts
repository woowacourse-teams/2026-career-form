import { afterEach, expect, it } from "vitest";
import type { FieldsAnalyzeResponse } from "../../api/types";
import { collectFieldsSnapshot } from "../../dom/collect";
import { buildReviewPlan } from "../../review/review-plan";
import { executeApprovedWrites } from "../../write/executor";
import { createEmptyProfile } from "../../../profile/model";

afterEach(() => document.body.replaceChildren());

it("writes university year-month values through the site formatter and preserves existing dates", () => {
  document.body.innerHTML = `<section>
    <input id="eduFromDate" name="eduFromDate" type="tel" maxlength="6" placeholder="YYYY-MM" />
    <input id="eduToDate" name="eduToDate" type="tel" maxlength="6" placeholder="YYYY-MM" />
  </section>`;
  const inputs = Array.from(document.querySelectorAll("input"));
  for (const input of inputs) {
    input.addEventListener("input", () => {
      // Six digits are the site's editing limit; the formatter adds a hyphen.
      input.value = input.value
        .replace(/[^0-9]/g, "")
        .replace(/^(\d{4})(\d{2})$/, "$1-$2");
    });
  }
  const profile = createEmptyProfile();
  profile.education = [
    {
      id: "university-example",
      sectionId: "university",
      values: {
        startDate: "2020-03-15",
        endDate: "2024-02-29",
      },
    },
  ];
  const collected = collectFieldsSnapshot(document);
  const candidates = collected.request.sections.flatMap((s) => [
    ...s.fields,
    ...(s.items ?? []).flatMap((i) => i.fields),
  ]);
  const analysis: FieldsAnalyzeResponse = {
    snapshotId: collected.request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      matchType: "MATCH",
      valueBinding: {
        type: "DERIVED",
        recipe: "YEAR_MONTH",
        profileFieldKey:
          candidate.domName === "eduFromDate"
            ? "education.university.startDate"
            : "education.university.endDate",
      },
      autofillPolicy: "ALLOWED",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SET_TEXT" },
    })),
  };
  const run = () => {
    const plan = buildReviewPlan({
      analysis,
      profile,
      registry: collected.registry,
    });
    return executeApprovedWrites({
      items: plan.items,
      approvedCandidateIds: new Set(
        plan.items.filter((i) => i.selected).map((i) => i.candidateId),
      ),
      registry: collected.registry,
    });
  };
  expect(run().filter((result) => result.status === "written")).toHaveLength(2);
  expect(inputs.map((input) => input.value)).toEqual(["2020-03", "2024-02"]);
  inputs[0]!.value = "2019-09";
  run();
  expect(inputs.map((input) => input.value)).toEqual(["2019-09", "2024-02"]);
});
