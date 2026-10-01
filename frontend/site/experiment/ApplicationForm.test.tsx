import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { ApplicationForm } from "./ApplicationForm";
it("places all forty example inputs in the SK-style application sections", () => {
  const { container } = render(<ApplicationForm />);
  expect(
    within(screen.getByRole("banner")).getByText("커리어폼"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "기본정보" })).getByLabelText(
      "영문 이름",
    ),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "학력정보" })).getByLabelText(
      "입학일",
    ),
  ).toHaveAttribute("type", "date");
  expect(
    within(screen.getByRole("region", { name: "자격 / 면허" })).getByLabelText(
      "발급기관",
    ),
  ).toBeInTheDocument();
  expect(container.querySelectorAll("input")).toHaveLength(40);
  expect(
    screen.queryByRole("button", { name: "제출" }),
  ).not.toBeInTheDocument();
});
