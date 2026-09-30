import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { LoadingVariant } from "./LoadingVariant";
it("shows actual category progress for A", () => {
  render(<LoadingVariant variant="A" completed={5} reducedMotion={false} />);
  expect(
    screen.getByRole("list", { name: "범주별 입력 현황" }),
  ).toHaveTextContent("기본 인적사항");
  expect(screen.getByRole("heading")).toHaveTextContent("5개 항목 입력");
});
it.each([
  [0, 0],
  [20, 50],
  [39, 98],
  [40, 100],
])(
  "maps %s written fields to %s percent without categories",
  (completed, percentage) => {
    render(
      <LoadingVariant
        variant="B"
        completed={completed}
        reducedMotion={false}
      />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      String(percentage),
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  },
);
it.each(["D"] as const)(
  "keeps counts out of %s and supports a static state",
  (variant) => {
    const { container } = render(
      <LoadingVariant variant={variant} completed={5} reducedMotion={true} />,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("50%");
    expect(screen.getByRole("status")).toHaveTextContent(
      "지원서를 채우고 있어요",
    );
    expect(
      container.querySelector('[data-reduced-motion="true"]'),
    ).toBeInTheDocument();
  },
);

it.each(["A", "B", "D"] as const)(
  "shows the shared writing illustration in %s without a separate character trial",
  (variant) => {
    render(
      <LoadingVariant variant={variant} completed={5} reducedMotion={false} />,
    );
    expect(
      screen.getByRole("img", { name: "지원서를 쓰는 카피바라" }),
    ).toBeInTheDocument();
  },
);

it.each(["A", "B", "D"] as const)(
  "uses the same waiting message in %s",
  (variant) => {
    render(
      <LoadingVariant variant={variant} completed={5} reducedMotion={false} />,
    );
    expect(
      screen.getAllByText("지원서를 채우고 있어요").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("입력 중이에요")).not.toBeInTheDocument();
  },
);

it("advances steps from actual written fields without displaying percentages", () => {
  const { rerender } = render(
    <LoadingVariant variant="E" completed={16} reducedMotion={false} />,
  );
  expect(screen.getByText("기본정보").closest("li")).toHaveAttribute(
    "data-state",
    "done",
  );
  expect(screen.getByText("학력").closest("li")).toHaveAttribute(
    "aria-current",
    "step",
  );
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  rerender(<LoadingVariant variant="E" completed={40} reducedMotion={false} />);
  expect(screen.getAllByText("완료")).toHaveLength(4);
});
