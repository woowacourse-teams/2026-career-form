// CF-453: planned postings past their deadline leave storage and the page.
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
import {
  NOW,
  basePosting,
  inboxPosting,
  panel,
  renderPage,
  savedInput,
  setup,
  tab,
} from "./JobPostings.test-fixtures";
import type { Posting } from "./model";
import { EXPIRED_REVERT_MESSAGE, type PostingSnapshot } from "./service";

// A snapshot the page may still hold after the deadline, with a late reminder.
async function lateReminderSnapshot(
  env: ReturnType<typeof setup>,
  status: Posting["status"],
): Promise<PostingSnapshot> {
  await env.client.save({
    company: "늦은 알림 예시",
    role: "개발",
    url: "https://example.com",
    deadline: Date.parse("2026-10-06T18:00Z"),
    timeZone: "Asia/Seoul",
    minutes: [120],
  });
  const snapshot = await env.client.list();
  const [posting] = snapshot.postings;
  posting.status = status;
  posting.reminders[0] = {
    ...posting.reminders[0],
    state: "sent",
    deliveredAt: Date.parse("2026-10-06T17:00Z"),
  };
  return snapshot;
}
function renderAfterDeadline(
  env: ReturnType<typeof setup>,
  snapshot: PostingSnapshot,
) {
  render(
    <JobPostings
      client={{ ...env.client, list: async () => snapshot }}
      pushClient={env.pushClient}
      now={() => Date.parse("2026-10-06T19:00Z")}
      track={() => undefined}
    />,
  );
}

it("마감 지난 지원 예정 공고는 어느 탭에도 두지 않고 마감 지남 탭과 최근 마감순 표시도 없다", async () => {
  const env = setup();
  renderAfterDeadline(env, await lateReminderSnapshot(env, "planned"));
  await screen.findByRole("tab", { name: "지원 예정 0" });
  expect(screen.queryByRole("tab", { name: /마감 지남/ })).toBeNull();
  for (const name of [/^새 공고/, /^지원 예정/, /^지원 완료/]) {
    fireEvent.click(tab(name));
    expect(tab(name)).toHaveAttribute("aria-selected", "true");
    expect(
      within(panel()).queryByRole("link", { name: "늦은 알림 예시 열기" }),
    ).toBeNull();
  }
  expect(screen.queryByText("최근 마감순")).toBeNull();
});

it("지원 완료 공고는 마감이 지나도 늦은 알림 기록 문장 없이 지원 완료 탭에 마감으로 남는다", async () => {
  const env = setup();
  renderAfterDeadline(env, await lateReminderSnapshot(env, "completed"));
  fireEvent.click(await screen.findByRole("tab", { name: "지원 완료 1" }));
  const row = within(panel())
    .getByRole("link", { name: "늦은 알림 예시 열기" })
    .closest("tr") as HTMLElement;
  expect(within(row).getByText("마감")).toHaveAttribute("data-urgent", "false");
  expect(within(row).queryByRole("button", { name: /되돌리기/ })).toBeNull();
  expect(
    within(row).getByRole("button", { name: "늦은 알림 예시 삭제" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/놓친 알림/)).toBeNull();
  expect(screen.queryByText(/마감이 지나도/)).toBeNull();
});

// Fakes only the page's 30-second clock tick. Testing Library still waits on
// DOM mutations and real timeouts.
async function withClockTicks(run: () => Promise<void>) {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    await run();
  } finally {
    vi.useRealTimers();
  }
}
const tick = () =>
  act(() => {
    vi.advanceTimersByTime(30000);
  });
const postingLinks = () =>
  within(panel())
    .queryAllByRole("link")
    .map((l) => l.textContent);

it("화면을 열면 마감 지난 지원 예정 공고만 저장소에서 지우고 마감 지난 지원 완료 공고는 남긴다", async () => {
  const env = setup();
  const stale = (company: string, extra: Partial<Posting> = {}): Posting => ({
    ...basePosting,
    id: company === "옛 회사" ? "old" : "older",
    company,
    url: `https://example.com/jobs/${company === "옛 회사" ? "old" : "older"}`,
    deadline: NOW - 3600000,
    reminders: [{ minutes: 30, at: NOW - 5400000, state: "skipped" }],
    ...extra,
  });
  env.seed([
    stale("옛 회사"),
    stale("더 옛 회사", {
      reminders: [
        {
          minutes: 30,
          at: NOW - 5400000,
          state: "sent",
          deliveredAt: NOW - 5400000,
        },
      ],
    }),
    {
      ...basePosting,
      id: "done",
      company: "완료 회사",
      deadline: NOW - 3600000,
      status: "completed",
      reminders: [],
    },
    basePosting,
  ]);
  renderPage(env);
  await screen.findByRole("tab", { name: "지원 예정 1" });
  expect(tab("지원 완료 1")).toBeInTheDocument();
  expect(env.stored().map((p) => p.company)).toEqual([
    "완료 회사",
    "다가올 회사",
  ]);
  expect(env.writes()).toBe(1);
});

it("지울 공고가 없으면 화면을 열어도 저장소에 쓰지 않고, 있으면 한 번만 지운 뒤 다시 읽기를 멈춘다", async () => {
  for (const [rows, writes] of [
    [[basePosting], 0],
    [[basePosting, { ...basePosting, id: "past", deadline: NOW - 1 }], 1],
  ] as const) {
    const env = setup({ live: true });
    env.seed([...rows]);
    const list = vi.fn(env.client.list);
    const view = render(
      <JobPostings
        client={{ ...env.client, list }}
        pushClient={env.pushClient}
        now={env.now}
        track={() => undefined}
      />,
    );
    await screen.findByRole("tab", { name: "지원 예정 1" });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(writes + 1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(list).toHaveBeenCalledTimes(writes + 1);
    expect(env.writes()).toBe(writes);
    view.unmount();
  }
});

it("지원 예정 공고는 마감 시각이 지나면 다음 시각 갱신 때 모든 탭과 3일 내 마감 개수에서 빠진다", async () => {
  const env = setup();
  await env.client.save(savedInput("곧 마감 회사", { deadline: NOW + 10000 }));
  await withClockTicks(async () => {
    renderPage(env);
    await screen.findByRole("link", { name: "곧 마감 회사 열기" });
    expect(screen.getByText("3일 내 마감 1")).toBeInTheDocument();
    env.setNow(NOW + 30000);
    tick();
    expect(tab("지원 예정 0")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText(/3일 내 마감/)).toBeNull();
    // Every rendered tab, so a row moved to another tab would still fail.
    for (const each of screen.getAllByRole("tab")) {
      fireEvent.click(each);
      expect(each).toHaveAttribute("aria-selected", "true");
      expect(
        within(panel()).queryByRole("link", { name: "곧 마감 회사 열기" }),
      ).toBeNull();
    }
  });
});

it("화면을 열어 둔 채 마감이 지난 새 공고 행은 다음 시각 갱신 때 사라지고 탭 개수도 줄어든다", async () => {
  const env = setup();
  env.inbox.push(
    inboxPosting("곧 마감 회사", { closesAt: NOW + 10000 }),
    inboxPosting("나중 회사", {
      id: "b".repeat(32),
      link: "https://careers.example.test/jobs/late",
    }),
  );
  await withClockTicks(async () => {
    renderPage(env);
    await screen.findByRole("tab", { name: "새 공고 2" });
    const closing = screen
      .getByRole("link", { name: "곧 마감 회사 열기" })
      .closest("tr") as HTMLElement;
    expect(closing).toHaveTextContent("D-0");
    env.setNow(NOW + 30000);
    tick();
    expect(tab("새 공고 1")).toHaveAttribute("aria-selected", "true");
    expect(postingLinks()).toEqual(["나중 회사 열기 ↗"]);
  });
});

it("다른 탭에 갔다 돌아오면 그사이 마감된 새 공고 행을 바로 숨긴다", async () => {
  const env = setup();
  env.inbox.push(inboxPosting("곧 마감 회사", { closesAt: NOW + 10000 }));
  renderPage(env);
  await screen.findByRole("tab", { name: "새 공고 1" });
  env.setNow(NOW + 60000);
  fireEvent(document, new Event("visibilitychange"));
  await screen.findByRole("tab", { name: "새 공고 0" });
  expect(panel()).toHaveTextContent("새 공고 없음");
});

it("새 공고가 모두 마감됐으면 처음부터 지원 예정 탭에서 시작한다", async () => {
  const env = setup();
  env.inbox.push(inboxPosting("방금 마감 회사", { closesAt: NOW }));
  await env.client.save(savedInput("예정 회사"));
  renderPage(env);
  await screen.findByRole("tab", { name: "새 공고 0" });
  expect(tab("지원 예정 1")).toHaveAttribute("aria-selected", "true");
});

it("탭을 고르지 않은 채 새 공고가 시각 갱신으로 모두 마감돼도 선택한 탭을 옮기지 않는다", async () => {
  const env = setup();
  env.inbox.push(inboxPosting("곧 마감 회사", { closesAt: NOW + 10000 }));
  await env.client.save(savedInput("예정 회사"));
  await withClockTicks(async () => {
    renderPage(env);
    await screen.findByRole("link", { name: "곧 마감 회사 열기" });
    expect(tab("새 공고 1")).toHaveAttribute("aria-selected", "true");
    env.setNow(NOW + 30000);
    tick();
    expect(tab("새 공고 0")).toHaveAttribute("aria-selected", "true");
    expect(panel()).toHaveTextContent("새 공고 없음");
  });
});

it("백그라운드 점검이 마감 지난 저장 공고를 지우면 열린 화면이 다시 읽고 새 공고 행도 저장 버튼으로 돌아가지 않는다", async () => {
  const env = setup({ live: true });
  const notice = inboxPosting("공지 회사", { closesAt: NOW + 10000 });
  env.inbox.push(notice);
  await env.client.save({
    company: notice.company,
    role: notice.role ?? "",
    url: notice.link,
    deadline: notice.closesAt,
    timeZone: "Asia/Seoul",
    minutes: [],
  });
  renderPage(env);
  await screen.findByText("✓ 저장됨");
  expect(tab("지원 예정 1")).toBeInTheDocument();
  env.setNow(NOW + 10000);
  // The deadline alarm runs the background check while the page stays open.
  await act(async () => {
    await env.client.retry();
  });
  await screen.findByRole("tab", { name: "지원 예정 0" });
  expect(tab("새 공고 0")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "공지 회사 저장" })).toBeNull();
  expect(env.stored()).toEqual([]);
});

it("마감 직후 시각 갱신 전에 새 공고 저장을 눌러도 저장하지 않고 행을 숨긴다", async () => {
  const env = setup();
  env.inbox.push(inboxPosting("곧 마감 회사", { closesAt: NOW + 10000 }));
  renderPage(env);
  const save = await screen.findByRole("button", {
    name: "곧 마감 회사 저장",
  });
  env.setNow(NOW + 20000);
  fireEvent.click(save);
  await screen.findByRole("tab", { name: "새 공고 0" });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("공고를 마감 알림에 저장했습니다.")).toBeNull();
  expect(env.stored()).toEqual([]);
});

it("마감 직후 시각 갱신 전에 되돌리기를 누르면 되돌리지 않고 이유를 알린 뒤 버튼을 숨긴다", async () => {
  const env = setup();
  const saved = await env.client.save(
    savedInput("완료 회사", { deadline: NOW + 10000 }),
  );
  await env.client.setCompleted(saved.postings[0].id, 1, true);
  renderPage(env);
  fireEvent.click(await screen.findByRole("tab", { name: "지원 완료 1" }));
  const revert = screen.getByRole("button", { name: "완료 회사 되돌리기" });
  env.setNow(NOW + 20000);
  fireEvent.click(revert);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    EXPIRED_REVERT_MESSAGE,
  );
  expect(
    screen.queryByRole("button", { name: "완료 회사 되돌리기" }),
  ).toBeNull();
  expect(tab("지원 완료 1")).toBeInTheDocument();
  expect(env.stored()).toMatchObject([{ status: "completed", version: 2 }]);
});
