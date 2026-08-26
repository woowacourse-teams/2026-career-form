import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  AnalysisApiClient,
  FieldsAnalyzeRequest,
  PreparationAnalyzeRequest,
} from "../autofill/api/types";
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

    expect(
      await screen.findByRole("heading", { name: "지원서 준비 동작 검토" }),
    ).toBeInTheDocument();
    expect(targetSection.hidden).toBe(true);
    const approval = screen.getByRole("checkbox");
    fireEvent.click(approval);
    expect(targetSection.hidden).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "승인한 준비 동작 실행" }),
    );

    expect(targetSection.hidden).toBe(false);
    expect(
      await screen.findByRole("heading", { name: "입력 예정 항목 검토" }),
    ).toBeInTheDocument();
    expect(pageDocument.querySelector("input")?.value).toBe("");
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
      await within(dialog).findByRole("heading", {
        name: "입력 예정 항목 검토",
      }),
    ).toBeInTheDocument();
    expect(pageInput.value).toBe("");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "선택한 항목 확인" }),
    );
    expect(pageInput.value).toBe("");
    fireEvent.click(within(dialog).getByRole("button", { name: "기입하기" }));

    expect(pageInput.value).toBe("me@example.test");
    expect(
      await within(dialog).findByRole("heading", { name: "기입 결과" }),
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
