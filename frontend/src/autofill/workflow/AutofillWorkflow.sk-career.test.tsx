import { usePolicyFixture } from "../../test/fixtures/execution-policy";
usePolicyFixture("sk");
import { fixturePolicy } from "../../test/fixtures/execution-policy";
import { render, screen, waitFor } from "@testing-library/react";
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
executionPolicy: fixturePolicy("sk"),
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
      if (field.domName === "carDeptName") {
        return {
          candidateId: field.candidateId,
          matchType: "MATCH" as const,
          valueBinding: {
            type: "DIRECT" as const,
            profileFieldKey: "careers.career.department",
          },
          autofillPolicy: "ALLOWED" as const,
          mappingStatus: "ADAPTER_VERIFIED" as const,
          interactionStatus: "READY" as const,
          writePlan: { command: "SET_TEXT" as const },
        };
      }
      if (
        field.domName === "carRetireDesc" ||
        field.domName === "carPosition"
      ) {
        return {
          candidateId: field.candidateId,
          matchType: "MATCH" as const,
          valueBinding: {
            type: "DIRECT" as const,
            profileFieldKey:
              field.domName === "carPosition"
                ? "careers.career.position"
                : "careers.career.terminationReason",
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

function setup(
  existingRetiredStatus = "",
  terminationReason = "계약 종료",
  revealPosition = false,
  cancelAfterPass = false,
) {
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

  if (revealPosition) {
    const position =
      document.querySelector<HTMLInputElement>("#carPosition_1")!;
    position.hidden = true;
    document
      .querySelector("#carRetireDesc_1")!
      .addEventListener("input", () => {
        position.hidden = false;
      });
  }
  const profile = createEmptyProfile();
  profile.careers = [
    {
      id: "career-retired",
      sectionId: "career",
      values: {
        employmentStatus: "퇴사",
        terminationReason,
        ...(revealPosition ? { position: "팀원" } : {}),
        department: "개발팀",
      },
    },
    {
      id: "career-current",
      sectionId: "career",
      values: { employmentStatus: "재직중" },
    },
  ];
  let fieldAnalysisCount = 0;
  const apiClient: AnalysisApiClient = {
loadExecutionPolicy: async () => fixturePolicy("sk"),
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "ADAPTER",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => {
      fieldAnalysisCount += 1;
      if (fieldAnalysisCount > 1) {
        expect(
          document.querySelector<HTMLInputElement>("#carDeptName_1")!.value,
        ).toBe("개발팀");
      }
      return fieldResponse(request);
    },
  };

  let cancelled = false;
  const view = render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{
        load: async () => {
          if (
            cancelAfterPass &&
            document.querySelector<HTMLInputElement>("#carDeptName_1")!
              .value === "개발팀"
          ) {
            cancelled = true;
            view.unmount();
          }
          return profile;
        },
      }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  return {
    selects,
    cancelled: () => cancelled,
    changeCounts,
    fieldAnalysisCount: () => fieldAnalysisCount,
  };
}

it("finishes unchanged fields before refreshing and filling the revealed retirement reason", async () => {
  const run = setup();

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "기입 결과" })).toBeVisible();
    expect(
      document.querySelector<HTMLTextAreaElement>("#carRetireDesc_1")!.value,
    ).toBe("계약 종료");
  });

  expect(run.selects.map((select) => select.value)).toEqual(["0", "1"]);
  expect(
    document.querySelector<HTMLTextAreaElement>("#carRetireDesc_2")!.value,
  ).toBe("");
  expect(run.fieldAnalysisCount()).toBe(2);
  expect(run.changeCounts).toEqual([1, 1]);
});

it("preserves a conflicting existing status without revealing its retirement reason", async () => {
  const run = setup("1");

  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "기입 결과" })).toBeVisible(),
  );
  expect(run.fieldAnalysisCount()).toBe(1);

  expect(run.selects.map((select) => select.value)).toEqual(["1", "1"]);
  expect(
    document.querySelector<HTMLTextAreaElement>("#carRetireDesc_1")!.value,
  ).toBe("");
  expect(run.changeCounts).toEqual([0, 1]);
});

it("repeats at the end of another pass when writing the revealed text exposes another field", async () => {
  const run = setup("", "계약 종료", true);
  await waitFor(
    () => {
      expect(screen.getByRole("heading", { name: "기입 결과" })).toBeVisible();
      expect(
        document.querySelector<HTMLInputElement>("#carPosition_1")!.value,
      ).toBe("팀원");
    },
    { timeout: 10000 },
  );
  expect(
    document.querySelector<HTMLTextAreaElement>("#carRetireDesc_1")!.value,
  ).toBe("계약 종료");
  expect(run.fieldAnalysisCount()).toBe(3);
  expect(run.changeCounts).toEqual([1, 1]);
});

it("does not reanalyze a revealed field when its profile value is missing", async () => {
  const run = setup("", "");
  await screen.findByRole("heading", { name: "기입 결과" });
  expect(run.selects[0]!.value).toBe("0");
  expect(
    document.querySelector<HTMLTextAreaElement>("#carRetireDesc_1")!.value,
  ).toBe("");
  expect(run.fieldAnalysisCount()).toBe(1);
});

it("does not start a refresh when cancelled during the final profile check", async () => {
  const run = setup("", "계약 종료", false, true);
  await waitFor(() => expect(run.cancelled()).toBe(true));
  expect(run.fieldAnalysisCount()).toBe(1);
  expect(
    document.querySelector<HTMLTextAreaElement>("#carRetireDesc_1")!.value,
  ).toBe("");
});
