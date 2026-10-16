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
const targetCard: Confirmation = {
  kind: "target",
  id: "education.university.0",
  source: "educationalBackground.universities.0.schoolName",
  name: "예시대학교",
  primary: "schoolName",
  fields: [
    { fieldId: "schoolName", label: "학교명", value: "예시대학교" },
    { fieldId: "endDate", label: "졸업일", value: "2023-02-17" },
  ],
  entries: [
    {
      id: "u1",
      sectionId: "university",
      values: { schoolName: "예시대학교", startDate: "2019-03-02" },
    },
  ],
};

function renderCards(
  confirmations: readonly Confirmation[],
  decisions: ReviewDecisions = base,
  duplicateCount = 0,
) {
  const onDecide = vi.fn();
  const onPresent = vi.fn();
  const view = render(
    <ImportConfirmCards
      confirmations={confirmations}
      decisions={decisions}
      duplicateCount={duplicateCount}
      onDecide={onDecide}
      onPresent={onPresent}
    />,
  );
  return { ...view, onDecide, onPresent };
}

it("confirms a suggested name split with one answer", () => {
  const { onDecide } = renderCards([nameCard]);
  expect(
    screen.getByRole("heading", { name: "국문 이름을 이렇게 나누면 될까요?" }),
  ).toBeVisible();
  expect(
    screen
      .getAllByRole("button")
      .map((item) => item.textContent)
      .filter((text) => text === "맞아요" || text === "아니에요"),
  ).toEqual(["맞아요", "아니에요"]);
  fireEvent.click(screen.getByRole("button", { name: "맞아요" }));
  expect(onDecide).toHaveBeenCalledWith({
    ...base,
    names: {
      "basicInformation.name": {
        familyName: "김",
        givenName: "예시",
        confirmed: true,
      },
    },
  });
});

it("opens the split editor on 아니에요 and records only the confirmed edit", () => {
  const { onDecide } = renderCards([nameCard]);
  fireEvent.click(screen.getByRole("button", { name: "아니에요" }));
  fireEvent.change(
    screen.getByRole("slider", { name: "국문 성과 이름 구분선" }),
    { target: { value: "2" } },
  );
  expect(onDecide).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "이렇게 저장할게요" }));
  expect(onDecide).toHaveBeenCalledWith({
    ...base,
    names: {
      "basicInformation.name": {
        familyName: "김예",
        givenName: "시",
        confirmed: true,
      },
    },
  });
});

it("cannot accept a suggestion that has no family name", () => {
  renderCards([nameCard], {
    ...base,
    names: {
      "basicInformation.name": {
        familyName: "",
        givenName: "김예시",
        confirmed: false,
      },
    },
  });
  expect(screen.getByRole("button", { name: "맞아요" })).toBeDisabled();
});

it("lists a confirmed name and lets the user revise it", () => {
  const { onDecide } = renderCards([], {
    ...base,
    names: {
      "basicInformation.name": {
        familyName: "김",
        givenName: "예시",
        confirmed: true,
      },
    },
  });
  expect(screen.getByText("확인할 정보를 모두 정리했어요")).toBeVisible();
  expect(screen.getByText("성 김, 이름 예시")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "국문 이름 수정" }));
  expect(onDecide).toHaveBeenCalledWith(base);
});

it("asks only for the day of a month date and allows dropping the date", () => {
  const { onDecide } = renderCards([dateCard]);
  expect(
    screen.getByRole("heading", { name: "2022년 12월 며칠인가요?" }),
  ).toBeVisible();
  const day = screen.getByLabelText("자격증과 면허증 1 취득일의 일");
  fireEvent.change(day, { target: { value: "32" } });
  fireEvent.click(screen.getByRole("button", { name: "입력했어요" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "1부터 31 사이로 입력해 주세요",
  );
  expect(onDecide).not.toHaveBeenCalled();
  fireEvent.change(day, { target: { value: "9" } });
  fireEvent.click(screen.getByRole("button", { name: "입력했어요" }));
  expect(onDecide).toHaveBeenLastCalledWith({
    ...base,
    dates: { [dateCard.id]: "2022-12-09" },
  });
  fireEvent.click(screen.getByRole("button", { name: "기억이 안 나요" }));
  expect(onDecide).toHaveBeenLastCalledWith({
    ...base,
    dates: { [dateCard.id]: null },
  });
});

it("rejects a day that does not exist in that month", () => {
  const { onDecide } = renderCards([{ ...dateCard, month: "2023-02" }]);
  fireEvent.change(screen.getByLabelText("자격증과 면허증 1 취득일의 일"), {
    target: { value: "30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "입력했어요" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "2023년 2월에는 30일이 없어요",
  );
  expect(onDecide).not.toHaveBeenCalled();
});

it("asks for a full date when the page gave no month", () => {
  const { onDecide } = renderCards([{ ...dateCard, month: undefined }]);
  fireEvent.change(screen.getByLabelText("자격증과 면허증 1 취득일"), {
    target: { value: "2022-12-09" },
  });
  fireEvent.click(screen.getByRole("button", { name: "입력했어요" }));
  expect(onDecide).toHaveBeenCalledWith({
    ...base,
    dates: { [dateCard.id]: "2022-12-09" },
  });
});

it("defers a card and brings it back later", () => {
  renderCards([nameCard, dateCard]);
  fireEvent.click(screen.getByRole("button", { name: "나중에 할게요" }));
  expect(
    screen.getByRole("heading", { name: "2022년 12월 며칠인가요?" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "나중에 할게요" }));
  expect(screen.getByText("나중에 하기로 한 2개")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "지금 확인할게요" }));
  expect(
    screen.getByRole("heading", { name: "국문 이름을 이렇게 나누면 될까요?" }),
  ).toBeVisible();
});

it("compares a same-name entry side by side and records the explicit choice", () => {
  const { onDecide } = renderCards([targetCard]);
  expect(
    screen.getByRole("heading", {
      name: "예시대학교, 프로필에 있는 항목과 같은가요?",
    }),
  ).toBeVisible();
  expect(screen.getByRole("row", { name: /졸업일/ })).toHaveAttribute(
    "data-different",
    "true",
  );
  expect(screen.getByRole("row", { name: /학교명/ })).toHaveAttribute(
    "data-different",
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: /같은 항목이에요/ }));
  expect(onDecide).toHaveBeenLastCalledWith({
    ...base,
    targets: { [targetCard.id]: "existing:u1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "다른 항목이에요" }));
  expect(onDecide).toHaveBeenLastCalledWith({
    ...base,
    targets: { [targetCard.id]: "new" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "이 항목은 가져오지 않을게요" }),
  );
  expect(onDecide).toHaveBeenLastCalledWith({
    ...base,
    targets: { [targetCard.id]: "skip" },
  });
});

it("lets the user pick which of several same-name entries to update", () => {
  const second = {
    id: "u2",
    sectionId: "university",
    values: { schoolName: "예시대학교", startDate: "2023-03-02" },
  };
  const { onDecide } = renderCards([
    {
      ...targetCard,
      entries: [
        ...(targetCard.kind === "target" ? targetCard.entries : []),
        second,
      ],
    },
  ]);
  fireEvent.click(screen.getByRole("radio", { name: /2023\.03\.02/ }));
  fireEvent.click(screen.getByRole("button", { name: /같은 항목이에요/ }));
  expect(onDecide).toHaveBeenCalledWith({
    ...base,
    targets: { [targetCard.id]: "existing:u2" },
  });
});

it("cannot add an unnamed row as a new entry", () => {
  renderCards([{ ...targetCard, name: undefined }]);
  expect(
    screen.getByRole("button", { name: "다른 항목이에요" }),
  ).toBeDisabled();
});

it("reports the source of the card under the pointer or focus", () => {
  const { onPresent } = renderCards([dateCard]);
  fireEvent.focus(screen.getByLabelText("자격증과 면허증 1 취득일의 일"));
  expect(onPresent).toHaveBeenCalledWith(dateCard.source);
});

it("explains rows left out because they would be saved twice", () => {
  renderCards([], base, 2);
  expect(screen.getByRole("status")).toHaveTextContent(
    "같은 정보가 두 번 들어 있어 2개 항목은 저장하지 않아요",
  );
});

it("never renders a middle dot in card copy", () => {
  const { container } = renderCards([nameCard, dateCard, targetCard], base, 1);
  expect(container.textContent).not.toContain("·");
  fireEvent.click(screen.getByRole("button", { name: "아니에요" }));
  expect(container.textContent).not.toContain("·");
});

it("shows option labels rather than stored codes in the comparison table", () => {
  renderCards([
    {
      ...targetCard,
      fields: [
        {
          fieldId: "schoolRegion",
          label: "학교 소재지",
          value: "region:seoul",
          options: [
            { value: "region:seoul", label: "서울" },
            { value: "region:busan", label: "부산" },
          ],
        },
      ],
      entries: [
        {
          id: "u1",
          sectionId: "university",
          values: { schoolName: "예시대학교", schoolRegion: "region:busan" },
        },
      ],
    },
  ]);
  const row = screen.getByRole("row", { name: /학교 소재지/ });
  expect(row).toHaveTextContent("부산");
  expect(row).toHaveTextContent("서울");
  expect(row.textContent).not.toContain("region:");
});
