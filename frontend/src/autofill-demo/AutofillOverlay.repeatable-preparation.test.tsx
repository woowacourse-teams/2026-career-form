import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  AnalysisApiClient,
  PreparationAnalyzeRequest,
} from "../autofill/api/types";
import { createEmptyProfile } from "../profile/model";
import type { ProfileRepository } from "../profile/profile-repository";
import { AutofillOverlay } from "./AutofillOverlay";
import { createRepository } from "./AutofillOverlay.test-fixtures";

describe("AutofillOverlay repeatable preparation", () => {
  it.skip("shows the locally calculated count before approving a repeatable-group action", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<section><h2>자격증·면허증</h2><button type="button">추가</button></section>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          },
        ],
      })),
      analyzeFields: vi.fn(),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByText("현재 화면의 입력 행을 그대로 사용합니다."),
    ).toBeInTheDocument();
  });

  it.skip("adds the local profile shortfall from the live repeatable row count after approval", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section>
        <h2>자격증·면허증</h2>
        <div data-repeatable-group></div>
        <button type="button">추가</button>
      </section>
    `;
    const profile = createEmptyProfile();
    profile.certifications = [
      { id: "certificate-1", sectionId: "certificate", values: {} },
      { id: "certificate-2", sectionId: "certificate", values: {} },
      { id: "certificate-3", sectionId: "certificate", values: {} },
    ];
    const repository: ProfileRepository = {
      load: vi.fn(async () => profile),
      save: vi.fn(async () => undefined),
      loadLayout: vi.fn(async () => "a" as const),
      saveLayout: vi.fn(async () => undefined),
    };
    const section = pageDocument.querySelector("section")!;
    const add = pageDocument.querySelector("button")!;
    let clicks = 0;
    add.addEventListener("click", () => {
      clicks += 1;
      const row = pageDocument.createElement("div");
      row.dataset.repeatableGroup = "";
      section.insertBefore(row, add);
    });
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          },
        ],
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        fields: [],
      })),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={repository}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByText("입력 행 2개를 추가합니다."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "준비하고 계속" }));

    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(clicks).toBe(2);
    expect(
      pageDocument.querySelectorAll("[data-repeatable-group]"),
    ).toHaveLength(3);
  });

  it.skip("counts education profile entries by high school, university, and graduate section", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <div class="apply-form-box education-root">
        <h3>학력</h3>
        <button id="btnAddEducationHigh" class="btnAddEducationHigh" type="button">추가</button>
        <button id="btnAddEducationUniv" class="btnAddEducationUniv" type="button">추가</button>
        <button id="btnAddEducationGrad" class="btnAddEducationGrad" type="button">추가</button>
      </div>
    `;
    const profile = createEmptyProfile();
    profile.education = [
      { id: "high-school-1", sectionId: "highSchool", values: {} },
      { id: "university-1", sectionId: "university", values: {} },
    ];
    const repository: ProfileRepository = {
      load: vi.fn(async () => profile),
      save: vi.fn(async () => undefined),
      loadLayout: vi.fn(async () => "a" as const),
      saveLayout: vi.fn(async () => undefined),
    };
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: request.sections[0]!.actionCandidates.map(
          ({ candidateId }) => ({
            actionCandidateId: candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          }),
        ),
      })),
      analyzeFields: vi.fn(),
    };

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={repository}
        pageDocument={pageDocument}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("입력 행 2개를 추가합니다."),
    ).toBeInTheDocument();
  });

  it.skip("matches certification categories by core words in section labels", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML =
      '<section><h2>자격/면허</h2><div data-repeatable-group></div><button type="button">추가</button></section>';
    const profile = createEmptyProfile();
    profile.certifications = [
      { id: "certificate-1", sectionId: "certificate", values: {} },
      { id: "certificate-2", sectionId: "certificate", values: {} },
      { id: "certificate-3", sectionId: "certificate", values: {} },
    ];
    const repository: ProfileRepository = {
      load: vi.fn(async () => profile),
      save: vi.fn(async () => undefined),
      loadLayout: vi.fn(async () => "a" as const),
      saveLayout: vi.fn(async () => undefined),
    };
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          },
        ],
      })),
      analyzeFields: vi.fn(),
    };

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={repository}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByText("입력 행 2개를 추가합니다."),
    ).toBeInTheDocument();
  });

  it.skip("matches a certification category from an ungrouped action label", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <div class="apply-form-box cert-root">
        <h3>자격/면허</h3>
        <div class="form-item-group"></div>
        <div class="form-item-group cert-Item"></div>
        <button type="button">자격/면허 추가</button>
      </div>
    `;
    const profile = createEmptyProfile();
    profile.certifications = [
      { id: "certificate-1", sectionId: "certificate", values: {} },
      { id: "certificate-2", sectionId: "certificate", values: {} },
      { id: "certificate-3", sectionId: "certificate", values: {} },
    ];
    const repository: ProfileRepository = {
      load: vi.fn(async () => profile),
      save: vi.fn(async () => undefined),
      loadLayout: vi.fn(async () => "a" as const),
      saveLayout: vi.fn(async () => undefined),
    };
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections.at(-1)?.actionCandidates[0]!.candidateId ??
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          },
        ],
      })),
      analyzeFields: vi.fn(),
    };

    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={repository}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByText("입력 행 2개를 추가합니다."),
    ).toBeInTheDocument();
  });

  it.skip("accepts a revealed target section that contains fields but no action candidate", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section><button type="button">추가 정보 열기</button></section>
      <section hidden><label>이메일 <input type="email" /></label></section>
    `;
    const reveal = pageDocument.querySelector("button")!;
    const targetSection = pageDocument.querySelectorAll("section")[1]!;
    reveal.addEventListener("click", () => {
      targetSection.hidden = false;
    });
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [
          {
            actionCandidateId:
              request.sections[0]?.actionCandidates[0]!.candidateId,
            command: "REVEAL_SECTION" as const,
            expectedEffect: "TARGET_VISIBLE" as const,
            targetSectionId: request.sections[1]!.sectionId,
          },
        ],
      })),
      analyzeFields: vi.fn(async (request) => {
        const candidate = request.sections[0]?.fields[0]!;
        return {
          snapshotId: request.snapshotId,
          mode: "GENERIC" as const,
          analysisStatus: "COMPLETE" as const,
          fields: [
            {
              candidateId: candidate.candidateId,
              matchType: "MATCH" as const,
              profileFieldKey: "contact.contact.email",
              autofillPolicy: "ALLOWED" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            },
          ],
        };
      }),
    };
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    await screen.findByRole("heading", { name: "입력 항목 준비" });
    fireEvent.click(screen.getByRole("button", { name: "준비하고 계속" }));

    await waitFor(() => expect(targetSection.hidden).toBe(false));
    expect(
      await screen.findByRole("heading", { name: "자동 기입 확인" }),
    ).toBeInTheDocument();
  });
});
