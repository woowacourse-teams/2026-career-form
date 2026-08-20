import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutofillDemo } from "./AutofillDemo";

describe("AutofillDemo", () => {
  it("groups review items by actionability while preserving detailed statuses", () => {
    render(<AutofillDemo onExit={vi.fn()} initialStage="review" />);

    const available = screen.getByRole("region", {
      name: "입력 가능 1개",
    });
    const needsHumanReview = screen.getByRole("region", {
      name: "사람 확인 필요 3개",
    });
    const unavailable = screen.getByRole("region", {
      name: "입력 불가 1개",
    });

    expect(
      within(available).getByRole("checkbox", { name: /이메일주소/ }),
    ).toBeChecked();
    expect(within(needsHumanReview).getByText("확인 필요")).toBeInTheDocument();
    expect(
      within(needsHumanReview).getByText("기존 값 충돌"),
    ).toBeInTheDocument();
    expect(within(needsHumanReview).getByText("민감정보")).toBeInTheDocument();
    expect(
      within(unavailable).getByRole("checkbox", { name: /지원 동기/ }),
    ).toBeDisabled();
  });

  it("moves through analysis, review, confirmation, progress, and result", () => {
    render(<AutofillDemo onExit={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "지원서 분석 중" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "분석 결과 보기" }));

    expect(
      screen.getByRole("heading", { name: "입력 예정 항목 검토" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /이메일주소/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /국적/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /지원 동기/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "선택한 항목 확인" }));

    expect(
      screen.getByRole("heading", { name: "최종 승인" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "기입하기" }));
    expect(
      screen.getByRole("heading", { name: "기입 중" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
    expect(
      screen.getByRole("heading", { name: "기입 결과" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("지원서의 실제 값을 직접 확인해 주세요."),
    ).toBeInTheDocument();
  });

  it("shows all four exception states and returns to manual copy", () => {
    const onExit = vi.fn();
    render(<AutofillDemo onExit={onExit} initialStage="exception" />);

    expect(
      screen.getByRole("heading", { name: "지원하지 않는 페이지" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "분석 실패" }));
    expect(
      screen.getByRole("heading", { name: "분석 실패" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "검색 결과 없음" }));
    expect(
      screen.getByRole("heading", { name: "검색 결과 없음" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "일부 기입 실패" }));
    expect(
      screen.getByRole("heading", { name: "일부 기입 실패" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "수동 복사로 돌아가기" }),
    );
    expect(onExit).toHaveBeenCalledOnce();
  });
});
