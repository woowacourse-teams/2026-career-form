import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoticeBoard } from "./NoticeBoard";
import {
  PushApiError,
  type PushApiErrorCode,
  type ServerPosting,
} from "./push-api";
import type { PushClient } from "./push-client";
import type { PushStateView } from "./push-messages";

const NOW = Date.parse("2026-10-27T03:00:00Z");
const postingAt = (index: number, company: string): ServerPosting => ({
  id: String.fromCharCode(97 + index).repeat(32),
  company,
  role: "직무",
  link: `https://careers.example.test/jobs/${index}`,
  opensAt: NOW - 3600000,
  closesAt: NOW + (index + 1) * 86400000,
});
const early = postingAt(0, "먼저 마감 회사");
const late = postingAt(1, "나중 마감 회사");
const registered: PushStateView = {
  enabled: true,
  supported: true,
  status: { code: "registered", updatedAt: NOW, attempts: 0 },
  permission: "granted",
  visibility: { result: "seen", checkedAt: NOW, source: "test" },
  autoSave: true,
  unread: 0,
};
const unchecked: PushStateView = {
  ...registered,
  visibility: { result: "unknown" },
};
function fakeClient(
  inbox: () => Promise<ServerPosting[]> = async () => [late, early],
) {
  const client = {
    inbox: vi.fn(inbox),
  } as unknown as PushClient;
  return client;
}
function renderBoard(
  client: PushClient,
  options: {
    state?: PushStateView;
    savedUrls?: Set<string>;
    autoSavedUrls?: Set<string>;
  } = {},
) {
  const handlers = {
    onSave: vi.fn(),
    onOpen: vi.fn(),
    onUndo: vi.fn(),
    onTest: vi.fn(async () => {}),
    onAnswer: vi.fn(async () => {}),
    onLater: vi.fn(async () => {}),
  };
  const track = vi.fn();
  render(
    <NoticeBoard
      client={client}
      state={options.state ?? registered}
      savedUrls={options.savedUrls ?? new Set()}
      autoSavedUrls={options.autoSavedUrls ?? new Set()}
      busy={false}
      now={NOW}
      track={track}
      {...handlers}
    />,
  );
  return { ...handlers, track };
}

describe("NoticeBoard", () => {
  it("진행 중 공고를 마감순으로 보여 주고 저장한 공고를 구분한다", async () => {
    const { onSave, onOpen, track } = renderBoard(fakeClient(), {
      savedUrls: new Set([early.link]),
    });
    await screen.findByRole("heading", { name: "나중 마감 회사" });
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["먼저 마감 회사", "나중 마감 회사"]);
    expect(screen.getByText("✓ 저장됨")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "먼저 마감 회사 마감 알림 저장" }),
    ).toBeDisabled();
    const link = screen.getByRole("link", { name: "나중 마감 회사 공고 열기" });
    expect(link).toHaveAttribute("href", late.link);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith(late);
    fireEvent.click(
      screen.getByRole("button", { name: "나중 마감 회사 마감 알림 저장" }),
    );
    expect(onSave).toHaveBeenCalledWith(late);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("posting_inbox_viewed", {
      surface: "options",
    });
  });
  it("자동 저장 설정에 따라 카드 보조 문구가 바뀌고 열어서 저장한 카드는 취소를 보여 준다", async () => {
    const { onUndo } = renderBoard(fakeClient(), {
      savedUrls: new Set([early.link]),
      autoSavedUrls: new Set([early.link]),
    });
    await screen.findByRole("heading", { name: "나중 마감 회사" });
    expect(
      screen.getByText("공고를 열면 마감 알림에 저장돼요 (24시간·2시간 전)"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "먼저 마감 회사 저장 취소" }),
    );
    expect(onUndo).toHaveBeenCalledWith(early);
    expect(
      screen.queryByRole("button", { name: "나중 마감 회사 저장 취소" }),
    ).toBeNull();
  });
  it("자동 저장이 꺼져 있으면 기존 안내 문구를 보여 준다", async () => {
    renderBoard(fakeClient(), { state: { ...registered, autoSave: false } });
    await screen.findByRole("heading", { name: "나중 마감 회사" });
    expect(
      screen.getAllByText("저장하면 마감 24시간·2시간 전에 알려드려요"),
    ).toHaveLength(2);
  });
  it("처음 3건만 펼치고 더 보기로 나머지를 연다", async () => {
    const five = [0, 1, 2, 3, 4].map((i) => postingAt(i, `회사 ${i}`));
    renderBoard(fakeClient(async () => five));
    await screen.findByRole("heading", { name: "회사 0" });
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "2건 더 보기" }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
  });
  it("직무가 없는 공고는 직무 줄 없이 보여 준다", async () => {
    renderBoard(fakeClient(async () => [{ ...early, role: "" }, late]));
    const heading = await screen.findByRole("heading", {
      name: "먼저 마감 회사",
    });
    expect(heading.parentElement?.querySelector("p")).toBeNull();
    expect(
      screen
        .getByRole("heading", { name: "나중 마감 회사" })
        .parentElement?.querySelector("p")?.textContent,
    ).toBe("직무");
  });
  it("진행 중 공고가 없으면 빈 상태를 안내한다", async () => {
    renderBoard(fakeClient(async () => []));
    await screen.findByText("지금 진행 중인 공고가 없습니다.");
  });
  it.each([
    ["NOT_CONFIGURED", /알림 서버가 설정되지 않아/],
    ["ENDPOINT_UNAVAILABLE", /아직 공고 알림을 지원하지 않습니다/],
    ["NETWORK", /네트워크 상태를 확인/],
  ] as [PushApiErrorCode, RegExp][])(
    "%s 오류를 구분해 안내하고 다시 시도할 수 있다",
    async (code, message) => {
      let failed = false;
      const client = fakeClient(async () => {
        if (!failed) {
          failed = true;
          throw new PushApiError(code);
        }
        return [early];
      });
      const { track } = renderBoard(client);
      await screen.findByText(message);
      expect(track).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", { name: "공지함 다시 불러오기" }),
      );
      await screen.findByRole("heading", { name: "먼저 마감 회사" });
      expect(screen.queryByText(message)).not.toBeInTheDocument();
      expect(track).toHaveBeenCalledWith("posting_inbox_viewed", {
        surface: "options",
      });
    },
  );
  it("표시 확인이 미확인이고 구독이 켜져 있으면 질문 카드를, 첫 알림 뒤 미클릭이면 확인 카드를 보여 준다", async () => {
    const question = renderBoard(fakeClient(), { state: unchecked });
    expect(
      screen.getByText("알림이 잘 보이는지 확인해 볼까요?"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "나중에" }));
    expect(question.onLater).toHaveBeenCalledTimes(1);
    renderBoard(fakeClient(), {
      state: {
        ...unchecked,
        visibility: { result: "unknown", shownAt: NOW - 1000 },
      },
    });
    expect(
      screen.getByText("조금 전 공고 알림을 보냈어요. 보셨나요?"),
    ).toBeInTheDocument();
  });
  it("나중에를 누른 뒤와 구독이 꺼진 경우, 결과가 기록된 경우에는 카드를 보여 주지 않는다", async () => {
    renderBoard(fakeClient(), {
      state: {
        ...unchecked,
        visibility: { result: "unknown", askLaterAt: NOW },
      },
    });
    expect(screen.queryByText(/확인해 볼까요/)).toBeNull();
    renderBoard(fakeClient(), { state: { ...unchecked, enabled: false } });
    expect(screen.queryByText(/확인해 볼까요/)).toBeNull();
    renderBoard(fakeClient(), { state: registered });
    expect(screen.queryByText(/확인해 볼까요/)).toBeNull();
    expect(screen.queryByText(/보셨나요/)).toBeNull();
  });
});
