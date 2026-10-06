import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { JobPostings } from "./JobPostings";
import { PostingService } from "./service";
import type { Posting } from "./model";
function setup(fail = false) {
  let rows: Posting[] = [];
  const service = new PostingService(
    {
      load: async () => rows,
      save: async (next) => {
        if (fail) throw Error("저장 실패");
        rows = next;
      },
    },
    {
      now: () => Date.parse("2026-10-06T06:00Z"),
      id: () => "sample",
      permission: async () => true,
      schedule: async () => {},
      notify: async () => {},
      clearNotification: async () => {},
    },
  );
  const client = {
    list: () => service.list(),
    save: service.save.bind(service),
    setCompleted: service.setCompleted.bind(service),
    remove: service.remove.bind(service),
    retry: () => service.recover(),
    subscribe: () => () => {},
  };
  return { client };
}
function fill() {
  fireEvent.change(screen.getByLabelText("회사명"), {
    target: { value: "예시 회사" },
  });
  fireEvent.change(screen.getByLabelText("직무"), {
    target: { value: "백엔드" },
  });
  fireEvent.change(screen.getByLabelText("공고 링크"), {
    target: { value: "https://example.com/jobs" },
  });
  fireEvent.change(screen.getByLabelText("마감 날짜·시간"), {
    target: { value: "2026-10-07T18:00" },
  });
}
it("공고 등록부터 완료와 되돌리기까지 연결한다", async () => {
  const { client } = setup();
  render(
    <JobPostings client={client} now={() => Date.parse("2026-10-06T06:00Z")} />,
  );
  await screen.findByText("지원할 공고를 저장해보세요.");
  fireEvent.click(screen.getByRole("button", { name: "공고 추가" }));
  expect(screen.getByLabelText("마감 날짜·시간")).toHaveValue("");
  fill();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByRole("heading", { name: "예시 회사" });
  expect(screen.getByText("백엔드")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "지원 완료로 표시" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "예시 회사" }),
    ).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: /^지원 완료/ }));
  await screen.findByRole("button", { name: "지원 예정으로 되돌리기" });
  fireEvent.click(
    screen.getByRole("button", { name: "지원 예정으로 되돌리기" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /^지원 예정 \(/ }));
  await screen.findByRole("heading", { name: "예시 회사" });
});
it("저장이 실패하면 입력을 보존하고 성공 메시지를 표시하지 않는다", async () => {
  render(
    <JobPostings
      client={setup(true).client}
      now={() => Date.parse("2026-10-06T06:00Z")}
    />,
  );
  await screen.findByText("지원할 공고를 저장해보세요.");
  fireEvent.click(screen.getByRole("button", { name: "공고 추가" }));
  fill();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("회사명")).toHaveValue("예시 회사");
  expect(screen.queryByText("공고가 저장되었습니다.")).not.toBeInTheDocument();
});
it("과거 알림은 예약하지 않는다는 안내를 저장 전에 보여준다", async () => {
  render(
    <JobPostings
      client={setup().client}
      now={() => Date.parse("2026-10-06T06:00Z")}
    />,
  );
  await screen.findByText("지원할 공고를 저장해보세요.");
  fireEvent.click(screen.getByRole("button", { name: "공고 추가" }));
  fill();
  fireEvent.change(screen.getByLabelText("마감 날짜·시간"), {
    target: { value: "2026-10-06T16:00" },
  });
  expect(screen.getByText(/예약할 미래 알림이 없습니다/)).toBeInTheDocument();
});

it("지난 마감과 늦게 전달한 알림 기록을 목록에서 구분한다", async () => {
  const { client } = setup();
  await client.save({
    company: "늦은 알림 예시",
    role: "개발",
    url: "https://example.com",
    deadline: Date.parse("2026-10-06T18:00Z"),
    timeZone: "Asia/Seoul",
    minutes: [120],
  });
  const snapshot = await client.list();
  snapshot.postings[0].reminders[0] = {
    ...snapshot.postings[0].reminders[0],
    state: "sent",
    deliveredAt: Date.parse("2026-10-06T17:00Z"),
  };
  const lateClient = { ...client, list: async () => snapshot };
  render(
    <JobPostings
      client={lateClient}
      now={() => Date.parse("2026-10-06T19:00Z")}
    />,
  );
  await screen.findByRole("heading", { name: "지난 마감" });
  expect(screen.getByText(/놓친 알림을 다시 안내했습니다/)).toBeInTheDocument();
  expect(screen.getByText("마감 지남")).toBeInTheDocument();
});

it("완료된 공고 수정 폼은 알림을 다시 예약한다고 안내하지 않는다", async () => {
  const { client } = setup();
  await client.save({
    company: "완료 예시",
    role: "개발",
    url: "https://example.com",
    deadline: Date.parse("2026-10-08T18:00Z"),
    timeZone: "Asia/Seoul",
    minutes: [1440, 120],
  });
  await client.setCompleted("sample", 1, true);
  render(
    <JobPostings client={client} now={() => Date.parse("2026-10-06T06:00Z")} />,
  );
  await screen.findByRole("button", { name: "지원 완료 (1)" });
  fireEvent.click(screen.getByRole("button", { name: "지원 완료 (1)" }));
  fireEvent.click(screen.getByRole("button", { name: "수정" }));
  expect(
    screen.queryByText("저장하면 다음 시각에 알림을 예약합니다."),
  ).not.toBeInTheDocument();
});
