import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AnalysisApiClient } from "../autofill/api/types";
import { AutofillOverlay } from "./AutofillOverlay";
import { createRepository } from "./AutofillOverlay.test-fixtures";

function createUnsupportedApiClient(): AnalysisApiClient {
  return {
    analyzePreparation: vi.fn(async (request) => ({
      snapshotId: request.snapshotId,
      mode: "GENERIC" as const,
      analysisStatus: "PARTIAL" as const,
      preparationPlans: [],
      warningCodes: ["LLM_UNAVAILABLE" as const],
    })),
    analyzeFields: vi.fn(),
  };
}

function createApplicationDocument(): Document {
  const pageDocument = document.implementation.createHTMLDocument("지원서");
  pageDocument.body.innerHTML = `<label>이메일 <input type="email" /></label>`;
  return pageDocument;
}

describe("AutofillOverlay unsupported page", () => {
  it("shows the unsupported guidance and stops before field analysis", async () => {
    const pageDocument = createApplicationDocument();
    const apiClient = createUnsupportedApiClient();
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={apiClient}
        repository={createRepository()}
        pageDocument={pageDocument}
        unsupportedImageUrl="chrome-extension://test-extension/unsupported-capybara.jpg"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "아직 지원하지 않아요" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "안전모를 쓰고 X 표시를 든 카피바라" }),
    ).toHaveAttribute(
      "src",
      "chrome-extension://test-extension/unsupported-capybara.jpg",
    );
    expect(apiClient.analyzeFields).not.toHaveBeenCalled();
    expect(pageDocument.querySelector("input")?.value).toBe("");
  });

  it("completes the guidance with text only when no picture is provided", async () => {
    render(
      <AutofillOverlay
        onClose={vi.fn()}
        apiClient={createUnsupportedApiClient()}
        repository={createRepository()}
        pageDocument={createApplicationDocument()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "아직 지원하지 않아요" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
