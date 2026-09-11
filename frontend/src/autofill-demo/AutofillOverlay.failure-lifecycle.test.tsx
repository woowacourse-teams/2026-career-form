import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AnalysisApiClient } from "../autofill/api/types";
import { AutofillOverlay } from "./AutofillOverlay";
import {
  createApiClient,
  createRepository,
} from "./AutofillOverlay.test-fixtures";

describe("AutofillOverlay failure and lifecycle", () => {
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

  it.skip("fills only ready common fields after blocked preparation yields a partial result", async () => {
    const pageDocument = document.implementation.createHTMLDocument("지원서");
    pageDocument.body.innerHTML = `
      <label>이메일 <input type="email" /></label>
      <label>직무 전용 항목 <input type="text" /></label>
    `;
    const [email, jobSpecific] = Array.from(
      pageDocument.querySelectorAll("input"),
    );
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
        analysisStatus: "PARTIAL" as const,
        fields: [
          {
            candidateId: request.sections[0]!.fields[0]!.candidateId,
            matchType: "MATCH" as const,
            profileFieldKey: "contact.contact.email",
            autofillPolicy: "ALLOWED" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "READY" as const,
            writePlan: { command: "SET_TEXT" as const },
          },
          {
            candidateId: request.sections[0]!.fields[1]!.candidateId,
            matchType: "NO_MATCH" as const,
            mappingStatus: "ADAPTER_VERIFIED" as const,
            interactionStatus: "BLOCKED" as const,
            reasonCodes: ["NO_MATCH"] as ["NO_MATCH"],
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
    expect(email!.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "1개 항목 기입하기" }));
    expect(
      await screen.findByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(email!.value).toBe("me@example.test");
    expect(jobSpecific!.value).toBe("");
  });

  it.skip("stops before field analysis when an approved reveal action has no verified effect", async () => {
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
        name: "준비 대상 영역이 표시되지 않았습니다",
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
