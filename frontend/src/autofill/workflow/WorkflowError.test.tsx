import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import styles from "../../autofill-demo/AutofillDemo.module.css";
import { WorkflowError, type WorkflowErrorKind } from "./WorkflowError";

const retryable: readonly [WorkflowErrorKind, string][] = [
  ["connection", "서버에 연결하지 못했어요"],
  ["rateLimited", "잠시 후 다시 시도해 주세요"],
  ["unknown", "자동 기입을 시작하지 못했어요"],
];

describe("WorkflowError", () => {
  it.each(retryable)(
    "%s shows its title with retry as primary and back as secondary",
    (kind, title) => {
      render(
        <WorkflowError
          kind={kind}
          developerMode={false}
          onRetry={vi.fn()}
          onBack={vi.fn()}
        />,
      );

      expect(screen.getByRole("heading", { name: title })).toBeVisible();
      const buttons = screen.getAllByRole("button");
      expect(buttons.map((button) => button.textContent)).toEqual([
        "다시 시도",
        "돌아가기",
      ]);
      expect(styles.primary).toBeTruthy();
      expect(styles.textButton).toBeTruthy();
      expect(buttons[0]).toHaveClass(styles.primary);
      expect(buttons[1]).toHaveClass(styles.textButton);
    },
  );

  it("tells the user the application is unchanged for start errors", () => {
    render(
      <WorkflowError
        kind="connection"
        developerMode={false}
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/지원서는 바뀌지 않았어요/)).toBeVisible();
  });

  it("update needed offers only the back button", () => {
    render(
      <WorkflowError
        kind="updateNeeded"
        developerMode={false}
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "확장 프로그램을 업데이트해 주세요",
      }),
    ).toBeVisible();
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["돌아가기"]);
    expect(buttons[0]).toHaveClass(styles.primary);
    expect(screen.queryByText("업데이트 방법 보기")).toBeNull();
  });

  it("interrupted leads with the done and manual counts and never says 예외", () => {
    render(
      <WorkflowError
        kind="interrupted"
        developerMode={false}
        completedCount={6}
        manualCount={4}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "자동 기입을 멈췄어요" }),
    ).toBeVisible();
    const summary = screen.getByRole("group", { name: "기입 현황" });
    expect(summary).toHaveTextContent("6입력 완료");
    expect(summary).toHaveTextContent("4직접 입력 필요");
    expect(screen.queryByText(/예외/)).toBeNull();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["돌아가기"]);
  });

  it("interrupted without any counted field omits the summary", () => {
    render(
      <WorkflowError
        kind="interrupted"
        developerMode={false}
        completedCount={0}
        manualCount={0}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByRole("group", { name: "기입 현황" })).toBeNull();
  });

  it("retries only when the user clicks", () => {
    const onRetry = vi.fn();
    render(
      <WorkflowError
        kind="connection"
        developerMode={false}
        onRetry={onRetry}
        onBack={vi.fn()}
      />,
    );

    expect(onRetry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("back calls onBack", () => {
    const onBack = vi.fn();
    render(
      <WorkflowError
        kind="unknown"
        developerMode={false}
        onRetry={vi.fn()}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("hides raw server text in normal mode", () => {
    render(
      <WorkflowError
        kind="unknown"
        developerMode={false}
        detail="AUTOFILL_ANALYZE_FIELDS 응답 검증 실패"
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByText(/AUTOFILL_ANALYZE_FIELDS/)).toBeNull();
    expect(document.querySelector("details")).toBeNull();
  });

  it("shows raw text in a collapsed details block in developer mode", () => {
    render(
      <WorkflowError
        kind="unknown"
        developerMode
        detail="AUTOFILL_ANALYZE_FIELDS 응답 검증 실패"
        onRetry={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const details = document.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(details.querySelector("summary")).toHaveTextContent("오류 정보");
    expect(details).toHaveTextContent("AUTOFILL_ANALYZE_FIELDS 응답 검증 실패");
  });

  it("omits the buttons the caller does not provide", () => {
    render(<WorkflowError kind="connection" developerMode={false} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
