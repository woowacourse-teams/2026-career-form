import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutofillOverlay } from "../../src/autofill-demo/AutofillOverlay";
import { createRepository } from "../../src/autofill-demo/AutofillOverlay.test-fixtures";
import type {
  AnalysisApiClient,
  PreparationAnalyzeResponse,
} from "../../src/autofill/api/types";
import { App } from "./App";

// Catches a panel transition that unmounts profile state or leaves a second start action visible.
describe("side panel workflow presentation", () => {
  it("replaces the list with the workflow and restores search state and start focus", async () => {
    const repository = createRepository();
    const closePanel = vi.fn();
    const common = {
      repository,
      closePanel,
      inPage: true,
      openAutofill: vi.fn(),
    };
    const view = render(<App {...common} />);
    await screen.findByText("me@example.test");
    fireEvent.change(screen.getByRole("searchbox", { name: "프로필 검색" }), {
      target: { value: "이메일" },
    });
    const apiClient: AnalysisApiClient = {
      analyzePreparation: vi.fn(
        () => new Promise<PreparationAnalyzeResponse>(() => undefined),
      ),
      analyzeFields: vi.fn(),
    };
    view.rerender(
      <App
        {...common}
        autofillView={
          <AutofillOverlay
            apiClient={apiClient}
            repository={repository}
            pageDocument={document.implementation.createHTMLDocument("fixture")}
            onClose={vi.fn()}
          />
        }
      />,
    );
    expect(
      screen.getByRole("region", { name: "지원서 자동 기입" }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("searchbox", { name: "프로필 검색" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "자동 기입" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(closePanel).toHaveBeenCalledOnce();

    view.rerender(<App {...common} />);
    expect(screen.getByRole("searchbox", { name: "프로필 검색" })).toHaveValue(
      "이메일",
    );
    expect(screen.getByRole("button", { name: "자동 기입" })).toHaveFocus();
  });

  it("allows only one pending open request and releases the start button afterwards", async () => {
    let finish!: () => void;
    const openAutofill = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<App repository={createRepository()} openAutofill={openAutofill} />);
    const start = screen.getByRole("button", { name: "자동 기입" });
    fireEvent.click(start);
    fireEvent.click(start);
    expect(openAutofill).toHaveBeenCalledOnce();
    expect(start).toBeDisabled();
    await act(async () => finish());
    await waitFor(() => expect(start).toBeEnabled());
  });
});
