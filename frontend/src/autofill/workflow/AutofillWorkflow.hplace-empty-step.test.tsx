import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import seed from "../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json";
import { createEmptyProfile } from "../../profile/model";
import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../api/types";
import { withFixtureTimeouts } from "../policy/__fixtures__/hplace-mrs2-timeouts";
import { AutofillWorkflow } from "./AutofillWorkflow";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "./execution-policy";
import { resetHplacePage, setHplacePage } from "./test-utils/hplace.fixture";

afterEach(() => {
  cleanup();
  resetHplacePage();
  installExecutionPolicy(document);
});

// MRS2 step 4 as observed on five tenants (2026-10-22 live QA): the native
// shell is present, but the step holds only cover-letter textareas that no
// section contract owns. Values are absent; names are synthetic.
function mountEssayStep(): ExecutionPolicy {
  setHplacePage(
    "https://synthetic.recruiter.im/mrs2/applicant/resume/writeResume",
  );
  window.history.replaceState({}, "", "/mrs2/applicant/resume/writeResume");
  const policy = withFixtureTimeouts(
    structuredClone(seed.executionPolicy) as unknown as ExecutionPolicy,
  );
  document.body.innerHTML =
    seed.executionPolicy.browserPolicy.nativeForm.assetPaths
      .map((src) => `<script src="${src}"></script>`)
      .join("") +
    `<form id="frm"><div id="wrapResume"><section class="writeResume" data-code="180">` +
    `<div class="subject"><label for="essay0">자기소개서 1</label><textarea id="essay0" name="selfIntroduction[0].content" maxlength="2000"></textarea></div>` +
    `<div class="subject"><label for="essay1">자기소개서 2</label><textarea id="essay1" name="selfIntroduction[1].content" maxlength="2000"></textarea></div>` +
    `</section></div></form>`;
  installExecutionPolicy(document, policy);
  return policy;
}

const fieldCount = (request: FieldsAnalyzeRequest) =>
  request.sections.reduce(
    (count, section) =>
      count +
      section.fields.length +
      (section.items ?? []).reduce(
        (total, item) => total + item.fields.length,
        0,
      ),
    0,
  );

it("ends on an empty result instead of calling field analysis when the step has no analyzable field", async () => {
  const policy = mountEssayStep();
  // The server rejects a request without fields (BAD_REQUEST), which is what
  // turned step 4 into an exception screen.
  const analyzeFields = vi.fn<AnalysisApiClient["analyzeFields"]>(
    async (request): Promise<FieldsAnalyzeResponse> => {
      if (fieldCount(request) === 0)
        throw new Error("AUTOFILL_ANALYZE_FIELDS: BAD_REQUEST");
      return {
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        executionPolicy: policy,
        fields: [],
      };
    },
  );
  const analyzePreparation = vi.fn<AnalysisApiClient["analyzePreparation"]>(
    async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
  );
  render(
    <AutofillWorkflow
      pageDocument={document}
      onExit={() => {}}
      repository={{ load: async () => createEmptyProfile() }}
      apiClient={{
        loadExecutionPolicy: async () => policy,
        analyzeFields,
        analyzePreparation,
      }}
    />,
  );
  await screen.findByText("기입 결과", {}, { timeout: 120_000 });
  expect(analyzeFields).not.toHaveBeenCalled();
  expect(screen.queryByText(/분석할 수 없습니다/)).toBeNull();
  expect(document.querySelector<HTMLTextAreaElement>("#essay0")!.value).toBe(
    "",
  );
});
