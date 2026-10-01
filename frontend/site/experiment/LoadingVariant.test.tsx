import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { LoadingVariant } from "./LoadingVariant";
it.each([0, 20, 40])("shows only completed count for A at %s", (completed) => {
  render(
    <LoadingVariant variant="A" completed={completed} reducedMotion={false} />,
  );
  expect(screen.getByText("완료한 작업")).toBeInTheDocument();
  expect(screen.getByText(String(completed))).toHaveTextContent(
    `${completed}개`,
  );
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
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
    expect(screen.queryByText("남은 작업")).not.toBeInTheDocument();
  },
);
it.each(["A", "B", "C"] as const)(
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

it.each(["A", "B", "C"] as const)(
  "uses the same waiting message and total in %s",
  (variant) => {
    render(
      <LoadingVariant variant={variant} completed={5} reducedMotion={false} />,
    );
    expect(
      screen.getAllByText("지원서를 채우고 있어요").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("입력 중이에요")).not.toBeInTheDocument();
    if (variant === "B")
      expect(screen.getByText("전체 40개 항목")).not.toBeVisible();
    else expect(screen.getByText("전체 40개 항목")).toBeVisible();
  },
);
it.each([0, 20, 40])("shows remaining count only for C at %s", (completed) => {
  render(
    <LoadingVariant variant="C" completed={completed} reducedMotion={false} />,
  );
  expect(screen.getByText("남은 작업")).toBeInTheDocument();
  expect(screen.getByText(String(40 - completed))).toHaveTextContent(
    `${40 - completed}개`,
  );
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});
