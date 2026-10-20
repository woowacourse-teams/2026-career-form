import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createEmptyProfile } from "../../profile/model";
import { AnalysisServiceError } from "../api/runtime-client";
import type { AnalysisApiClient } from "../api/types";
import { AutofillWorkflow } from "./AutofillWorkflow";
import {
  renderHplaceLogin,
  setHplacePage,
  resetHplacePage,
} from "./test-utils/hplace.fixture";

afterEach(() => {
  resetHplacePage();
});

it("stops an identified public login before profile loading or analysis", async () => {
  renderHplaceLogin();
  const repository = { load: vi.fn(async () => createEmptyProfile()) };
  const apiClient: AnalysisApiClient = {
    analyzePreparation: vi.fn<AnalysisApiClient["analyzePreparation"]>(
      async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        preparationPlans: [],
      }),
    ),
    analyzeFields: vi.fn<AnalysisApiClient["analyzeFields"]>(
      async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: [],
      }),
    ),
  };
  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={repository}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );

  expect(await screen.findByText("아직 지원하지 않아요")).toBeVisible();
  expect(repository.load).not.toHaveBeenCalled();
  expect(apiClient.analyzePreparation).not.toHaveBeenCalled();
  expect(apiClient.analyzeFields).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>("[name=email]")!.value).toBe(
    "",
  );
});

it("stops preparation when the page becomes identified during its API request", async () => {
  renderHplaceLogin();
  const assets = document.head.innerHTML;
  document.head.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "추가 정보 열기";
  document.body.append(button);
  let clicks = 0;
  button.onclick = () => {
    clicks += 1;
  };
  const apiClient: AnalysisApiClient = {
    analyzePreparation: async (request) => {
      const section = request.sections.find(
        (section) => section.actionCandidates.length > 0,
      )!;
      document.head.innerHTML = assets;
      return {
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        preparationPlans: [
          {
            actionCandidateId: section.actionCandidates[0].candidateId,
            command: "REVEAL_SECTION",
            expectedEffect: "TARGET_VISIBLE",
            targetSectionId: section.sectionId,
          },
        ],
      };
    },
    analyzeFields: vi.fn<AnalysisApiClient["analyzeFields"]>(
      async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC",
        analysisStatus: "COMPLETE",
        fields: [],
      }),
    ),
  };
  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => createEmptyProfile() }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
  expect(await screen.findByText("아직 지원하지 않아요")).toBeVisible();
  expect(apiClient.analyzeFields).not.toHaveBeenCalled();
  expect(clicks).toBe(0);
});

it.each(["missing", "failed"] as const)(
  "does not fall back to generic analysis when Hplace execution policy is %s",
  async (state) => {
    renderHplaceLogin();
    const load = vi.fn(async () => createEmptyProfile());
    const analyzePreparation = vi.fn<AnalysisApiClient["analyzePreparation"]>();
    const analyzeFields = vi.fn<AnalysisApiClient["analyzeFields"]>();
    render(
      <AutofillWorkflow
        pageDocument={document}
        repository={{ load }}
        onExit={() => undefined}
        apiClient={{
          loadExecutionPolicy: async () => {
            if (state === "failed") throw new Error("Synthetic policy failure");
            return undefined;
          },
          analyzePreparation,
          analyzeFields,
        }}
      />,
    );
    if (state === "missing")
      expect(await screen.findByText("아직 지원하지 않아요")).toBeVisible();
    else
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "사이트 정책을 불러오지 못했습니다",
      );
    expect(load).not.toHaveBeenCalled();
    expect(analyzePreparation).not.toHaveBeenCalled();
    expect(analyzeFields).not.toHaveBeenCalled();
    expect(
      document.querySelector<HTMLInputElement>("[name=email]")!.value,
    ).toBe("");
  },
);

function renderUnsupported() {
  const apiClient: AnalysisApiClient = {
    analyzePreparation: vi.fn<AnalysisApiClient["analyzePreparation"]>(),
    analyzeFields: vi.fn<AnalysisApiClient["analyzeFields"]>(),
  };
  render(
    <AutofillWorkflow
      apiClient={apiClient}
      repository={{ load: async () => createEmptyProfile() }}
      pageDocument={document}
      onExit={() => undefined}
    />,
  );
}

it("names the new applicant app as the unsupported reason", async () => {
  renderHplaceLogin();
  renderUnsupported();
  expect(await screen.findByText("아직 지원하지 않아요")).toBeVisible();
  expect(
    screen.getByText(
      "이 채용 사이트의 지원서 방식(신형 지원자 앱)은 아직 지원하지 않아요.",
    ),
  ).toBeVisible();
});

it("names the career builder as the unsupported reason", async () => {
  setHplacePage("https://tenant.recruiter.co.kr/career/jobs/1");
  document.head.innerHTML =
    '<script src="/_next/static/chunks/app/(main)/(jobflex)/career/jobs/page-abc123.js"></script>';
  document.body.innerHTML = [
    "loading-root",
    "modal-root",
    "slate-hovering-toolbar",
    "tooltip-root",
    "message-root",
    "popup-root",
  ]
    .map((id) => `<div id="${id}"></div>`)
    .join("");
  renderUnsupported();
  expect(
    await screen.findByText(
      "이 채용 사이트의 지원서 방식(경력 빌더형)은 아직 지원하지 않아요.",
    ),
  ).toBeVisible();
});

it("asks for an extension update when the served policy is incompatible", async () => {
  render(
    <AutofillWorkflow
      pageDocument={document}
      repository={{ load: async () => createEmptyProfile() }}
      onExit={() => undefined}
      apiClient={{
        loadExecutionPolicy: async () => {
          throw new AnalysisServiceError(
            "분석 서버 응답을 확인할 수 없습니다.",
            undefined,
            "POLICY_INCOMPATIBLE",
          );
        },
        analyzePreparation: vi.fn(),
        analyzeFields: vi.fn(),
      }}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "지원서 정책이 이 확장 버전과 맞지 않아요. 확장을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.",
  );
});
