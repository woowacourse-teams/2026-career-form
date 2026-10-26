import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { JobPostings } from "./JobPostings";
import { PostingService } from "./service";
import type { Posting } from "./model";
import type { ServerPosting } from "./push-api";
import type { PushClient } from "./push-client";
import type { PushStateView } from "./push-messages";
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
  const inbox: ServerPosting[] = [];
  let pushState: PushStateView = {
    enabled: true,
    supported: true,
    status: null,
    permission: "granted",
    visibility: { result: "seen", checkedAt: 0, source: "test" },
    autoSave: true,
    unread: 0,
  };
  const pushClient: PushClient = {
    state: async () => pushState,
    setEnabled: async (enabled) => (pushState = { ...pushState, enabled }),
    setAutoSave: async (autoSave) => (pushState = { ...pushState, autoSave }),
    test: async () => pushState,
    record: async () => pushState,
    later: async () => pushState,
    inbox: async () => inbox,
    subscribe: () => () => {},
  };
  return {
    client,
    pushClient,
    inbox,
    setAutoSave: (value: boolean) => {
      pushState = { ...pushState, autoSave: value };
    },
  };
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
  const { client, pushClient } = setup();
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => Date.parse("2026-10-06T06:00Z")}
    />,
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
      {...setup(true)}
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
    <JobPostings {...setup()} now={() => Date.parse("2026-10-06T06:00Z")} />,
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
  const { client, pushClient } = setup();
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
      pushClient={pushClient}
      now={() => Date.parse("2026-10-06T19:00Z")}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "마감 지남 (1)" }));
  await screen.findByRole("heading", { name: "지난 마감" });
  expect(screen.getByText(/놓친 알림을 다시 안내했습니다/)).toBeInTheDocument();
  expect(screen.getByText("마감 지남")).toBeInTheDocument();
});

it("완료된 공고 수정 폼은 알림을 다시 예약한다고 안내하지 않는다", async () => {
  const { client, pushClient } = setup();
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
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => Date.parse("2026-10-06T06:00Z")}
    />,
  );
  await screen.findByRole("button", { name: "지원 완료 (1)" });
  fireEvent.click(screen.getByRole("button", { name: "지원 완료 (1)" }));
  fireEvent.click(screen.getByRole("button", { name: /수정$/ }));
  expect(
    screen.queryByText("저장하면 다음 시각에 알림을 예약합니다."),
  ).not.toBeInTheDocument();
});

it("시간과 분으로 알림을 저장하고 수정할 때 복원한다", async () => {
  const { client, pushClient } = setup();
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => Date.parse("2026-10-06T06:00Z")}
    />,
  );
  await screen.findByText("지원할 공고를 저장해보세요.");
  fireEvent.click(screen.getByRole("button", { name: "공고 추가" }));
  fill();
  fireEvent.change(screen.getByLabelText("마감 전 시간 1"), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("마감 전 분 1"), {
    target: { value: "30" },
  });
  fireEvent.change(screen.getByLabelText("마감 전 시간 2"), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByLabelText("마감 전 분 2"), {
    target: { value: "1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByRole("heading", { name: "예시 회사" });
  const { postings } = await client.list();
  expect(
    postings[0].reminders.map((r) => r.minutes).sort((a, b) => a - b),
  ).toEqual([1, 90]);
  expect(
    postings[0].reminders.every(
      (r) => r.at === postings[0].deadline - r.minutes * 60000,
    ),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /수정$/ }));
  const totals = [1, 2].map(
    (i) =>
      Number(
        (screen.getByLabelText(`마감 전 시간 ${i}`) as HTMLInputElement).value,
      ) *
        60 +
      Number(
        (screen.getByLabelText(`마감 전 분 ${i}`) as HTMLInputElement).value,
      ),
  );
  expect(totals.sort((a, b) => a - b)).toEqual([1, 90]);
});

it("지원 예정, 지난 마감, 완료를 분리하고 빈 목록의 다음 행동을 안내한다", async () => {
  const now = Date.parse("2026-10-06T06:00Z");
  const { client, pushClient } = setup();
  const base: Posting = {
    id: "future",
    version: 1,
    company: "다가올 회사",
    role: "개발",
    url: "https://example.com/jobs",
    deadline: now + 3600000,
    timeZone: "Asia/Seoul",
    status: "planned",
    updatedAt: now,
    reminders: [{ minutes: 30, at: now + 1800000, state: "pending" }],
  };
  const rows: Posting[] = [
    base,
    { ...base, id: "past", company: "지난 회사", deadline: now - 1 },
  ];
  render(
    <JobPostings
      client={{
        ...client,
        list: async () => ({ postings: rows, problems: [] }),
      }}
      pushClient={pushClient}
      now={() => now}
    />,
  );
  await screen.findByRole("heading", { name: "다가올 회사" });
  expect(
    screen.queryByRole("heading", { name: "지난 회사" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "지원 예정 (1)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("알림 1개 설정됨")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "마감 지남 (1)" }));
  expect(
    screen.getByRole("heading", { name: "지난 회사" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "다가올 회사" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "지원 완료 (0)" }));
  expect(screen.getByText("아직 완료한 지원이 없어요")).toBeInTheDocument();
  expect(
    screen.getByText(
      "지원을 마친 공고를 완료로 표시하면 여기에 모아볼 수 있어요.",
    ),
  ).toBeInTheDocument();
});

it("편집을 취소하면 목록의 원래 수정 버튼으로 초점을 돌린다", async () => {
  const { client, pushClient } = setup();
  await client.save({
    company: "초점 예시",
    role: "개발",
    url: "https://example.com",
    deadline: Date.parse("2026-10-08T18:00Z"),
    timeZone: "Asia/Seoul",
    minutes: [],
  });
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => Date.parse("2026-10-06T06:00Z")}
    />,
  );
  const edit = await screen.findByRole("button", { name: "초점 예시 수정" });
  edit.focus();
  fireEvent.click(edit);
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "초점 예시 수정" }),
    ).toHaveFocus(),
  );
});

it("지난 공고의 마감을 연장하면 지원 예정 목록으로 돌아온다", async () => {
  const { client, pushClient } = setup();
  await client.save({
    company: "연장 예시",
    role: "개발",
    url: "https://example.com",
    deadline: Date.parse("2026-10-06T07:00Z"),
    timeZone: "Asia/Seoul",
    minutes: [],
  });
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => Date.parse("2026-10-06T08:00Z")}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "마감 지남 (1)" }));
  fireEvent.click(screen.getByRole("button", { name: "연장 예시 수정" }));
  fireEvent.change(screen.getByLabelText("마감 날짜·시간"), {
    target: { value: "2026-10-07T18:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByRole("heading", { name: "연장 예시" });
  expect(screen.getByRole("button", { name: "지원 예정 (1)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "연장 예시 수정" }),
    ).toHaveFocus(),
  );
});

it("삭제 버튼 한 번으로 확인창 없이 저장소에서 삭제한다", async () => {
  const { client, pushClient } = setup();
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => Date.parse("2026-10-06T06:00Z")}
    />,
  );
  await screen.findByText("지원할 공고를 저장해보세요.");
  fireEvent.click(screen.getByRole("button", { name: "공고 추가" }));
  fill();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByRole("heading", { name: "예시 회사" });
  fireEvent.click(screen.getByRole("button", { name: "예시 회사 삭제" }));
  expect(screen.queryByRole("region", { name: "공고 삭제 확인" })).toBeNull();
  await screen.findByText("공고를 삭제했습니다.");
  expect((await client.list()).postings).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "알림 닫기" }));
  expect(screen.queryByText("공고를 삭제했습니다.")).toBeNull();
});

it("공지함의 공고를 마감 알림으로 저장하고 저장됨으로 구분한다", async () => {
  const now = Date.parse("2026-10-06T06:00Z");
  const { client, pushClient, inbox } = setup();
  inbox.push({
    id: "a".repeat(32),
    company: "공지 회사",
    role: "데이터",
    link: "https://careers.example.test/jobs/notice",
    opensAt: now - 3600000,
    closesAt: now + 3 * 86400000,
  });
  const track = vi.fn();
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => now}
      track={track}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "공지 회사 마감 알림 저장" }),
  );
  await screen.findByText("공고를 마감 알림에 저장했습니다.");
  expect(screen.getAllByRole("heading", { name: "공지 회사" })).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: "공지 회사 마감 알림 저장" }),
  ).toBeDisabled();
  expect(screen.getByText("✓ 저장됨")).toBeInTheDocument();
  const { postings } = await client.list();
  expect(postings[0]).toMatchObject({
    company: "공지 회사",
    url: "https://careers.example.test/jobs/notice",
    deadline: now + 3 * 86400000,
    timeZone: "Asia/Seoul",
  });
  expect(postings[0].reminders.map((r) => r.minutes)).toEqual([1440, 120]);
  expect(track).toHaveBeenCalledWith("posting_inbox_saved", {
    surface: "options",
    posting_id: "a".repeat(32),
    trigger: "button",
  });
  expect(JSON.stringify(track.mock.calls)).not.toContain("공지 회사");
  expect(JSON.stringify(track.mock.calls)).not.toContain("careers.example");
});

it("남은 알림이 없는 공지함 공고를 저장하면 기존 안내를 보여 준다", async () => {
  const now = Date.parse("2026-10-06T06:00Z");
  const { client, pushClient, inbox } = setup();
  inbox.push({
    id: "b".repeat(32),
    company: "임박 회사",
    role: "데이터",
    link: "https://careers.example.test/jobs/soon",
    opensAt: now - 3600000,
    closesAt: now + 3600000,
  });
  render(
    <JobPostings client={client} pushClient={pushClient} now={() => now} />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "임박 회사 마감 알림 저장" }),
  );
  await screen.findByText(/예약할 미래 알림이 없습니다/);
  expect((await client.list()).postings).toHaveLength(1);
});

it("공지함에서 공고를 열면 자동 저장하고 취소하면 저장과 예약을 함께 지운다", async () => {
  const now = Date.parse("2026-10-06T06:00Z");
  const { client, pushClient, inbox } = setup();
  inbox.push({
    id: "c".repeat(32),
    company: "열기 회사",
    role: "데이터",
    link: "https://careers.example.test/jobs/open",
    opensAt: now - 3600000,
    closesAt: now + 3 * 86400000,
  });
  const track = vi.fn();
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => now}
      track={track}
    />,
  );
  fireEvent.click(
    await screen.findByRole("link", { name: "열기 회사 공고 열기" }),
  );
  await screen.findByText("공고를 마감 알림에 저장했습니다.");
  expect((await client.list()).postings).toHaveLength(1);
  expect(track).toHaveBeenCalledWith("posting_inbox_saved", {
    surface: "options",
    posting_id: "c".repeat(32),
    trigger: "open",
  });
  fireEvent.click(screen.getByRole("button", { name: "열기 회사 저장 취소" }));
  await screen.findByText("마감 알림 저장을 취소했습니다.");
  expect((await client.list()).postings).toHaveLength(0);
  expect(track).toHaveBeenCalledWith("posting_auto_save_cancelled", {
    surface: "options",
    posting_id: "c".repeat(32),
  });
  expect(
    screen.queryByRole("button", { name: "열기 회사 저장 취소" }),
  ).toBeNull();
});

it("자동 저장을 끄면 공지함에서 열어도 저장하지 않는다", async () => {
  const now = Date.parse("2026-10-06T06:00Z");
  const { client, pushClient, inbox, setAutoSave } = setup();
  setAutoSave(false);
  inbox.push({
    id: "d".repeat(32),
    company: "열기만 회사",
    role: "데이터",
    link: "https://careers.example.test/jobs/open-only",
    opensAt: now - 3600000,
    closesAt: now + 3 * 86400000,
  });
  render(
    <JobPostings client={client} pushClient={pushClient} now={() => now} />,
  );
  fireEvent.click(
    await screen.findByRole("link", { name: "열기만 회사 공고 열기" }),
  );
  await screen.findByRole("switch", {
    name: "공고를 열면 마감 알림에 자동 저장",
  });
  expect((await client.list()).postings).toHaveLength(0);
  expect(screen.queryByText("공고를 마감 알림에 저장했습니다.")).toBeNull();
});

it("구독 설정 패널은 저장 공고 목록 아래, 알림과 로컬 저장 안내 위에 있다", async () => {
  const { client, pushClient } = setup();
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => Date.parse("2026-10-06T06:00Z")}
    />,
  );
  await screen.findByText("지원할 공고를 저장해보세요.");
  const headings = screen
    .getAllByRole("heading", { level: 2 })
    .map((h) => h.textContent);
  expect(headings.indexOf("공지함")).toBeLessThan(
    headings.indexOf("다가오는 마감"),
  );
  expect(headings.indexOf("다가오는 마감")).toBeLessThan(
    headings.indexOf("공고 알림 구독"),
  );
  const panel = screen.getByRole("heading", { name: "공고 알림 구독" });
  const notice = screen.getByText("알림과 로컬 저장 안내");
  expect(
    panel.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("직무 없이 저장한 공고는 목록에서 직무 줄을 숨긴다", async () => {
  const { client, pushClient } = setup();
  await client.save({
    company: "직무 없는 회사",
    role: "",
    url: "https://example.com/jobs/no-role",
    deadline: Date.parse("2026-10-08T18:00Z"),
    timeZone: "Asia/Seoul",
    minutes: [],
  });
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => Date.parse("2026-10-06T06:00Z")}
    />,
  );
  const heading = await screen.findByRole("heading", {
    name: "직무 없는 회사",
  });
  expect(heading.parentElement?.querySelector("p")).toBeNull();
});
