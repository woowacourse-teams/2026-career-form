import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { JobPostings } from "./JobPostings";
import { PostingService } from "./service";
import type { Posting } from "./model";
import type { ServerPosting } from "./push-api";
import type { PushClient } from "./push-client";
import type { PushStateView } from "./push-messages";
function setup(fail = false) {
  let rows: Posting[] = [];
  let failure = fail ? new Error("저장 실패") : undefined;
  const service = new PostingService(
    {
      load: async () => rows,
      save: async (next) => {
        if (failure) throw failure;
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
  const pushState: PushStateView = {
    enabled: true,
    supported: true,
    status: null,
    permission: "granted",
    visibility: { result: "seen", checkedAt: 0, source: "test" },
    unread: 0,
  };
  const pushClient: PushClient = {
    state: async () => pushState,
    setEnabled: async () => pushState,
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
    failWith: (error?: Error) => {
      failure = error;
    },
  };
}
const NOW = Date.parse("2026-10-06T06:00Z");
function inboxPosting(company = "공지 회사"): ServerPosting {
  return {
    id: "a".repeat(32),
    company,
    role: "데이터",
    link: "https://careers.example.test/jobs/notice",
    opensAt: NOW - 3600000,
    closesAt: NOW + 3 * 86400000,
  };
}
const savedInput = (company: string) => ({
  company,
  role: "개발",
  url: "https://example.test/jobs",
  deadline: Date.parse("2026-10-08T18:00Z"),
  timeZone: "Asia/Seoul",
  minutes: [],
});
it.each([
  "SYNTHETIC_WRITE_FAILURE: quota exceeded",
  "SYNTHETIC_WRITE_FAILURE: 저장 장치 내부 오류",
])(
  "keeps unknown write details private and allows a save retry: %s",
  async (raw) => {
    const { client, pushClient, inbox, failWith } = setup();
    inbox.push(inboxPosting());
    render(
      <JobPostings
        client={client}
        pushClient={pushClient}
        now={() => NOW}
        track={() => undefined}
      />,
    );
    const save = await screen.findByRole("button", {
      name: "공지 회사 마감 알림 저장",
    });
    failWith(new Error(raw));
    fireEvent.click(save);
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(raw);
    expect(
      within(alert).queryByRole("button", { name: "목록 다시 불러오기" }),
    ).toBeNull();
    expect(screen.queryByText("공고를 마감 알림에 저장했습니다.")).toBeNull();
    failWith(undefined);
    fireEvent.click(
      screen.getByRole("button", { name: "공지 회사 마감 알림 저장" }),
    );
    await screen.findByText("공고를 마감 알림에 저장했습니다.");
    expect((await client.list()).postings).toHaveLength(1);
  },
);

it.each([
  ["회사명을 입력해 주세요.", false],
  ["다른 화면에서 공고가 변경되었습니다. 목록을 새로 불러와 주세요.", true],
] as const)(
  "preserves domain guidance and its recovery action: %s",
  async (message, reload) => {
    const { client, pushClient, inbox, failWith } = setup();
    inbox.push(inboxPosting());
    render(
      <JobPostings
        client={client}
        pushClient={pushClient}
        now={() => NOW}
        track={() => undefined}
      />,
    );
    const save = await screen.findByRole("button", {
      name: "공지 회사 마감 알림 저장",
    });
    failWith(new Error(message));
    fireEvent.click(save);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(
      within(alert).queryByRole("button", { name: "목록 다시 불러오기" }) !==
        null,
    ).toBe(reload);
  },
);

it("recovers a failed list read without treating it as a save retry", async () => {
  const { client, pushClient } = setup();
  const list = vi
    .fn(client.list)
    .mockRejectedValueOnce(new Error("SYNTHETIC_LIST_FAILURE"));
  await act(async () => {
    render(
      <JobPostings
        client={{ ...client, list }}
        pushClient={pushClient}
        now={() => Date.parse("2026-10-06T06:00Z")}
        track={() => undefined}
      />,
    );
  });
  const alert = screen.getByRole("alert");
  expect(alert).not.toHaveTextContent("SYNTHETIC_LIST_FAILURE");
  await act(async () => {
    fireEvent.click(
      within(alert).getByRole("button", { name: "목록 다시 불러오기" }),
    );
  });
  expect(list).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("지원할 공고를 저장해보세요.")).toBeInTheDocument();
});

it("returns deletion focus without suppressing browser scrolling", async () => {
  const { client, pushClient } = setup();
  await client.save({
    company: "삭제 예시",
    role: "개발",
    url: "https://example.test/jobs",
    deadline: Date.parse("2026-10-08T18:00Z"),
    timeZone: "Asia/Seoul",
    minutes: [],
  });
  await act(async () => {
    render(
      <JobPostings
        client={client}
        pushClient={pushClient}
        now={() => Date.parse("2026-10-06T06:00Z")}
        track={() => undefined}
      />,
    );
  });
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  try {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "삭제 예시 삭제" }));
    });
    const heading = screen.getByRole("heading", { name: "다가오는 마감" });
    expect(heading).toHaveFocus();
    const calls = focus.mock.calls.filter(
      (_, index) => focus.mock.contexts[index] === heading,
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some(([options]) => options?.preventScroll)).toBe(false);
  } finally {
    focus.mockRestore();
  }
});

it("공고 추가 버튼과 입력 폼 없이 저장한 공고는 열기·삭제·지원 완료만 제공한다", async () => {
  const { client, pushClient } = setup();
  await client.save(savedInput("저장 회사"));
  render(
    <JobPostings client={client} pushClient={pushClient} now={() => NOW} />,
  );
  await screen.findByRole("heading", { name: "저장 회사" });
  expect(screen.queryByRole("button", { name: /공고 추가/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /공고 저장하기/ })).toBeNull();
  expect(screen.queryByLabelText("회사명")).toBeNull();
  expect(screen.queryByLabelText("마감 날짜·시간")).toBeNull();
  expect(screen.queryByRole("button", { name: /수정$/ })).toBeNull();
  expect(screen.getByRole("link", { name: /공고 열기/ })).toHaveAttribute(
    "href",
    "https://example.test/jobs",
  );
  expect(
    screen.getByRole("button", { name: "저장 회사 삭제" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "지원 완료로 표시" }),
  ).toBeInTheDocument();
});

it("빈 목록은 직접 추가를 안내하지 않고 추가 동작도 두지 않는다", async () => {
  const { client, pushClient } = setup();
  render(
    <JobPostings client={client} pushClient={pushClient} now={() => NOW} />,
  );
  const title = await screen.findByText("지원할 공고를 저장해보세요.");
  const empty = title.parentElement as HTMLElement;
  expect(empty).not.toHaveTextContent(/추가|직접/);
  expect(empty).toHaveTextContent("공지함");
  expect(within(empty).queryByRole("button")).toBeNull();
  expect(screen.queryByText(/설정한 시간/)).toBeNull();
});

it("저장한 공고를 지원 완료로 옮기고 되돌린다", async () => {
  const { client, pushClient } = setup();
  await client.save(savedInput("예시 회사"));
  render(
    <JobPostings client={client} pushClient={pushClient} now={() => NOW} />,
  );
  await screen.findByRole("heading", { name: "예시 회사" });
  expect(screen.getByText("개발")).toBeInTheDocument();
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

it("삭제 버튼 한 번으로 확인창 없이 저장소에서 삭제한다", async () => {
  const { client, pushClient } = setup();
  await client.save(savedInput("예시 회사"));
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => Date.parse("2026-10-06T06:00Z")}
    />,
  );
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

it("공지함에서 공고를 열면 저장하지 않고 저장 버튼으로만 저장한다", async () => {
  const { client, pushClient, inbox } = setup();
  inbox.push(inboxPosting("열기 회사"));
  const track = vi.fn();
  render(
    <JobPostings
      client={client}
      pushClient={pushClient}
      now={() => NOW}
      track={track}
    />,
  );
  fireEvent.click(
    await screen.findByRole("link", { name: "열기 회사 공고 열기" }),
  );
  // The service runs writes in order, so this list sees any save the click began.
  expect((await client.list()).postings).toHaveLength(0);
  expect(screen.queryByText("공고를 마감 알림에 저장했습니다.")).toBeNull();
  expect(screen.queryByRole("button", { name: /저장 취소/ })).toBeNull();
  expect(track).not.toHaveBeenCalledWith(
    "posting_inbox_saved",
    expect.anything(),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "열기 회사 마감 알림 저장" }),
  );
  await screen.findByText("공고를 마감 알림에 저장했습니다.");
  const { postings } = await client.list();
  expect(postings).toHaveLength(1);
  expect(postings[0].reminders.map((r) => r.minutes)).toEqual([1440, 120]);
  expect(track).toHaveBeenCalledWith("posting_inbox_saved", {
    surface: "options",
    posting_id: "a".repeat(32),
    trigger: "button",
  });
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
