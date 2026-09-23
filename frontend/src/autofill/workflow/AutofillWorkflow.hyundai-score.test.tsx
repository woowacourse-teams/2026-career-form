import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { AnalysisApiClient } from "../api/types";
import { createEmptyProfile } from "../../profile/model";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

async function fillScore(disableAfterInput: boolean) {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://talent.hyundai.com/apply/applyWrite.hc",
  });
  document.body.innerHTML = `
    <article id="foreign" class="field-form-apply">
      <div class="field-content"><div class="field-group">
        <label>점수<input id="point_1" name="point" /></label>
      </div></div>
    </article>`;
  const input = document.querySelector<HTMLInputElement>("#point_1")!;
  if (disableAfterInput)
    input.addEventListener("input", () => {
      input.disabled = true;
    });
  const profile = createEmptyProfile();
  profile.languages = [
    {
      id: "synthetic-language",
      sectionId: "languageTest",
      values: { grade: "900" },
    },
  ];
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      fields: request.sections
        .flatMap((section) => [
          ...section.fields,
          ...(section.items ?? []).flatMap((entry) => entry.fields),
        ])
        .map((field) => ({
          candidateId: field.candidateId,
          matchType: "MATCH",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "languages.languageTest.grade",
          },
          autofillPolicy: "ALLOWED",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          writePlan: { command: "SET_TEXT" },
        })),
    }),
  };
  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "자동 기입을 마쳤어요" }),
    ).toBeVisible(),
  );
  return input;
}

it("reports a directly written Hyundai language score as completed", async () => {
  const input = await fillScore(false);
  expect(input.value).toBe("900");
  expect(screen.getByLabelText("입력 완료 1개")).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "확인 필요한 항목" }),
  ).not.toBeInTheDocument();
});

it("does not claim a reflected score was not entered when only the final retry becomes disabled", async () => {
  const input = await fillScore(true);
  expect(input.value).toBe("900");
  expect(input).toBeDisabled();
  expect(screen.getByLabelText("입력 완료 1개")).toBeVisible();
  expect(screen.queryByText("입력 못함")).not.toBeInTheDocument();
});
