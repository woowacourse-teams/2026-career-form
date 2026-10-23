import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createEmptyProfile } from "../model";
import { ImportCategoryList } from "./ImportCategoryList";
import { ImportSummary } from "./ImportSummary";
import type { ImportCandidate } from "./reader";
import {
  buildReviewModel,
  initialDecisions,
  type ReviewDecisions,
  type ReviewRow,
} from "./review-model";

const row = (over: Partial<ReviewRow>): ReviewRow => ({
  key: "k",
  source: "s",
  categoryId: "contact",
  fieldId: "email",
  label: "이메일",
  value: "new@example.test",
  current: "",
  status: "new",
  sensitive: false,
  primary: false,
  ...over,
});
const rows: ReviewRow[] = [
  row({
    key: "email",
    source: "basicInformation.email",
    status: "changed",
    current: "old@example.test",
  }),
  row({
    key: "phone",
    fieldId: "phoneNumber",
    label: "전화번호",
    value: "010-0000-0000",
    current: "010-0000-0000",
    status: "same",
  }),
  row({
    key: "address",
    source: "basicInformation.address",
    fieldId: "addressLine1",
    label: "주소",
    value: "예시 주소",
  }),
  row({
    key: "mil",
    categoryId: "military",
    fieldId: "militaryType",
    label: "병역구분",
    value: "현역병",
    sensitive: true,
  }),
];
const none: ReviewDecisions = { names: {}, dates: {}, targets: {} };

function renderList(
  list: readonly ReviewRow[],
  chosen: Record<string, boolean> = {},
  decisions = none,
) {
  const onToggle = vi.fn();
  const onPresent = vi.fn();
  const onDecide = vi.fn();
  const view = render(
    <ImportCategoryList
      rows={list}
      chosen={chosen}
      decisions={decisions}
      onToggle={onToggle}
      onPresent={onPresent}
      onDecide={onDecide}
    />,
  );
  return { ...view, onToggle, onPresent, onDecide };
}

it("counts chosen new and changed values and the unchanged ones", () => {
  render(<ImportSummary rows={rows} chosen={{ address: true, email: true }} />);
  expect(screen.getByText("프로필에 가져올 정보")).toBeVisible();
  expect(screen.getByTestId("import-count")).toHaveTextContent("2");
  expect(screen.getByText("새로 추가").parentElement).toHaveTextContent("1");
  expect(screen.getByText("기존 값 변경").parentElement).toHaveTextContent("1");
  expect(screen.getByText("이미 같음").parentElement).toHaveTextContent("1");
});

it("toggles a whole category with its switch and shows the previous value of a change", () => {
  const { onToggle } = renderList(rows, { address: true });
  const contact = screen.getByRole("switch", {
    name: "연락처와 주소 가져오기",
  });
  expect(contact).toHaveAttribute("aria-checked", "mixed");
  fireEvent.click(contact);
  expect(onToggle).toHaveBeenCalledWith(["email", "address"], true);
  fireEvent.click(screen.getByRole("button", { name: /연락처와 주소/ }));
  expect(screen.getByText("old@example.test")).toBeVisible();
  expect(screen.queryByText("010-0000-0000")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "변경 없는 1개 보기" }));
  expect(screen.getByText("010-0000-0000")).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: "이메일 가져오기" }));
  expect(onToggle).toHaveBeenLastCalledWith(["email"], true);
});

it("turns a fully selected category off", () => {
  const { onToggle } = renderList(rows, { address: true, email: true });
  fireEvent.click(
    screen.getByRole("switch", { name: "연락처와 주소 가져오기" }),
  );
  expect(onToggle).toHaveBeenCalledWith(["email", "address"], false);
});

it("starts sensitive categories off and labels them", () => {
  renderList(rows);
  const military = screen.getByRole("switch", { name: "병역 가져오기" });
  expect(military).toHaveAttribute("aria-checked", "false");
  expect(
    within(military.closest("[data-category]") as HTMLElement).getByText(
      "민감 정보",
    ),
  ).toBeVisible();
});

it("reports the source of a hovered or focused value", () => {
  const { onPresent } = renderList(rows);
  fireEvent.click(screen.getByRole("button", { name: /연락처와 주소/ }));
  fireEvent.focus(screen.getByRole("checkbox", { name: "주소 가져오기" }));
  expect(onPresent).toHaveBeenCalledWith("basicInformation.address");
});

const school: ImportCandidate = {
  source: "educationalBackground.universities.0.schoolName",
  rowIndex: 0,
  profileFieldKey: "education.university.schoolName",
  status: "available",
  reason: "direct",
  value: "예시대학교",
};
const monthEnd: ImportCandidate = {
  source: "educationalBackground.universities.0.graduationDate",
  rowIndex: 0,
  profileFieldKey: "education.university.endDate",
  status: "review",
  reason: "month_precision",
  precision: "month",
  value: "2023-02",
};

it("groups repeated rows into entries with their own switch and save mode", () => {
  const model = buildReviewModel(
    [school, monthEnd],
    createEmptyProfile(),
    initialDecisions([school, monthEnd]),
  );
  const { onToggle } = renderList(model.rows, { [school.source]: true });
  fireEvent.click(screen.getByRole("button", { name: /학력/ }));
  const entry = screen.getByRole("group", { name: "예시대학교" });
  expect(within(entry).getByText("새 항목")).toBeVisible();
  expect(within(entry).getByText("대학교 1")).toBeVisible();
  expect(
    within(entry).getByText("위에서 날짜를 정하면 함께 저장돼요"),
  ).toBeVisible();
  expect(
    within(entry).getByRole("checkbox", { name: "대학교 1 졸업일 가져오기" }),
  ).toBeDisabled();
  fireEvent.click(
    within(entry).getByRole("switch", { name: "예시대학교 가져오기" }),
  );
  expect(onToggle).toHaveBeenCalledWith([school.source], false);
});

it("lets the user revisit a decided date or save target", () => {
  const decisions: ReviewDecisions = {
    names: {},
    dates: { [monthEnd.source]: "2023-02-17" },
    targets: { "education.university.0": "new" },
  };
  const model = buildReviewModel(
    [school, monthEnd],
    createEmptyProfile(),
    decisions,
  );
  const { onDecide } = renderList(model.rows, {}, decisions);
  fireEvent.click(screen.getByRole("button", { name: /학력/ }));
  expect(screen.getByText("2023.02.17")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "대학교 1 졸업일 다시 정하기" }),
  );
  expect(onDecide).toHaveBeenLastCalledWith({
    ...decisions,
    dates: {},
  });
  fireEvent.click(
    screen.getByRole("button", { name: "예시대학교 저장 위치 다시 정하기" }),
  );
  expect(onDecide).toHaveBeenLastCalledWith({ ...decisions, targets: {} });
});

it("shows option labels instead of stored option values", () => {
  renderList([
    row({
      key: "status",
      categoryId: "military",
      fieldId: "militaryStatus",
      label: "병역 상태",
      value: "military-status:served",
      sensitive: true,
      field: {
        id: "militaryStatus",
        label: "병역 상태",
        inputType: "select",
        options: [{ value: "military-status:served", label: "군필" }],
      },
    }),
  ]);
  fireEvent.click(screen.getByRole("button", { name: /병역/ }));
  expect(screen.getByText("군필")).toBeVisible();
});

it("never renders a middle dot", () => {
  const model = buildReviewModel(
    [
      {
        source: "certificates.0.name",
        rowIndex: 0,
        profileFieldKey: "certifications.certificate.name",
        status: "available",
        reason: "direct",
        value: "예시자격",
      },
    ],
    createEmptyProfile(),
    initialDecisions([]),
  );
  const { container } = renderList(model.rows);
  fireEvent.click(screen.getByRole("button", { name: /자격증/ }));
  expect(container.textContent).not.toContain("·");
});
