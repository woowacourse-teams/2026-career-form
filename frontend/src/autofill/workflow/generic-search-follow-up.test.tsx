import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { AnalysisApiClient, FieldsAnalyzeResponse } from "../api/types";
import type { ReviewPlanItem } from "../review/review-plan";
import {
  executeApprovedWritesAfterPageSettles,
  type ApprovedWriteResult,
} from "../write/executor";
import { AutofillWorkflow } from "./AutofillWorkflow";

type SearchFollowUpOptions = Parameters<
  typeof executeApprovedWritesAfterPageSettles
>[0] & {
  onSearchFollowUp?: (
    item: ReviewPlanItem,
    controls: readonly HTMLSelectElement[],
  ) => void;
};

vi.mock("../write/executor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../write/executor")>();
  return {
    ...actual,
    executeApprovedWritesAfterPageSettles: vi.fn(),
  };
});

const executeWritesMock = vi.mocked(executeApprovedWritesAfterPageSettles);

function fieldResponse(
  request: Parameters<AnalysisApiClient["analyzeFields"]>[0],
): FieldsAnalyzeResponse {
  const fields = request.sections.flatMap((section) => [
    ...section.fields,
    ...(section.items ?? []).flatMap((item) => item.fields),
  ]);
  return {
    snapshotId: request.snapshotId,
    mode: "GENERIC" as const,
    analysisStatus: "COMPLETE" as const,
    fields: fields.flatMap((field) => {
      const common = {
        candidateId: field.candidateId,
        matchType: "MATCH" as const,
        mappingStatus: "LLM_SUGGESTED" as const,
        interactionStatus: "READY" as const,
        valueBinding: {
          type: "DIRECT" as const,
          profileFieldKey: field.domName?.includes("grade")
            ? "certifications.certificate.grade"
            : field.domName?.includes("issuer")
              ? "certifications.certificate.issuer"
              : field.domName?.includes("date")
                ? "certifications.certificate.acquisitionDate"
                : "certifications.certificate.name",
        },
      };
      if (field.domName === "certificate-name")
        return {
          ...common,
          autofillPolicy: "CONDITIONAL",
          writePlan: { command: "SEARCH_SELECTION" },
        };
      if (field.domName?.includes("grade"))
        return {
          ...common,
          autofillPolicy: "CONDITIONAL",
          writePlan: { command: "SELECT_OPTION" },
        };
      return {
        ...common,
        autofillPolicy: "ALLOWED",
        writePlan: { command: "SET_TEXT" },
      };
    }),
  };
}

function setupWorkflow(options: { grade?: string } = {}) {
  document.body.innerHTML = `
    <fieldset><legend>자격증·면허증</legend>
      <div data-repeater-item>
        <label>자격증명<input id="certificate-name" name="certificate-name" type="text" readonly></label>
        <button type="button" aria-label="자격 검색">검색</button>
      </div>
    </fieldset>
  `;
  const profile = createEmptyProfile();
  profile.certifications.push({
    id: "cert-entry-1",
    sectionId: "certificate",
    values: {
      name: "AWS Certified Solutions Architect",
      ...(options.grade ? { grade: options.grade } : {}),
      issuer: "Amazon",
      acquisitionDate: "2025-10-01",
    },
  });
  const analyzeRequests: Parameters<AnalysisApiClient["analyzeFields"]>[0][] =
    [];
  let grade: HTMLSelectElement | undefined;
  let issuer: HTMLInputElement | undefined;
  let date: HTMLInputElement | undefined;
  executeWritesMock.mockImplementation(async (rawOptions) => {
    const writeOptions = rawOptions as SearchFollowUpOptions;
    const searchItem = writeOptions.items.find(
      (item) => item.analysis?.writePlan?.command === "SEARCH_SELECTION",
    );
    if (!searchItem)
      return writeOptions.items.map((item) => ({
        candidateId: item.candidateId,
        status: "written",
      }));

    document.querySelector<HTMLInputElement>("#certificate-name")!.value =
      "AWS Certified Solutions Architect";
    const row = document.querySelector<HTMLElement>("[data-repeater-item]")!;
    grade = document.createElement("select");
    grade.name = "certificate-grade";
    grade.innerHTML =
      '<option value="">선택</option><option value="associate">Associate</option>';
    issuer = document.createElement("input");
    issuer.name = "certificate-issuer";
    date = document.createElement("input");
    date.name = "certificate-date";
    row.append(grade, issuer, date);
    writeOptions.onSearchFollowUp?.(searchItem, [grade]);
    return writeOptions.items.map((item): ApprovedWriteResult =>
      item.candidateId === searchItem.candidateId
        ? { candidateId: item.candidateId, status: "written" }
        : {
            candidateId: item.candidateId,
            status: "skipped",
            reason: "stopped after search follow-up",
          },
    );
  });

  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      preparationPlans: [],
    }),
    analyzeFields: async (request) => {
      analyzeRequests.push(request);
      return fieldResponse(request);
    },
  };

  render(
    <AutofillWorkflow
      repository={{ load: async () => profile }}
      apiClient={apiClient}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  return {
    analyzeRequests,
    grade: () => grade,
    issuer: () => issuer,
    date: () => date,
  };
}

afterEach(() => {
  executeWritesMock.mockReset();
  document.body.replaceChildren();
});

describe("generic search follow-up review", () => {
  it.each(["target-value", "moved-control"])(
    "rejects stale %s after review before invoking dependent writes",
    async (mutation) => {
      const setup = setupWorkflow({ grade: "Associate" });
      await screen.findByRole("heading", { name: "자동 기입 확인" });
      fireEvent.click(screen.getAllByRole("button", { name: /포함하기$/ })[0]!);
      if (mutation === "target-value") {
        document.querySelector<HTMLInputElement>("#certificate-name")!.value =
          "Changed synthetic certificate";
      } else {
        const otherRow = document.createElement("div");
        otherRow.dataset.repeaterItem = "";
        document.querySelector("fieldset")!.append(otherRow);
        otherRow.append(setup.grade()!);
      }
      fireEvent.click(
        screen.getByRole("button", { name: /개 항목 기입하기$/ }),
      );
      await screen.findByText(
        "검색 후 입력 항목이 변경되어 다시 확인해야 합니다",
      );
      expect(executeWritesMock).toHaveBeenCalledTimes(1);
      expect(setup.grade()?.value).toBe("");
      expect(setup.issuer()?.value).toBe("");
      expect(setup.date()?.value).toBe("");
    },
  );

  it("reanalyzes newly revealed fields and requires a new review before dependent writes", async () => {
    const setup = setupWorkflow({ grade: "Associate" });

    await screen.findByRole("heading", { name: "자동 기입 확인" });

    expect(setup.analyzeRequests).toHaveLength(2);
    expect(
      setup.analyzeRequests[1]!.sections.flatMap((section) => [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ]).map((field) => field.domName),
    ).toEqual(
      expect.arrayContaining([
        "certificate-grade",
        "certificate-issuer",
        "certificate-date",
      ]),
    );
    expect(executeWritesMock).toHaveBeenCalledTimes(1);
    expect(setup.grade()?.value).toBe("");
    expect(setup.issuer()?.value).toBe("");
    expect(setup.date()?.value).toBe("");
    const reviewItems = screen.getAllByRole("article");
    expect(reviewItems.length).toBeGreaterThan(0);
    expect(
      reviewItems.every(
        (item) => item.getAttribute("data-included") === "false",
      ),
    ).toBe(true);
  });

  it("surfaces a missing profile grade for manual review without writing follow-up fields", async () => {
    const setup = setupWorkflow();

    await screen.findByRole("heading", { name: "자동 기입 확인" });

    expect(setup.analyzeRequests).toHaveLength(2);
    expect(screen.getByText(/급수.*직접 확인/)).toBeVisible();
    expect(setup.grade()?.value).toBe("");
    expect(setup.issuer()?.value).toBe("");
    expect(setup.date()?.value).toBe("");
    expect(executeWritesMock).toHaveBeenCalledTimes(1);
  });
});
