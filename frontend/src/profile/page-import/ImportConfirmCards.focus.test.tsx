import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImportConfirmCards } from "./ImportConfirmCards";
import type { Confirmation, ReviewDecisions } from "./review-model";

const base: ReviewDecisions = {
  names: {
    "basicInformation.name": {
      familyName: "김",
      givenName: "예시",
      confirmed: false,
    },
  },
  dates: {},
  targets: {},
};
const confirmed: ReviewDecisions = {
  ...base,
  names: {
    "basicInformation.name": {
      familyName: "김",
      givenName: "예시",
      confirmed: true,
    },
  },
};
const nameCard: Confirmation = {
  kind: "name",
  id: "basicInformation.name",
  source: "basicInformation.name",
  value: "김예시",
  language: "korean",
};
const dateCard: Confirmation = {
  kind: "date",
  id: "certificates.0.acquisitionDate",
  source: "certificates.0.acquisitionDate",
  label: "자격증과 면허증 1 취득일",
  month: "2022-12",
};
const dayLabel = "자격증과 면허증 1 취득일의 일";

const cards = (
  confirmations: readonly Confirmation[],
  decisions: ReviewDecisions,
  onDecide: (next: ReviewDecisions) => void,
) => (
  <ImportConfirmCards
    confirmations={confirmations}
    decisions={decisions}
    duplicateCount={0}
    onDecide={onDecide}
    onPresent={() => {}}
  />
);

it("moves focus into the name editor after 아니에요", () => {
  render(cards([nameCard], base, vi.fn()));
  const no = screen.getByRole("button", { name: "아니에요" });
  no.focus();
  fireEvent.click(no);
  expect(
    screen.getByRole("slider", { name: "국문 성과 이름 구분선" }),
  ).toHaveFocus();
});

it("moves focus to the next card after a card action replaces the card", () => {
  const onDecide = vi.fn();
  const view = render(cards([nameCard, dateCard], base, onDecide));
  const yes = screen.getByRole("button", { name: "맞아요" });
  yes.focus();
  fireEvent.click(yes);
  expect(onDecide).toHaveBeenCalledOnce();
  view.rerender(cards([dateCard], confirmed, onDecide));
  expect(screen.getByLabelText(dayLabel)).toHaveFocus();
});

it("does not take focus from an input outside the cards", () => {
  const onDecide = vi.fn();
  const ui = (
    confirmations: readonly Confirmation[],
    decisions: ReviewDecisions,
  ) => (
    <>
      <input aria-label="바깥 입력" />
      {cards(confirmations, decisions, onDecide)}
    </>
  );
  const view = render(ui([nameCard, dateCard], base));
  const outside = screen.getByLabelText("바깥 입력");
  fireEvent.click(screen.getByRole("button", { name: "맞아요" }));
  outside.focus();
  view.rerender(ui([dateCard], confirmed));
  expect(outside).toHaveFocus();
});

it("keeps a focus destination after the last date-only card is resolved", () => {
  const onDecide = vi.fn();
  const view = render(cards([dateCard], base, onDecide));
  fireEvent.change(screen.getByLabelText(dayLabel), {
    target: { value: "2" },
  });
  const confirm = screen.getByRole("button", { name: "입력했어요" });
  confirm.focus();
  fireEvent.click(confirm);
  view.rerender(
    cards([], { ...base, dates: { [dateCard.id]: "2022-12-02" } }, onDecide),
  );
  expect(
    screen.getByRole("region", { name: "확인이 필요한 정보" }),
  ).toHaveFocus();
});

it("links an invalid day to its error and clears the link once valid", () => {
  const onDecide = vi.fn();
  render(cards([dateCard], base, onDecide));
  const day = screen.getByLabelText(dayLabel);
  expect(day).not.toHaveAttribute("aria-invalid");
  fireEvent.change(day, { target: { value: "32" } });
  fireEvent.click(screen.getByRole("button", { name: "입력했어요" }));
  const alert = screen.getByRole("alert");
  expect(alert.id).not.toBe("");
  expect(day).toHaveAttribute("aria-invalid", "true");
  expect(day).toHaveAttribute("aria-describedby", alert.id);
  expect(onDecide).not.toHaveBeenCalled();
  fireEvent.change(day, { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "입력했어요" }));
  expect(day).not.toHaveAttribute("aria-invalid");
  expect(day).not.toHaveAttribute("aria-describedby");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(onDecide).toHaveBeenCalledWith({
    ...base,
    dates: { [dateCard.id]: "2022-12-02" },
  });
});
