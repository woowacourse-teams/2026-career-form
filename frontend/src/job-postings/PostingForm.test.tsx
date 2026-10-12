import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PostingForm } from "./PostingForm";
import { createPosting, formatDeadline, POSTING_TIME_ZONE } from "./model";

const now = Date.parse("2026-10-06T06:00Z");

function setup() {
  const onSave = vi.fn(async () => {});
  render(
    <PostingForm busy={false} now={now} onSave={onSave} onCancel={() => {}} />,
  );
  return { onSave };
}

function setDeadline(value = "2026-10-08T18:00") {
  fireEvent.change(screen.getByLabelText("마감 날짜·시간"), {
    target: { value },
  });
}

it("회사 정보가 비어 있어도 마감과 알림 설정으로 예약 시각을 미리 보여준다", () => {
  setup();
  setDeadline();
  expect(screen.getByLabelText("회사명")).toHaveValue("");
  expect(
    screen.getByText("저장하면 다음 시각에 알림을 예약합니다."),
  ).toBeInTheDocument();
  for (const at of ["2026-10-07T09:00Z", "2026-10-08T07:00Z"])
    expect(
      screen.getByText(formatDeadline(Date.parse(at), POSTING_TIME_ZONE)),
    ).toBeInTheDocument();
  expect(screen.queryByText(/예약할 미래 알림이 없습니다/)).toBeNull();
});

it("알림을 모두 끄면 지난 알림이 아니라 알림 없이 저장됨을 안내한다", () => {
  setup();
  setDeadline();
  fireEvent.click(screen.getByRole("checkbox", { name: "알림 1" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "알림 2" }));
  expect(screen.getByText("알림 없이 공고만 저장합니다.")).toBeInTheDocument();
  expect(screen.queryByText(/예약할 미래 알림이 없습니다/)).toBeNull();
});

it("유효하지 않은 알림 간격을 지난 알림으로 안내하지 않는다", () => {
  setup();
  setDeadline();
  fireEvent.change(screen.getByLabelText("마감 전 시간 1"), {
    target: { value: "0" },
  });
  expect(
    screen.getByText("알림 시간을 1분 전 이상으로 설정해 주세요."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/예약할 미래 알림이 없습니다/)).toBeNull();
});

it("완료된 공고는 알림 취소 상태를 명시하고 새 알림 예약을 안내하지 않는다", () => {
  const posting = createPosting(
    {
      company: "예시 회사",
      role: "개발",
      url: "https://example.com/jobs",
      deadline: Date.parse("2026-10-08T09:00Z"),
      timeZone: POSTING_TIME_ZONE,
      minutes: [1440, 120],
    },
    now,
    "completed-posting",
  );
  render(
    <PostingForm
      posting={{ ...posting, status: "completed" }}
      busy={false}
      now={now}
      onSave={async () => {}}
      onCancel={() => {}}
    />,
  );
  expect(
    screen.getByText("지원 완료한 공고에는 알림을 보내지 않습니다."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/다음 시각에 알림을 예약/)).toBeNull();
});

it("새 공고의 첫 입력에 초점을 두고 기존 기본 알림으로 저장한다", () => {
  const { onSave } = setup();
  expect(screen.getByLabelText("회사명")).toHaveFocus();
  fireEvent.change(screen.getByLabelText("회사명"), {
    target: { value: "예시 회사" },
  });
  fireEvent.change(screen.getByLabelText("직무"), {
    target: { value: "개발" },
  });
  fireEvent.change(screen.getByLabelText("공고 링크"), {
    target: { value: "https://example.com/jobs" },
  });
  setDeadline();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(onSave).toHaveBeenCalledWith({
    company: "예시 회사",
    role: "개발",
    url: "https://example.com/jobs",
    deadline: Date.parse("2026-10-08T09:00Z"),
    timeZone: POSTING_TIME_ZONE,
    minutes: [1440, 120],
  });
});
