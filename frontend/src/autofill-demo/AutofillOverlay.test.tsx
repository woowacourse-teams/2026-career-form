import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutofillOverlay } from "./AutofillOverlay";

describe("AutofillOverlay", () => {
  it("shows the autofill flow in a webpage modal", () => {
    render(<AutofillOverlay onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "지원서 자동 기입" });
    expect(
      within(dialog).getByRole("heading", { name: "지원서 분석 중" }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "분석 결과 보기" }),
    );
    expect(
      within(dialog).getByRole("heading", { name: "입력 예정 항목 검토" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("region", { name: "입력 가능 1개" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("region", { name: "사람 확인 필요 3개" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("region", { name: "입력 불가 1개" }),
    ).toBeInTheDocument();
  });

  it("closes from its action and the Escape key", () => {
    const closeFromAction = vi.fn();
    const { unmount } = render(<AutofillOverlay onClose={closeFromAction} />);

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
    const overlay = render(<AutofillOverlay onClose={closeFromEscape} />, {
      container,
    });
    fireEvent.keyDown(
      overlay.getByRole("button", { name: "자동 기입 모달 닫기" }),
      { key: "Escape" },
    );
    expect(closeFromEscape).toHaveBeenCalledOnce();
  });
});
