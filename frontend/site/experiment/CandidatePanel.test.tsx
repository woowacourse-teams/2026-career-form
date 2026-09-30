import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { CandidatePanel, type CandidateId } from "./CandidatePanel";

it("shows only the latest completed field and waits for the first write", () => {
  const { rerender } = render(
    <CandidatePanel
      candidate="live"
      completed={0}
      running
      reducedMotion={false}
    />,
  );
  expect(screen.queryByText("김")).not.toBeInTheDocument();
  expect(screen.queryByRole("definition")).not.toBeInTheDocument();
  rerender(
    <CandidatePanel
      candidate="live"
      completed={1}
      running
      reducedMotion={false}
    />,
  );
  expect(screen.getByRole("term")).toHaveTextContent("성");
  expect(screen.getByRole("definition")).toHaveTextContent("김");
  rerender(
    <CandidatePanel
      candidate="live"
      completed={2}
      running
      reducedMotion={false}
    />,
  );
  expect(screen.getByRole("term")).toHaveTextContent("이름");
  expect(screen.getByRole("definition")).toHaveTextContent("커리어");
  expect(screen.queryByText("김")).not.toBeInTheDocument();
});

it.each(["reassurance", "live", "distraction", "next"] as const)(
  "keeps %s independent of percentage feedback and exposes its motion state",
  (candidate: CandidateId) => {
    const { rerender } = render(
      <CandidatePanel
        candidate={candidate}
        completed={20}
        running
        reducedMotion={false}
      />,
    );
    const panel = screen.getByRole("region", { name: "대기 화면 후보" });
    expect(within(panel).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(panel).not.toHaveTextContent("50%");
    expect(
      within(panel).getByRole("img", { name: "지원서를 쓰는 카피바라" }),
    ).toBeInTheDocument();
    expect(panel).toHaveAttribute("data-running", "true");
    rerender(
      <CandidatePanel
        candidate={candidate}
        completed={20}
        running={false}
        reducedMotion
      />,
    );
    expect(panel).toHaveAttribute("data-running", "false");
    expect(panel).toHaveAttribute("data-reduced-motion", "true");
  },
);
