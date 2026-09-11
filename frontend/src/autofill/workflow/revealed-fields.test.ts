import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { getWorkflowAdapter } from "../adapters/workflow";
import type { AnalysisApiClient, MatchedFieldAnalysis } from "../api/types";
import { createWriteRevealedFields } from "./revealed-fields";

afterEach(() => document.body.replaceChildren());

it.each(["", "기존 테스트 병과"])(
  "fills newly revealed military details without replacing %s",
  async (current) => {
    document.body.innerHTML =
      '<section><label for="specialty">병과</label><input id="specialty" name="specialty" type="text"></section>';
    const input = document.querySelector<HTMLInputElement>("#specialty")!;
    input.value = current;
    const profile = createEmptyProfile();
    profile.military.militarySpecialty = "합성 병과";
    let analyses = 0;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        preparationPlans: [],
      }),
      analyzeFields: async (request) => {
        analyses++;
        return {
          snapshotId: request.snapshotId,
          mode: "ADAPTER",
          analysisStatus: "COMPLETE",
          fields: request.sections
            .flatMap((section) => section.fields)
            .map(
              (field) =>
                ({
                  candidateId: field.candidateId,
                  matchType: "MATCH",
                  valueBinding: {
                    type: "DIRECT",
                    profileFieldKey: "military.military.militarySpecialty",
                  },
                  autofillPolicy: "SENSITIVE_CONFIRMATION",
                  mappingStatus: "ADAPTER_VERIFIED",
                  interactionStatus: "READY",
                  writePlan: { command: "SET_TEXT" },
                }) satisfies MatchedFieldAnalysis,
            ),
        };
      },
    };
    await createWriteRevealedFields({
      adapter: getWorkflowAdapter("www.skcareers.com"),
      apiClient,
      pageDocument: document,
      setWorkflowDiagnostics: () => {},
    })(profile, [
      {
        plan: {
          command: "SELECT_OPTION_TO_REVEAL",
          actionCandidateId: "driver",
          profileFieldKey: "military.military.militaryStatus",
          optionDisplayName: "군필",
          targetSectionId: "section",
          expectedEffect: "TARGET_FIELDS_VISIBLE",
          revealedFieldBindings: {
            specialty: "military.military.militarySpecialty",
          },
        },
        actionLabel: "병역",
        runnable: true,
      },
    ]);
    expect(analyses).toBe(1);
    expect(input.value).toBe(current || "합성 병과");
  },
);
