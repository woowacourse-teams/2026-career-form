import { render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient } from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => document.body.replaceChildren());
const client: AnalysisApiClient = {
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
      .flatMap((section) => section.fields)
      .map((field) => ({
        candidateId: field.candidateId,
        matchType: "MATCH",
        mappingStatus: "ADAPTER_VERIFIED",
        interactionStatus: "READY",
        autofillPolicy: field.control === "select" ? "CONDITIONAL" : "ALLOWED",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey:
            field.control === "select"
              ? "personal.personal.nationality"
              : "personal.personal.koreanGivenName",
        },
        writePlan: {
          command: field.control === "select" ? "SELECT_OPTION" : "SET_TEXT",
        },
      })),
  }),
};

it("keeps an unchanged value out of new-write totals while counting a verified conditional selection", async () => {
  document.body.innerHTML =
    '<label>이름<input value="테스트"></label><label>국적<select><option value="">선택</option><option value="KR">대한민국</option></select></label>';
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = "테스트";
  profile.personal.nationality = "대한민국";
  render(
    <AutofillWorkflow
      repository={{ load: async () => profile }}
      apiClient={client}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  await screen.findByRole("heading", { name: "기입 결과" });
  expect(screen.getByLabelText("입력 완료 1개")).toBeVisible();
  expect(screen.queryByLabelText(/확인 필요 [1-9]/)).not.toBeInTheDocument();
  expect(document.querySelector("select")).toHaveValue("KR");
  expect(screen.queryByText(/건너뛴 항목 보기/)).not.toBeInTheDocument();
  expect(document.querySelector("input")).toHaveValue("테스트");
  expect(screen.queryByText("기존 값 유지")).not.toBeInTheDocument();
});
