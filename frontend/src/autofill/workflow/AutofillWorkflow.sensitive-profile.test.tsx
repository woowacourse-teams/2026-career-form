import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { getWorkflowAdapter } from "../adapters/workflow";
import { AutofillWorkflow } from "./AutofillWorkflow";
import { WorkflowScreens } from "./WorkflowScreens";

function setUrl(url: string) {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url });
}

afterEach(() => {
  document.body.replaceChildren();
  setUrl("http://localhost:3000");
});

function setupVeteran() {
  setUrl("https://www.skcareers.com/Application/Index/synthetic");
  document.body.innerHTML = `<section aria-label="보훈">
    <label><input type="radio" name="prsVeteranBenefitYN" value="0">비대상</label>
    <label><input type="radio" name="prsVeteranBenefitYN" value="1">대상</label>
    <input name="unrelated" value="keep" aria-label="무관한 입력">
  </section>`;
  const target = document.querySelector<HTMLInputElement>(
    "[name=prsVeteranBenefitYN][value='1']",
  )!;
  let events = 0;
  target.addEventListener("change", () => {
    events++;
    if (target.checked && !document.querySelector("#prsVeteranBenefitNumber")) {
      target
        .closest("section")!
        .insertAdjacentHTML(
          "beforeend",
          '<input id="prsVeteranBenefitNumber" name="prsVeteranBenefitNumber" aria-label="보훈 번호">',
        );
    }
  });
  const profile = createEmptyProfile();
  profile.veteran = {
    veteranStatus: "veteran-status:eligible",
    veteranNumber: "100001",
  };
  const before = structuredClone(profile);
  let preparations = 0;
  const client: AnalysisApiClient = {
    analyzePreparation: async (request) => {
      preparations++;
      const section = request.sections.find((s) =>
        s.actionCandidates.some(
          (a) =>
            a.domName === "prsVeteranBenefitYN" && a.displayName === "대상",
        ),
      );
      const action = section?.actionCandidates.find(
        (a) => a.domName === "prsVeteranBenefitYN" && a.displayName === "대상",
      );
      return {
        snapshotId: request.snapshotId,
        mode: "ADAPTER",
        analysisStatus: "COMPLETE",
        preparationPlans:
          preparations === 1 && action && section
            ? [
                {
                  actionCandidateId: action.candidateId,
                  command: "SELECT_OPTION_TO_REVEAL",
                  profileFieldKey: "veteran.veteran.veteranStatus",
                  optionDisplayName: "대상",
                  selectableProfileValues: ["대상"],
                  targetSectionId: section.sectionId,
                  expectedEffect: "TARGET_FIELDS_VISIBLE",
                  expectedFieldNames: ["prsVeteranBenefitNumber"],
                },
              ]
            : [],
      };
    },
    analyzeFields: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: request.sections
        .flatMap((s) => [
          ...s.fields,
          ...(s.items ?? []).flatMap((i) => i.fields),
        ])
        .map((field) => {
          if (field.domName === "prsVeteranBenefitYN")
            return {
              candidateId: field.candidateId,
              matchType: "MATCH" as const,
              valueBinding: {
                type: "DERIVED" as const,
                recipe: "BOOLEAN_YN" as const,
                profileFieldKey: "veteran.veteran.veteranStatus",
                trueLabel: "대상",
                falseLabel: "비대상",
              },
              autofillPolicy: "ALLOWED" as const,
              mappingStatus: "ADAPTER_VERIFIED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "CHECK_RADIO" as const },
            };
          if (field.domName === "prsVeteranBenefitNumber")
            return {
              candidateId: field.candidateId,
              matchType: "MATCH" as const,
              valueBinding: {
                type: "DIRECT" as const,
                profileFieldKey: "veteran.veteran.veteranNumber",
              },
              autofillPolicy: "ALLOWED" as const,
              mappingStatus: "ADAPTER_VERIFIED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            };
          return {
            candidateId: field.candidateId,
            matchType: "NO_MATCH" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "BLOCKED" as const,
            reasonCodes: ["NO_MATCH" as const],
          };
        }),
    }),
  };
  render(
    <AutofillWorkflow
      apiClient={client}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  return { target, profile, before, events: () => events };
}

it("automatically prepares veteran status and detail without sensitive-value confirmation", async () => {
  const run = setupVeteran();
  await screen.findByRole("heading", { name: "기입 결과" });
  expect(screen.queryByRole("button", { name: /값 보기|포함하기/ })).toBeNull();
  expect(run.target.checked).toBe(true);
  expect(run.events()).toBe(1);
  await waitFor(() =>
    expect(
      document.querySelector<HTMLInputElement>("#prsVeteranBenefitNumber")
        ?.value,
    ).toBe("100001"),
  );
  expect(
    document.querySelector<HTMLInputElement>("[name=unrelated]")?.value,
  ).toBe("keep");
  expect(run.profile).toEqual(run.before);
});

it("identifies same-labelled sensitive candidates without revealing their values", () => {
  const sensitiveItems = [
    {
      candidateId: "opaque-veteran-candidate-7f3a",
      fieldLabel: "비대상",
      currentValue: "",
      profileValue: "desired-salary-secret",
      previewValue: "••••••••",
      status: "sensitive" as const,
      selected: false,
      disabled: false,
      revealed: false,
      reason: "민감정보는 항목별 확인이 필요합니다.",
      analysis: {
        candidateId: "opaque-veteran-candidate-7f3a",
        matchType: "MATCH" as const,
        valueBinding: {
          type: "DERIVED" as const,
          recipe: "BOOLEAN_YN" as const,
          profileFieldKey: "compensation.compensation.desiredSalary",
          trueLabel: "대상",
          falseLabel: "비대상",
        },
        autofillPolicy: "SENSITIVE_CONFIRMATION" as const,
        mappingStatus: "ADAPTER_VERIFIED" as const,
        interactionStatus: "READY" as const,
        writePlan: { command: "CHECK_RADIO" as const },
      },
    },
    {
      candidateId: "opaque-disability-candidate-9c2e",
      fieldLabel: "비대상",
      profileFieldKey: "compensation.compensation.previousSalary",
      currentValue: "",
      profileValue: "previous-salary-secret",
      previewValue: "••••••••",
      status: "sensitive" as const,
      selected: false,
      disabled: false,
      revealed: false,
      reason: "민감정보는 항목별 확인이 필요합니다.",
    },
  ];
  const screenProps = (reviewItems = sensitiveItems) => ({
    stage: "review" as const,
    preparationItems: [],
    warnings: [],
    revealedPreparationKeys: new Set<string>(),
    selectedPreparationKeys: new Set<string>(),
    setRevealedPreparationKeys: () => undefined,
    setSelectedPreparationKeys: () => undefined,
    executePreparation: async () => undefined,
    reviewItems,
    partial: false,
    toggleReviewItem: () => undefined,
    revealSensitiveItem: () => undefined,
    executeWrites: async () => undefined,
    results: [],
    adapter: getWorkflowAdapter("example.test"),
    workflowDiagnostics: [],
    exceptionTitle: "",
    onExit: () => undefined,
  });

  const { rerender } = render(<WorkflowScreens {...screenProps()} />);

  expect(screen.getByText("프로필 항목: 처우 · 희망연봉(만원)")).toBeVisible();
  expect(screen.getByText("프로필 항목: 처우 · 직전연봉(만원)")).toBeVisible();
  expect(screen.queryByText("desired-salary-secret")).not.toBeInTheDocument();
  expect(screen.queryByText("previous-salary-secret")).not.toBeInTheDocument();
  expect(screen.getAllByText(/입력 예정값: •+/)).toHaveLength(2);

  const revealButtons = screen.getAllByRole("button", {
    name: "비대상 값 보기",
  });
  const revealCaptionIds = revealButtons.map((button) =>
    button.getAttribute("aria-describedby"),
  );
  expect(revealCaptionIds).toHaveLength(2);
  expect(new Set(revealCaptionIds).size).toBe(2);
  for (const captionId of revealCaptionIds) {
    expect(captionId).not.toBeNull();
    expect(document.getElementById(captionId!)).toBeVisible();
  }

  rerender(
    <WorkflowScreens
      {...screenProps(
        sensitiveItems.map((item) => ({ ...item, revealed: true })),
      )}
    />,
  );

  const includeButtons = screen.getAllByRole("button", {
    name: "비대상 포함하기",
  });
  const includeCaptionIds = includeButtons.map((button) =>
    button.getAttribute("aria-describedby"),
  );
  expect(new Set(includeCaptionIds).size).toBe(2);
  for (const captionId of includeCaptionIds) {
    expect(captionId).not.toBeNull();
    expect(document.getElementById(captionId!)).toBeVisible();
  }
});

it("uses a binding-only profile key for result labels and keeps missing items safe", () => {
  const bindingOnlyReviewItem = {
    candidateId: "opaque-veteran-result-4b1d",
    fieldLabel: "비대상",
    currentValue: "",
    profileValue: "desired-salary-result-secret",
    previewValue: "••••••••",
    status: "sensitive" as const,
    selected: false,
    disabled: false,
    revealed: false,
    reason: "민감정보는 항목별 확인이 필요합니다.",
    analysis: {
      candidateId: "opaque-veteran-result-4b1d",
      matchType: "MATCH" as const,
      valueBinding: {
        type: "DERIVED" as const,
        recipe: "BOOLEAN_YN" as const,
        profileFieldKey: "compensation.compensation.desiredSalary",
        trueLabel: "대상",
        falseLabel: "비대상",
      },
      autofillPolicy: "SENSITIVE_CONFIRMATION" as const,
      mappingStatus: "ADAPTER_VERIFIED" as const,
      interactionStatus: "READY" as const,
      writePlan: { command: "CHECK_RADIO" as const },
    },
  };

  render(
    <WorkflowScreens
      stage="result"
      preparationItems={[]}
      warnings={[]}
      revealedPreparationKeys={new Set<string>()}
      selectedPreparationKeys={new Set<string>()}
      setRevealedPreparationKeys={() => undefined}
      setSelectedPreparationKeys={() => undefined}
      executePreparation={async () => undefined}
      reviewItems={[bindingOnlyReviewItem]}
      partial={false}
      toggleReviewItem={() => undefined}
      revealSensitiveItem={() => undefined}
      executeWrites={async () => undefined}
      results={[
        {
          candidateId: "opaque-veteran-result-4b1d",
          status: "skipped",
          reason: "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.",
        },
        {
          candidateId: "missing-result-candidate-5e8f",
          status: "skipped",
          reason: "지원서 필드 상태가 변경되었거나 입력할 수 없습니다.",
        },
      ]}
      adapter={getWorkflowAdapter("example.test")}
      workflowDiagnostics={[]}
      exceptionTitle=""
      onExit={() => undefined}
    />,
  );

  expect(screen.getByText("처우 · 희망연봉(만원)")).toBeVisible();
  expect(screen.getAllByText("프로필 정보")).toHaveLength(1);
  expect(
    screen.queryByText("desired-salary-result-secret"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("••••••••")).toBeVisible();
});
