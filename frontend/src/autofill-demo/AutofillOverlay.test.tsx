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
  FieldsAnalyzeRequest,
  PreparationAnalyzeResponse,
  PreparationAnalyzeRequest,
} from "../autofill/api/types";
import { AnalysisServiceError } from "../autofill/api/runtime-client";
import { createEmptyProfile } from "../profile/model";
import type { ProfileRepository } from "../profile/profile-repository";
import { AutofillOverlay } from "./AutofillOverlay";

function createRepository(): ProfileRepository {
  const profile = createEmptyProfile();
  profile.contact.email = "me@example.test";
  return {
    load: vi.fn(async () => profile),
    save: vi.fn(async () => undefined),
    loadLayout: vi.fn(async () => "a" as const),
    saveLayout: vi.fn(async () => undefined),
  };
}

function createApiClient(): AnalysisApiClient {
  return {
    analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC" as const,
      analysisStatus: "COMPLETE" as const,
      preparationPlans: [],
    })),
    analyzeFields: vi.fn(async (request: FieldsAnalyzeRequest) => {
      const candidate = request.sections[0]?.fields[0];
      if (!candidate) throw new Error("fixture page is missing its field");
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
}

describe("AutofillOverlay", () => {
  it("shows the twelve-step spinner while analysis is in progress", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(
        () => new Promise<PreparationAnalyzeResponse>(() => undefined),
      ),
      analyzeFields: vi.fn(),
    };

    const { container } = render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "지원서 분석 중" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("[data-spinner-bar]")).toHaveLength(12);
  });

  it("shows the preparation action label from the DOM candidate", async () => {
    const pageDocument =
      document.implementation.createHTMLDocument("application");
    pageDocument.body.innerHTML = `
      <section><button type="button">Add certification</button></section>
    `;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
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

    expect(await screen.findByText("1개 준비")).toBeInTheDocument();
  });

  it("summarizes preparation actions behind one continue button", async () => {
    const pageDocument =
      document.implementation.createHTMLDocument("application");
    pageDocument.body.innerHTML = `
      <section><button type="button">학력 항목 추가</button></section>
      <section><button type="button">어학 항목 추가</button></section>
    `;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: request.sections.flatMap((section) =>
          section.actionCandidates.map(({ candidateId }) => ({
            actionCandidateId: candidateId,
            command: "ADD_REPEATABLE_GROUP" as const,
            expectedEffect: "GROUP_COUNT_INCREMENT" as const,
          })),
        ),
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

    expect(await screen.findByText("2개 준비")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "준비하고 계속" }),
    ).toBeInTheDocument();
  });

  it("does not execute a preparation action until the user explicitly approves it", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section><button type="button">추가 정보 열기</button></section>
      <section hidden><button type="button">보조 동작</button><label>이메일 <input type="email" /></label></section>
    `;
    const reveal = pageDocument.querySelector("button")!;
    const targetSection = pageDocument.querySelectorAll("section")[1]!;
    reveal.addEventListener("click", () => {
      targetSection.hidden = false;
    });
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
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

    expect(
      await screen.findByRole("heading", { name: "입력 항목 준비" }),
    ).toBeInTheDocument();
    expect(targetSection.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "준비하고 계속" }));

    await waitFor(() => expect(targetSection.hidden).toBe(false));
    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("me@example.test");
  });

  it("executes all safe preparation actions with one continue action", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section>
        <button type="button">첫 번째 영역 열기</button>
        <div hidden>첫 번째 영역</div>
      </section>
      <section>
        <button type="button">두 번째 영역 열기</button>
        <div hidden>두 번째 영역</div>
      </section>
    `;
    const sections = [...pageDocument.querySelectorAll("section")];
    const buttons = [...pageDocument.querySelectorAll("button")];
    buttons.forEach((button, index) => {
      button.addEventListener("click", () => {
        sections[index]!.querySelector("div")!.hidden = false;
      });
    });
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: request.sections.map((section) => ({
          actionCandidateId: section.actionCandidates[0]!.candidateId,
          command: "REVEAL_SECTION" as const,
          expectedEffect: "TARGET_VISIBLE" as const,
          targetSectionId: section.sectionId,
        })),
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
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    await screen.findByRole("button", { name: "준비하고 계속" });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "준비하고 계속" }));

    await waitFor(() => {
      expect(sections[0]!.querySelector("div")!.hidden).toBe(false);
      expect(sections[1]!.querySelector("div")!.hidden).toBe(false);
    });
    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
  });

  it("keeps the page unchanged until final approval, then writes the selected fixture result", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const pageInput = pageDocument.querySelector("input")!;
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "지원서 자동 기입",
    });
    expect(
      await within(dialog).findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(pageInput.value).toBe("me@example.test");
    expect(
      await within(dialog).findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
  });

  it("fills every available field before showing the grouped result", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section data-section="contact"><h2>연락처</h2><label>이메일 <input type="email" /></label></section>
    `;
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("me@example.test");
    expect(
      screen.getByText(
        "성공한 항목은 지원서에서 한 번만 확인해 주세요. 저장과 제출은 직접 진행합니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("직접 확인 필요")).not.toBeInTheDocument();
  });

  it("shows the target, existing local value, planned value, and result reason for a conflict", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" value="already@page.test" /></label>`;
    const pageInput = pageDocument.querySelector("input")!;
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    expect(
      await screen.findByText("현재 입력값: already@page.test"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("입력 예정값: me@example.test"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이메일 포함하기" }));
    await screen.findByRole("button", { name: "이메일 제외하기" });
    fireEvent.click(screen.getByRole("button", { name: "1개 항목 기입하기" }));

    expect(pageInput.value).toBe("me@example.test");
    expect(await screen.findByText("기입 성공")).toBeInTheDocument();
    expect(screen.getByText("연락처와 주소 · 이메일주소")).toBeInTheDocument();
    expect(
      screen.getByText("지원서에 기존 값이 있습니다."),
    ).toBeInTheDocument();
  });

  it("shows only a safe client failure reason when the analysis server is unavailable", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async () => {
        throw new AnalysisServiceError("분석 서버가 아직 설정되지 않았습니다.");
      }),
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
      await screen.findByRole("heading", {
        name: "분석 서버가 아직 설정되지 않았습니다.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("me@example.test")).not.toBeInTheDocument();
  });

  it("displays a review field with its mapping and interaction status", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [],
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "PARTIAL" as const,
        warningCodes: ["LLM_UNAVAILABLE" as const],
        fields: [
          {
            candidateId: request.sections[0]?.fields[0]!.candidateId,
            matchType: "MATCH" as const,
            profileFieldKey: "contact.contact.email",
            autofillPolicy: "CONDITIONAL" as const,
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          },
        ],
      })),
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
      await screen.findByRole("heading", { name: "자동 기입 확인" }),
    ).toBeInTheDocument();
  });

  it("shows available fields first and omits unavailable fields", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <label>사용 가능 필드 <input type="email" /></label>
      <label>확인 필요 필드 <input type="email" /></label>
      <label>입력 불가 필드 <input type="email" /></label>
      <label>충돌 필드 <input type="email" value="기존 값" /></label>
    `;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request: PreparationAnalyzeRequest) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [],
      })),
      analyzeFields: vi.fn(async (request: FieldsAnalyzeRequest) => {
        const candidates = request.sections.flatMap(
          (section) => section.fields,
        );
        return {
          snapshotId: request.snapshotId,
          mode: "GENERIC" as const,
          analysisStatus: "COMPLETE" as const,
          fields: [
            {
              candidateId: candidates[0]!.candidateId,
              matchType: "MATCH" as const,
              profileFieldKey: "contact.contact.email",
              autofillPolicy: "ALLOWED" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            },
            {
              candidateId: candidates[1]!.candidateId,
              matchType: "MATCH" as const,
              profileFieldKey: "contact.contact.email",
              autofillPolicy: "CONDITIONAL" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "READY" as const,
              writePlan: { command: "SET_TEXT" as const },
            },
            {
              candidateId: candidates[2]!.candidateId,
              matchType: "NO_MATCH" as const,
              mappingStatus: "LLM_SUGGESTED" as const,
              interactionStatus: "BLOCKED" as const,
              reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
            },
            {
              candidateId: candidates[3]!.candidateId,
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

    const reviewGroup = await screen.findByRole("region", {
      name: "확인 필요한 항목",
    });
    expect(
      within(reviewGroup).getByRole("heading", {
        name: "확인 필요한 항목 2개",
      }),
    ).toBeInTheDocument();
    expect(
      within(reviewGroup)
        .getAllByRole("article")
        .map((item) => item.querySelector("strong")?.textContent),
    ).toEqual(["확인 필요 필드", "충돌 필드"]);
    expect(screen.queryByText("입력 불가 필드")).not.toBeInTheDocument();
  });

  it("keeps both sensitive current and planned values masked until the user reveals them", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>병역 <input value="기존 병역 값" /></label>`;
    const profile = createEmptyProfile();
    profile.military.militaryStatus = "복무 완료";
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
        preparationPlans: [],
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        fields: [
          {
            candidateId: request.sections[0]?.fields[0]!.candidateId,
            matchType: "MATCH" as const,
            profileFieldKey: "military.military.militaryStatus",
            autofillPolicy: "SENSITIVE_CONFIRMATION" as const,
            mappingStatus: "LLM_SUGGESTED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          },
        ],
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
      await screen.findByText("현재 입력값: ••••••••"),
    ).toBeInTheDocument();
    expect(screen.getByText("입력 예정값: ••••••••")).toBeInTheDocument();
    expect(screen.queryByText("복무 완료")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "병역 값 보기" }));

    expect(screen.getByText("입력 예정값: 복무 완료")).toBeInTheDocument();
    expect(screen.getByText("현재 입력값: 기존 병역 값")).toBeInTheDocument();
  });

  it("includes ordinary fields without a separate approval control", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    await screen.findByRole("heading", { name: "기입 결과" });

    expect(
      screen.queryByText("이메일: 승인하지 않아 건너뜀"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("사용자가 승인한 입력 항목이 아닙니다."),
    ).not.toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("me@example.test");
  });

  it("shows the locally calculated count before approving a repeatable-group action", async () => {
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

  it("adds the local profile shortfall from the live repeatable row count after approval", async () => {
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

  it("counts education profile entries by high school, university, and graduate section", async () => {
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

  it("matches certification categories by core words in section labels", async () => {
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

  it("matches a certification category from an ungrouped action label", async () => {
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

  it("accepts a revealed target section that contains fields but no action candidate", async () => {
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

  it("shows a generic safe state when analysis is unavailable", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async () => {
        throw new Error("server carries no profile values");
      }),
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
      await screen.findByRole("heading", {
        name: "분석을 완료하지 못했습니다",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("me@example.test")).not.toBeInTheDocument();
  });

  it("keeps profile values hidden when field analysis reports the page as blocked", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "COMPLETE" as const,
        preparationPlans: [],
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "GENERIC" as const,
        analysisStatus: "BLOCKED" as const,
        fields: [],
        blockCode: "ADAPTER_STRUCTURE_MISMATCH" as const,
      })),
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
      await screen.findByRole("heading", {
        name: "이 페이지에서는 자동 기입을 진행할 수 없습니다",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("me@example.test")).not.toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("");
  });

  it("sends a fields snapshot when preparation analysis is blocked", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "BLOCKED" as const,
        preparationPlans: [],
        blockCode: "ADAPTER_STRUCTURE_MISMATCH" as const,
      })),
      analyzeFields: vi.fn(async (request) => ({
        snapshotId: request.snapshotId,
        mode: "ADAPTER" as const,
        analysisStatus: "BLOCKED" as const,
        fields: [],
        blockCode: "ADAPTER_STRUCTURE_MISMATCH" as const,
      })),
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
      await screen.findByRole("heading", {
        name: "이 페이지에서는 자동 기입을 진행할 수 없습니다",
      }),
    ).toBeInTheDocument();
    expect(apiClient.analyzeFields).toHaveBeenCalledTimes(1);
    expect(pageDocument.querySelector("input")?.value).toBe("");
  });

  it("stops before field analysis when an approved reveal action has no verified effect", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <section><button type="button">추가 정보 열기</button></section>
      <section hidden><button type="button">보조 동작</button><label>이메일 <input type="email" /></label></section>
    `;
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
      await screen.findByRole("heading", { name: "입력 항목 준비" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "준비하고 계속" }));

    expect(
      await screen.findByRole("heading", {
        name: "준비 동작을 안전하게 완료하지 못했습니다",
      }),
    ).toBeInTheDocument();
    expect(apiClient.analyzeFields).not.toHaveBeenCalled();
    expect(pageDocument.querySelector("input")?.value).toBe("");
  });

  it("closes from its action and the Escape key", () => {
    const closeFromAction = vi.fn();
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    const { unmount } = render(
      <AutofillOverlay
        onClose={closeFromAction}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "자동 기입 모달 닫기" }),
    );
    expect(closeFromAction).toHaveBeenCalledOnce();

    unmount();
    const shadowHost = document.createElement("div");
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadowRoot.append(container);
    document.body.append(shadowHost);
    shadowRoot.addEventListener("keydown", (event) => event.stopPropagation());

    const closeFromEscape = vi.fn();
    const overlay = render(
      <AutofillOverlay
        onClose={closeFromEscape}
        apiClient={createApiClient()}
        repository={createRepository()}
        pageDocument={pageDocument}
      />,
      { container },
    );
    fireEvent.keyDown(
      overlay.getByRole("button", { name: "자동 기입 모달 닫기" }),
      { key: "Escape" },
    );
    expect(closeFromEscape).toHaveBeenCalledOnce();
  });
});
