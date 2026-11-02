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
import { PushApiError, type ServerPosting } from "./push-api";
import type { PushClient } from "./push-client";
import type { PushStateView } from "./push-messages";

const NOW = Date.parse("2026-10-06T06:00Z");
const kst = (value: string) => Date.parse(`${value}+09:00`);
const seenState: PushStateView = {
  enabled: true,
  supported: true,
  status: { code: "registered", updatedAt: NOW, attempts: 0 },
  permission: "granted",
  visibility: { result: "seen", checkedAt: NOW, source: "test" },
  unread: 0,
};
function setup(
  options: {
    inbox?: () => Promise<ServerPosting[]>;
    pushState?: PushStateView;
  } = {},
) {
  let rows: Posting[] = [];
  let failure: Error | undefined;
  const service = new PostingService(
    {
      load: async () => rows,
      save: async (next) => {
        if (failure) throw failure;
        rows = next;
      },
    },
    {
      now: () => NOW,
      id: () => `id-${rows.length}`,
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
  const pushState = options.pushState ?? seenState;
  const pushClient = {
    state: vi.fn(async () => pushState),
    setEnabled: vi.fn(async (enabled: boolean) => ({ ...pushState, enabled })),
    test: vi.fn(async () => pushState),
    record: vi.fn(async () => pushState),
    later: vi.fn(async () => pushState),
    inbox: vi.fn(options.inbox ?? (async () => [...inbox])),
    subscribe: () => () => {},
  } satisfies PushClient;
  return {
    client,
    pushClient,
    inbox,
    failWith: (error?: Error) => {
      failure = error;
    },
  };
}
function inboxPosting(
  company = "공지 회사",
  extra: Partial<ServerPosting> = {},
): ServerPosting {
  return {
    id: "a".repeat(32),
    company,
    role: "데이터",
    link: "https://careers.example.test/jobs/notice",
    opensAt: NOW - 3600000,
    closesAt: NOW + 3 * 86400000,
    ...extra,
  };
}
const savedInput = (company: string, extra: { deadline?: number } = {}) => ({
  company,
  role: "개발",
  url: `https://example.test/jobs/${encodeURIComponent(company)}`,
  deadline: extra.deadline ?? Date.parse("2026-10-08T18:00Z"),
  timeZone: "Asia/Seoul",
  minutes: [],
});
const basePosting: Posting = {
  id: "future",
  version: 1,
  company: "다가올 회사",
  role: "개발",
  url: "https://example.com/jobs",
  deadline: NOW + 3600000,
  timeZone: "Asia/Seoul",
  status: "planned",
  updatedAt: NOW,
  reminders: [{ minutes: 30, at: NOW + 1800000, state: "pending" }],
};
function renderPage(
  env: ReturnType<typeof setup>,
  props: { track?: (...args: unknown[]) => void; now?: number } = {},
) {
  return render(
    <JobPostings
      client={env.client}
      pushClient={env.pushClient}
      now={() => props.now ?? NOW}
      track={props.track ?? (() => undefined)}
    />,
  );
}
const tab = (name: RegExp | string) => screen.getByRole("tab", { name });
const panel = () => screen.getByRole("tabpanel");

it.each([
  "SYNTHETIC_WRITE_FAILURE: quota exceeded",
  "SYNTHETIC_WRITE_FAILURE: 저장 장치 내부 오류",
])(
  "keeps unknown write details private and allows a save retry: %s",
  async (raw) => {
    const env = setup();
    env.inbox.push(inboxPosting());
    renderPage(env);
    const save = await screen.findByRole("button", { name: "공지 회사 저장" });
    env.failWith(new Error(raw));
    fireEvent.click(save);
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(raw);
    expect(
      within(alert).queryByRole("button", { name: "다시 시도" }),
    ).toBeNull();
    expect(screen.queryByText("공고를 마감 알림에 저장했습니다.")).toBeNull();
    env.failWith(undefined);
    fireEvent.click(screen.getByRole("button", { name: "공지 회사 저장" }));
    await screen.findByText("공고를 마감 알림에 저장했습니다.");
    expect((await env.client.list()).postings).toHaveLength(1);
  },
);

it.each([
  ["회사명을 입력해 주세요.", false],
  ["다른 화면에서 공고가 변경되었습니다. 목록을 새로 불러와 주세요.", true],
] as const)(
  "preserves domain guidance and its recovery action: %s",
  async (message, reload) => {
    const env = setup();
    env.inbox.push(inboxPosting());
    renderPage(env);
    const save = await screen.findByRole("button", { name: "공지 회사 저장" });
    env.failWith(new Error(message));
    fireEvent.click(save);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(
      within(alert).queryByRole("button", { name: "다시 시도" }) !== null,
    ).toBe(reload);
  },
);

it("recovers a failed list read with one short line and a retry", async () => {
  const env = setup();
  const list = vi
    .fn(env.client.list)
    .mockRejectedValueOnce(new Error("SYNTHETIC_LIST_FAILURE"));
  await act(async () => {
    render(
      <JobPostings
        client={{ ...env.client, list }}
        pushClient={env.pushClient}
        now={() => NOW}
        track={() => undefined}
      />,
    );
  });
  const alert = screen.getByRole("alert");
  expect(alert).not.toHaveTextContent("SYNTHETIC_LIST_FAILURE");
  expect(alert).toHaveTextContent("공고를 불러오지 못했어요");
  await act(async () => {
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
  });
  expect(list).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(within(panel()).getByText("저장한 공고 없음")).toBeInTheDocument();
});

it("returns deletion focus to the tab panel without suppressing scrolling", async () => {
  const env = setup();
  await env.client.save(savedInput("삭제 예시"));
  await act(async () => {
    renderPage(env);
  });
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  try {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "삭제 예시 삭제" }));
    });
    const target = panel();
    expect(target).toHaveFocus();
    const calls = focus.mock.calls.filter(
      (_, index) => focus.mock.contexts[index] === target,
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some(([options]) => options?.preventScroll)).toBe(false);
  } finally {
    focus.mockRestore();
  }
});

it("저장한 공고 행은 열기·지원 완료·삭제만 제공하고 입력 폼은 두지 않는다", async () => {
  const env = setup();
  await env.client.save(savedInput("저장 회사"));
  renderPage(env);
  const link = await screen.findByRole("link", { name: "저장 회사 열기" });
  expect(link).toHaveAttribute(
    "href",
    `https://example.test/jobs/${encodeURIComponent("저장 회사")}`,
  );
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.queryByRole("button", { name: /공고 추가/ })).toBeNull();
  expect(screen.queryByLabelText("회사명")).toBeNull();
  expect(screen.queryByRole("button", { name: /수정$/ })).toBeNull();
  const row = link.closest("tr") as HTMLElement;
  expect(
    within(row)
      .getAllByRole("button")
      .map((b) => b.textContent),
  ).toEqual(["지원 완료", "삭제"]);
  expect(
    within(row).getByRole("button", { name: "저장 회사 지원 완료" }),
  ).toBeInTheDocument();
  expect(
    within(row).getByRole("button", { name: "저장 회사 삭제" }),
  ).toBeInTheDocument();
  expect(row).toHaveTextContent("D-3");
  expect(row).toHaveTextContent("개발");
  expect(row).toHaveTextContent("10월 9일 3시");
});

it("목록이 비면 탭마다 짧은 이름만 보여 주고 설명 문장과 버튼을 두지 않는다", async () => {
  const env = setup();
  renderPage(env);
  await screen.findByText("저장한 공고 없음");
  expect(within(panel()).queryByRole("button")).toBeNull();
  const cases = [
    [/^새 공고/, "새 공고 없음"],
    [/^마감 지남/, "마감 지난 공고 없음"],
    [/^지원 완료/, "지원 완료 없음"],
    [/^지원 예정/, "저장한 공고 없음"],
  ] as const;
  for (const [name, label] of cases) {
    fireEvent.click(tab(name));
    await waitFor(() => expect(panel()).toHaveTextContent(label));
    expect(panel().textContent).toBe(label);
  }
});

it("설명 문장과 하단 안내를 페이지에 두지 않는다", async () => {
  const env = setup();
  env.inbox.push(inboxPosting());
  await env.client.save(savedInput("예시 회사"));
  renderPage(env);
  await screen.findByRole("link", { name: "공지 회사 열기" });
  for (const text of [
    "MY APPLICATIONS",
    /관심 있는 공고부터/,
    /이 브라우저에 저장됨/,
    /공고를 저장해 두면/,
    /팀이 등록한/,
    /알림과 로컬 저장 안내/,
    /알려드려요/,
    /공지함/,
    /알림 \d개 설정됨/,
    /마감 임박/,
  ]) {
    expect(screen.queryByText(text)).toBeNull();
  }
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "지원 공고",
  );
});

it("네 개의 탭에 개수를 보여 주고 새 공고가 있으면 새 공고 탭에서 시작한다", async () => {
  const env = setup();
  env.inbox.push(
    inboxPosting("나중 회사", {
      id: "b".repeat(32),
      link: "https://careers.example.test/jobs/late",
      closesAt: NOW + 5 * 86400000,
    }),
    inboxPosting("먼저 회사"),
  );
  const rows: Posting[] = [
    basePosting,
    { ...basePosting, id: "past", company: "지난 회사", deadline: NOW - 1 },
    {
      ...basePosting,
      id: "done",
      company: "완료 회사",
      status: "completed",
    },
  ];
  render(
    <JobPostings
      client={{
        ...env.client,
        list: async () => ({ postings: rows, problems: [] }),
      }}
      pushClient={env.pushClient}
      now={() => NOW}
      track={() => undefined}
    />,
  );
  await screen.findByRole("tab", { name: "새 공고 2" });
  expect(
    screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\s+/g, " ")),
  ).toEqual(["새 공고 2", "지원 예정 1", "마감 지남 1", "지원 완료 1"]);
  await waitFor(() =>
    expect(tab("새 공고 2")).toHaveAttribute("aria-selected", "true"),
  );
  expect(panel()).toHaveAttribute("aria-labelledby", tab("새 공고 2").id);
  expect(
    within(panel())
      .getAllByRole("link")
      .map((l) => l.textContent),
  ).toEqual(["먼저 회사 열기 ↗", "나중 회사 열기 ↗"]);
  expect(screen.getByText("마감순")).toBeInTheDocument();
});

it("새 공고가 없으면 지원 예정 탭에서 시작하고 방향키로 탭을 옮긴다", async () => {
  const env = setup();
  await env.client.save(savedInput("예정 회사"));
  renderPage(env);
  await screen.findByRole("link", { name: "예정 회사 열기" });
  const planned = tab("지원 예정 1");
  expect(planned).toHaveAttribute("aria-selected", "true");
  expect(planned).toHaveAttribute("tabindex", "0");
  expect(tab("새 공고 0")).toHaveAttribute("tabindex", "-1");
  planned.focus();
  fireEvent.keyDown(planned, { key: "ArrowRight" });
  expect(tab(/^마감 지남/)).toHaveAttribute("aria-selected", "true");
  expect(tab(/^마감 지남/)).toHaveFocus();
  fireEvent.keyDown(tab(/^마감 지남/), { key: "End" });
  expect(tab(/^지원 완료/)).toHaveFocus();
  fireEvent.keyDown(tab(/^지원 완료/), { key: "ArrowRight" });
  expect(tab(/^새 공고/)).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(tab(/^새 공고/), { key: "ArrowLeft" });
  expect(tab(/^지원 완료/)).toHaveFocus();
  fireEvent.keyDown(tab(/^지원 완료/), { key: "Home" });
  expect(tab(/^새 공고/)).toHaveFocus();
  expect(panel()).toHaveTextContent("새 공고 없음");
});

it("3일 내 마감은 저장한 진행 중 공고 중 D-3까지만 센다", async () => {
  const env = setup();
  // NOW is 10월 6일 15시 KST: 10월 9일 23시는 D-3, 10월 10일 0시 30분은 D-4.
  await env.client.save(
    savedInput("세번째 날 회사", { deadline: kst("2026-10-09T23:00:00") }),
  );
  await env.client.save(
    savedInput("네번째 날 회사", { deadline: kst("2026-10-10T00:30:00") }),
  );
  renderPage(env);
  const d3 = (
    await screen.findByRole("link", { name: "세번째 날 회사 열기" })
  ).closest("tr") as HTMLElement;
  const d4 = screen
    .getByRole("link", { name: "네번째 날 회사 열기" })
    .closest("tr") as HTMLElement;
  expect(screen.getByText("3일 내 마감 1")).toBeInTheDocument();
  expect(within(d3).getByText("D-3")).toHaveAttribute("data-urgent", "true");
  expect(within(d4).getByText("D-4")).toHaveAttribute("data-urgent", "false");
  expect(d3).toHaveTextContent("10월 9일 23시");
  expect(d4).toHaveTextContent("10월 10일 0시 30분");
});

it("D-4 이후 공고만 있으면 3일 내 마감 표시를 두지 않고 오늘 마감은 D-0이다", async () => {
  const env = setup();
  await env.client.save(
    savedInput("네번째 날 회사", { deadline: kst("2026-10-10T00:30:00") }),
  );
  const view = renderPage(env);
  await screen.findByRole("link", { name: "네번째 날 회사 열기" });
  expect(screen.queryByText(/3일 내 마감/)).toBeNull();
  view.unmount();
  await env.client.save(
    savedInput("오늘 회사", { deadline: kst("2026-10-06T23:00:00") }),
  );
  renderPage(env);
  const today = (
    await screen.findByRole("link", { name: "오늘 회사 열기" })
  ).closest("tr") as HTMLElement;
  expect(within(today).getByText("D-0")).toHaveAttribute("data-urgent", "true");
  expect(screen.getByText("3일 내 마감 1")).toBeInTheDocument();
});

it("탭마다 맞는 동작을 둔다: 새 공고 저장, 지원 예정·마감 지남 지원 완료, 지원 완료 되돌리기", async () => {
  const env = setup();
  env.inbox.push(inboxPosting());
  const rows: Posting[] = [
    basePosting,
    { ...basePosting, id: "past", company: "지난 회사", deadline: NOW - 1 },
    { ...basePosting, id: "done", company: "완료 회사", status: "completed" },
  ];
  render(
    <JobPostings
      client={{
        ...env.client,
        list: async () => ({ postings: rows, problems: [] }),
      }}
      pushClient={env.pushClient}
      now={() => NOW}
      track={() => undefined}
    />,
  );
  const rowButtons = () =>
    within(panel())
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
  await screen.findByRole("button", { name: "공지 회사 저장" });
  expect(rowButtons()).toEqual(["공지 회사 저장"]);
  fireEvent.click(tab(/^지원 예정/));
  expect(rowButtons()).toEqual(["다가올 회사 지원 완료", "다가올 회사 삭제"]);
  fireEvent.click(tab(/^마감 지남/));
  expect(rowButtons()).toEqual(["지난 회사 지원 완료", "지난 회사 삭제"]);
  expect(
    within(panel()).getAllByRole("row")[1].querySelector("td")?.textContent,
  ).toBe("마감");
  fireEvent.click(tab(/^지원 완료/));
  expect(rowButtons()).toEqual(["완료 회사 되돌리기", "완료 회사 삭제"]);
  expect(
    within(panel()).getByRole("button", { name: "완료 회사 되돌리기" }),
  ).toHaveTextContent(/^되돌리기$/);
});

it("저장한 공고를 지원 완료로 옮기고 되돌린다", async () => {
  const env = setup();
  await env.client.save(savedInput("예시 회사"));
  renderPage(env);
  fireEvent.click(
    await screen.findByRole("button", { name: "예시 회사 지원 완료" }),
  );
  await screen.findByRole("tab", { name: "지원 완료 1" });
  expect(tab("지원 예정 0")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "예시 회사 열기" })).toBeNull();
  fireEvent.click(tab("지원 완료 1"));
  fireEvent.click(screen.getByRole("button", { name: "예시 회사 되돌리기" }));
  await screen.findByRole("tab", { name: "지원 예정 1" });
  fireEvent.click(tab("지원 예정 1"));
  expect(
    screen.getByRole("link", { name: "예시 회사 열기" }),
  ).toBeInTheDocument();
});

it("마감 지난 공고는 늦은 알림 기록 문장 없이 마감 지남 탭에 둔다", async () => {
  const env = setup();
  await env.client.save({
    company: "늦은 알림 예시",
    role: "개발",
    url: "https://example.com",
    deadline: Date.parse("2026-10-06T18:00Z"),
    timeZone: "Asia/Seoul",
    minutes: [120],
  });
  const snapshot = await env.client.list();
  snapshot.postings[0].reminders[0] = {
    ...snapshot.postings[0].reminders[0],
    state: "sent",
    deliveredAt: Date.parse("2026-10-06T17:00Z"),
  };
  render(
    <JobPostings
      client={{ ...env.client, list: async () => snapshot }}
      pushClient={env.pushClient}
      now={() => Date.parse("2026-10-06T19:00Z")}
      track={() => undefined}
    />,
  );
  fireEvent.click(await screen.findByRole("tab", { name: "마감 지남 1" }));
  expect(
    within(panel()).getByRole("link", { name: "늦은 알림 예시 열기" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/놓친 알림/)).toBeNull();
  expect(screen.queryByText(/마감이 지나도/)).toBeNull();
  expect(screen.getByText("최근 마감순")).toBeInTheDocument();
});

it("삭제 버튼 한 번으로 확인창 없이 저장소에서 삭제한다", async () => {
  const env = setup();
  await env.client.save(savedInput("예시 회사"));
  renderPage(env);
  fireEvent.click(
    await screen.findByRole("button", { name: "예시 회사 삭제" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  await screen.findByText("공고를 삭제했습니다.");
  expect((await env.client.list()).postings).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "알림 닫기" }));
  expect(screen.queryByText("공고를 삭제했습니다.")).toBeNull();
});

it("새 공고를 저장하면 그 탭에 저장됨으로 남고 지원 예정 개수가 늘어난다", async () => {
  const env = setup();
  env.inbox.push(inboxPosting());
  const track = vi.fn();
  renderPage(env, { track });
  fireEvent.click(
    await screen.findByRole("button", { name: "공지 회사 저장" }),
  );
  await screen.findByText("공고를 마감 알림에 저장했습니다.");
  expect(tab("새 공고 1")).toHaveAttribute("aria-selected", "true");
  expect(tab("지원 예정 1")).toBeInTheDocument();
  const row = within(panel())
    .getByRole("link", { name: "공지 회사 열기" })
    .closest("tr") as HTMLElement;
  expect(within(row).getByText("✓ 저장됨")).toBeInTheDocument();
  expect(within(row).queryByRole("button")).toBeNull();
  const { postings } = await env.client.list();
  expect(postings[0]).toMatchObject({
    company: "공지 회사",
    url: "https://careers.example.test/jobs/notice",
    deadline: NOW + 3 * 86400000,
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

it("이미 저장한 링크의 새 공고는 처음부터 저장됨으로 보여 준다", async () => {
  const env = setup();
  env.inbox.push(inboxPosting());
  await env.client.save({
    ...savedInput("공지 회사"),
    url: "https://careers.example.test/jobs/notice",
  });
  renderPage(env);
  const link = await screen.findByRole("link", { name: "공지 회사 열기" });
  await waitFor(() => expect(link.closest("tr")).toHaveTextContent("✓ 저장됨"));
  expect(screen.queryByRole("button", { name: "공지 회사 저장" })).toBeNull();
});

it("남은 알림이 없는 새 공고를 저장하면 기존 안내를 보여 준다", async () => {
  const env = setup();
  env.inbox.push(inboxPosting("임박 회사", { closesAt: NOW + 3600000 }));
  renderPage(env);
  fireEvent.click(
    await screen.findByRole("button", { name: "임박 회사 저장" }),
  );
  await screen.findByText(/예약할 미래 알림이 없습니다/);
  expect((await env.client.list()).postings).toHaveLength(1);
});

it("새 공고를 열면 저장하지 않고 열람 이벤트는 한 번만 보낸다", async () => {
  const env = setup();
  env.inbox.push(inboxPosting("열기 회사"));
  const track = vi.fn();
  renderPage(env, { track });
  const link = await screen.findByRole("link", { name: "열기 회사 열기" });
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  fireEvent.click(link);
  expect((await env.client.list()).postings).toHaveLength(0);
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith("posting_inbox_viewed", {
    surface: "options",
  });
});

it("알림 서버가 없으면 새 공고 탭에 짧은 이름만 보여 주고 다시 시도를 두지 않는다", async () => {
  const env = setup({
    inbox: async () => {
      throw new PushApiError("NOT_CONFIGURED");
    },
  });
  renderPage(env);
  await screen.findByText("저장한 공고 없음");
  fireEvent.click(tab("새 공고"));
  expect(panel()).toHaveTextContent("알림 서버 없음");
  expect(within(panel()).queryByRole("button")).toBeNull();
  expect(env.pushClient.inbox).toHaveBeenCalledTimes(1);
});

it.each([
  ["ENDPOINT_UNAVAILABLE", "서버 미지원"],
  ["NETWORK", "새 공고를 불러오지 못했어요"],
] as const)(
  "%s 오류는 한 줄과 다시 시도를 보여 준다",
  async (code, message) => {
    let failed = false;
    const track = vi.fn();
    const env = setup({
      inbox: async () => {
        if (!failed) {
          failed = true;
          throw new PushApiError(code);
        }
        return [inboxPosting()];
      },
    });
    renderPage(env, { track });
    await screen.findByText("저장한 공고 없음");
    fireEvent.click(tab("새 공고"));
    expect(panel()).toHaveTextContent(message);
    expect(track).not.toHaveBeenCalled();
    fireEvent.click(within(panel()).getByRole("button", { name: "다시 시도" }));
    await screen.findByRole("link", { name: "공지 회사 열기" });
    expect(screen.queryByText(message)).toBeNull();
    expect(track).toHaveBeenCalledWith("posting_inbox_viewed", {
      surface: "options",
    });
  },
);

it("제목 줄의 새 공고 알림 스위치로 구독을 켜고 끈다", async () => {
  const env = setup();
  const track = vi.fn();
  renderPage(env, { track });
  const header = screen
    .getByRole("heading", { level: 1 })
    .closest("header") as HTMLElement;
  const toggle = within(header).getByRole("switch", { name: "새 공고 알림" });
  await waitFor(() => expect(toggle).toBeChecked());
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(env.pushClient.setEnabled).toHaveBeenCalledWith(false),
  );
  expect(track).toHaveBeenCalledWith("push_subscription_disabled", {
    surface: "options",
  });
  await waitFor(() => expect(toggle).not.toBeChecked());
  expect(screen.getAllByRole("switch")).toEqual([toggle]);
});

it("알림 설정은 테스트, 표시 확인, 안내 항목을 담은 대화상자를 열고 Escape로 닫는다", async () => {
  const env = setup();
  const track = vi.fn();
  renderPage(env, { track });
  const header = screen
    .getByRole("heading", { level: 1 })
    .closest("header") as HTMLElement;
  const open = within(header).getByRole("button", {
    name: "알림 설정",
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(open);
  const dialog = screen.getByRole("dialog", { name: "알림 설정" });
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  await within(dialog).findByText(/알림 표시 확인됨/);
  expect(within(dialog).getByText("등록됨")).toBeInTheDocument();
  expect(within(dialog).getByText("Chrome 종료 중")).toBeInTheDocument();
  expect(
    within(dialog).getByText(
      "이 브라우저에만 저장 (암호화 안 됨, 서버 동기화 없음)",
    ),
  ).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "알림 테스트" }));
  await waitFor(() => expect(env.pushClient.test).toHaveBeenCalledTimes(1));
  expect(track).toHaveBeenCalledWith("notification_test_sent", {
    surface: "options",
  });
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(open).toHaveFocus();
});

it("표시 확인이 미확인이면 질문 카드를, 나중에를 누르면 later를 부른다", async () => {
  const env = setup({
    pushState: { ...seenState, visibility: { result: "unknown" } },
  });
  renderPage(env);
  await screen.findByText("알림이 잘 보이는지 확인해 볼까요?");
  fireEvent.click(screen.getByRole("button", { name: "나중에" }));
  await waitFor(() => expect(env.pushClient.later).toHaveBeenCalledTimes(1));
});

it("첫 알림 뒤 미확인이면 확인 카드를 보여 준다", async () => {
  const env = setup({
    pushState: {
      ...seenState,
      visibility: { result: "unknown", shownAt: NOW - 1000 },
    },
  });
  renderPage(env);
  await screen.findByText("조금 전 공고 알림을 보냈어요. 보셨나요?");
});

it("직무 없이 저장한 공고는 직무 칸을 비운다", async () => {
  const env = setup();
  await env.client.save({ ...savedInput("직무 없는 회사"), role: "" });
  renderPage(env);
  const row = (
    await screen.findByRole("link", { name: "직무 없는 회사 열기" })
  ).closest("tr") as HTMLElement;
  expect(row.querySelectorAll("td")[2].textContent).toBe("");
});
