import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createEmptyProfile } from "../../profile/model";
import type {
  AnalysisApiClient,
  FieldCandidate,
  FieldsAnalyzeRequest,
  FieldsAnalyzeResponse,
} from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";

afterEach(() => {
  document.body.replaceChildren();
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({ url: "http://localhost:3000" });
});

function row(index: number): string {
  return `<div class="form-item-group career-item">
    <input name="carCorpName" id="carCorpName_${index}" />
    <input name="carDeptName" id="carDeptName_${index}" />
    <input name="carJobRole" id="carJobRole_${index}" />
    <input name="carPosition" id="carPosition_${index}" />
    <input name="carSalary" id="carSalary_${index}" />
    <input type="tel" name="carFromDate" id="carFromDate_${index}" />
    <input type="tel" name="carToDate" id="carToDate_${index}" />
    <select name="carWorkingYN">
      <option value="">재직여부</option>
      <option value="1">재직 중</option>
      <option value="0">퇴사</option>
    </select>
    <textarea name="carDescription" id="carDescription_${index}"></textarea>
    <div class="retire-reason" style="display:none">
      <textarea name="carRetireDesc" id="carRetireDesc_${index}"></textarea>
    </div>
  </div>`;
}

function candidates(request: FieldsAnalyzeRequest): FieldCandidate[] {
  return request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
}

function fieldResponse(request: FieldsAnalyzeRequest): FieldsAnalyzeResponse {
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: candidates(request).map((field) => {
      if (field.domName === "carWorkingYN") {
        return {
          candidateId: field.candidateId,
          matchType: "MATCH" as const,
          valueBinding: {
            type: "LOOKUP" as const,
            profileFieldKey: "careers.career.employmentStatus",
            optionMap: { 재직중: "재직 중", 퇴사: "퇴사" },
          },
          autofillPolicy: "ALLOWED" as const,
          mappingStatus: "ADAPTER_VERIFIED" as const,
          interactionStatus: "READY" as const,
          writePlan: { command: "SELECT_OPTION" as const },
        };
      }
      if (field.domName === "carRetireDesc") {
        return {
          candidateId: field.candidateId,
          matchType: "MATCH" as const,
          valueBinding: {
            type: "DIRECT" as const,
            profileFieldKey: "careers.career.terminationReason",
          },
          autofillPolicy: "ALLOWED" as const,
          mappingStatus: "ADAPTER_VERIFIED" as const,
          interactionStatus:
            field.visibility === "visible"
              ? ("READY" as const)
              : ("MANUAL_REVEAL_REQUIRED" as const),
          ...(field.visibility === "visible"
            ? { writePlan: { command: "SET_TEXT" as const } }
            : {}),
        };
      }
      return {
        candidateId: field.candidateId,
        matchType: "NO_MATCH" as const,
        mappingStatus: "ADAPTER_VERIFIED" as const,
        interactionStatus: "BLOCKED" as const,
        reasonCodes: ["NO_MATCH" as const],
      };
    }),
  };
}

function setup(existingRetiredStatus = "") {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/synthetic",
  });
  document.body.innerHTML = `
    <div id="applyContentCareer" class="apply-form-box career-root">
      <div class="form-body">${row(1)}${row(2)}</div>
    </div>`;

  const selects = Array.from(
    document.querySelectorAll<HTMLSelectElement>("select[name=carWorkingYN]"),
  );
  const changeCounts = [0, 0];
  selects.forEach((select, index) => {
    select.addEventListener("change", () => {
      changeCounts[index]! += 1;
      const reason = select
        .closest(".career-item")!
        .querySelector<HTMLElement>(".retire-reason")!;
      reason.style.display = select.value === "0" ? "block" : "none";
    });
  });
  selects[0]!.value = existingRetiredStatus;

  const profile = createEmptyProfile();
  profile.careers = [
    {
      id: "career-retired",
      sectionId: "career",
      values: { employmentStatus: "퇴사", terminationReason: "계약 종료" },
    },
    {
      id: "career-current",
      sectionId: "career",
      values: { employmentStatus: "재직중" },
    },
  ];
  let fieldAnalysisCount = 0;
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => {
      fieldAnalysisCount += 1;
      return fieldResponse(request);
    },
  };

  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => profile }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  return {
    selects,
    changeCounts,
    fieldAnalysisCount: () => fieldAnalysisCount,
  };
}

it("runs each SK career status driver in one stage, reanalyzes, and fills only the revealed retirement reason", async () => {
  const run = setup();

  await waitFor(() => {
    expect(
      document.querySelector<HTMLTextAreaElement>("#carRetireDesc_1")!.value,
    ).toBe("계약 종료");
  });

  expect(run.selects.map((select) => select.value)).toEqual(["0", "1"]);
  expect(
    document.querySelector<HTMLTextAreaElement>("#carRetireDesc_2")!.value,
  ).toBe("");
  expect(run.fieldAnalysisCount()).toBe(2);
  expect(run.changeCounts).toEqual([2, 2]);
});

it("preserves a conflicting existing status without revealing its retirement reason", async () => {
  const run = setup("1");

  await waitFor(() => {
    expect(run.fieldAnalysisCount()).toBe(2);
  });

  expect(run.selects.map((select) => select.value)).toEqual(["1", "1"]);
  expect(
    document.querySelector<HTMLTextAreaElement>("#carRetireDesc_1")!.value,
  ).toBe("");
  expect(run.changeCounts).toEqual([0, 2]);
});
