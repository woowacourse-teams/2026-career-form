import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkflowLoading } from "./WorkflowLoading";
import { batchPercent } from "./progress-model";

describe("developer view", () => {
  it("keeps category counts instead of a rolling feed of field labels", () => {
    render(
      <WorkflowLoading
        developerMode
        writing
        currentCategory="학력"
        progress={[
          {
            id: "name",
            label: "이름",
            category: "기본 인적사항",
            status: "written",
          },
          {
            id: "email",
            label: "이메일",
            category: "기본 인적사항",
            status: "written",
          },
          { id: "major", label: "전공", category: "학력", status: "skipped" },
        ]}
      />,
    );
    expect(
      screen.getByRole("list", { name: "범주별 입력 현황" }),
    ).toHaveTextContent("기본 인적사항2개 입력");
    expect(
      screen.getByRole("list", { name: "범주별 입력 현황" }),
    ).toHaveTextContent("학력입력 중");
    expect(screen.queryByText("이름 입력 완료")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("names the actual operation and retains previous category counts during address work", () => {
    render(
      <WorkflowLoading
        developerMode
        writing={false}
        activity="address"
        progress={[
          {
            id: "name",
            label: "이름",
            category: "기본 인적사항",
            status: "written",
          },
        ]}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "주소 검색 결과를 확인하고 있어요",
    );
    expect(
      screen.getByRole("list", { name: "범주별 입력 현황" }),
    ).toHaveTextContent("1개 입력");
  });
  it("does not advertise unchanged fields as newly entered while work is running", () => {
    render(
      <WorkflowLoading
        developerMode
        writing={false}
        progress={[
          {
            id: "name",
            label: "이름",
            category: "기본 정보",
            status: "written",
            unchanged: true,
          },
          {
            id: "email",
            label: "이메일",
            category: "연락처",
            status: "written",
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "1개 항목 입력" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "범주별 입력 현황" }),
    ).toHaveTextContent("기본 정보기존 값 유지");
  });
});

const IMAGE_URL = "chrome-extension://test-id/capybara-writing.png";

describe("user view", () => {
  const progress = [
    { id: "name", label: "이름", category: "기본 인적사항", status: "written" },
  ] as const;

  it("shows the capybara, caption and percent while writing", () => {
    render(
      <WorkflowLoading
        developerMode={false}
        writingImageUrl={IMAGE_URL}
        writing
        currentCategory="기본 인적사항"
        total={12}
        done={3}
        progress={progress}
      />,
    );
    const region = screen.getByRole("region", { name: "자동 기입 작업 영역" });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("img", { name: "지원서를 쓰는 카피바라" }),
    ).toBeInTheDocument();
    expect(screen.getByText("지원서를 채우고 있어요")).toBeVisible();
    expect(screen.getByText("진행률")).toBeVisible();
    expect(region).toHaveTextContent("25%");
    expect(
      screen.getByRole("progressbar", { name: "입력 완료 비율" }),
    ).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemin",
      "0",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "100",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "기본 인적사항 정보를 입력하고 있어요",
    );
  });

  it("takes the image source from the prop and draws no image without it", () => {
    const { rerender } = render(
      <WorkflowLoading
        developerMode={false}
        writingImageUrl={IMAGE_URL}
        writing
      />,
    );
    expect(
      screen.getByRole("img", { name: "지원서를 쓰는 카피바라" }),
    ).toHaveAttribute("src", IMAGE_URL);
    rerender(<WorkflowLoading developerMode={false} writing />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("지원서를 채우고 있어요")).toBeVisible();
  });

  it("hides the category list and detail heading", () => {
    render(
      <WorkflowLoading
        developerMode={false}
        writingImageUrl={IMAGE_URL}
        writing
        currentCategory="기본 인적사항"
        total={12}
        done={3}
        progress={progress}
      />,
    );
    expect(screen.queryByRole("list", { name: "범주별 입력 현황" })).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("shows only the activity message while analyzing, without a progressbar", () => {
    render(
      <WorkflowLoading
        developerMode={false}
        writingImageUrl={IMAGE_URL}
        writing={false}
      />,
    );
    expect(
      screen.getByRole("img", { name: "지원서를 쓰는 카피바라" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("지원서 항목과 프로필 정보를 맞추고 있어요").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("진행률")).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("names the recheck for fields that were not filled", () => {
    render(
      <WorkflowLoading
        developerMode={false}
        writing={false}
        activity="rechecking"
      />,
    );
    expect(
      screen.getAllByText("입력이 안된 칸들이 있는지 확인하고 있어요").length,
    ).toBeGreaterThan(0);
  });

  it("shows no progressbar while writing without a known total", () => {
    render(
      <WorkflowLoading developerMode={false} writing total={0} done={0} />,
    );
    expect(screen.getByText("지원서를 채우고 있어요")).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("batchPercent", () => {
  it("rounds and clamps to 0..100", () => {
    expect(batchPercent(3, 12)).toBe(25);
    expect(batchPercent(1, 3)).toBe(33);
    expect(batchPercent(0, 5)).toBe(0);
    expect(batchPercent(9, 5)).toBe(100);
    expect(batchPercent(-1, 5)).toBe(0);
  });
});
