import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoticeBoard } from "./NoticeBoard";
import { PushApiError, type PushApiErrorCode } from "./push-api";
import type { PushClient } from "./push-client";
import type { PushStateView } from "./push-messages";

const NOW = Date.parse("2026-10-27T03:00:00Z");
const early = {
  id: "a".repeat(32),
  company: "먼저 마감 회사",
  role: "백엔드",
  link: "https://careers.example.test/jobs/a",
  opensAt: NOW - 3600000,
  closesAt: NOW + 2 * 86400000,
};
const late = {
  id: "b".repeat(32),
  company: "나중 마감 회사",
  role: "프론트엔드",
  link: "https://careers.example.test/jobs/b",
  opensAt: NOW - 3600000,
  closesAt: NOW + 5 * 86400000,
};
const registered: PushStateView = {
  enabled: true,
  supported: true,
  status: { code: "registered", updatedAt: NOW, attempts: 0 },
};
function fakeClient(
  overrides: Partial<PushClient> & {
    state?: () => Promise<PushStateView>;
  } = {},
) {
  let current = registered;
  const client: PushClient = {
    state: async () => current,
    setEnabled: vi.fn(async (enabled: boolean) => {
      current = {
        ...current,
        enabled,
        status: {
          code: enabled ? "registered" : "disabled",
          updatedAt: NOW,
          attempts: 0,
        },
      };
      return current;
    }),
    inbox: vi.fn(async () => [late, early]),
    subscribe: () => () => {},
    ...overrides,
  };
  return client;
}
function renderBoard(client: PushClient, savedUrls = new Set<string>()) {
  const onSave = vi.fn();
  const track = vi.fn();
  render(
    <NoticeBoard
      client={client}
      savedUrls={savedUrls}
      busy={false}
      now={NOW}
      onSave={onSave}
      track={track}
    />,
  );
  return { onSave, track };
}

describe("NoticeBoard", () => {
  it("진행 중 공고를 마감순으로 보여 주고 저장한 공고를 구분한다", async () => {
    const client = fakeClient();
    const { onSave, track } = renderBoard(client, new Set([early.link]));
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
    fireEvent.click(
      screen.getByRole("button", { name: "나중 마감 회사 마감 알림 저장" }),
    );
    expect(onSave).toHaveBeenCalledWith(late);
    expect(screen.getByText("5일 남음")).toBeInTheDocument();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("posting_inbox_viewed", {
      surface: "options",
    });
  });
  it("진행 중 공고가 없으면 빈 상태를 안내한다", async () => {
    renderBoard(fakeClient({ inbox: async () => [] }));
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
      const client = fakeClient({
        inbox: async () => {
          if (!failed) {
            failed = true;
            throw new PushApiError(code);
          }
          return [early];
        },
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
  it("구독 스위치는 끄기와 켜기를 보내고 계측한다", async () => {
    const client = fakeClient();
    const { track } = renderBoard(client);
    const toggle = await screen.findByRole("switch", {
      name: "새 공고를 Chrome 알림으로 받기",
    });
    await screen.findByText(/등록됨/);
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await screen.findByText(/꺼짐/);
    expect(client.setEnabled).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("switch"));
    await screen.findByText(/등록됨/);
    expect(client.setEnabled).toHaveBeenLastCalledWith(true);
    expect(
      track.mock.calls.filter(([e]) => e !== "posting_inbox_viewed"),
    ).toEqual([
      ["push_subscription_disabled", { surface: "options" }],
      ["push_subscription_enabled", { surface: "options" }],
    ]);
  });
  it.each([
    [{ enabled: true, supported: false, status: null }, /Chrome 121 이상/],
    [
      {
        ...registered,
        status: { code: "not_configured", updatedAt: NOW, attempts: 0 },
      },
      /알림 서버가 설정되지 않았습니다/,
    ],
    [
      {
        ...registered,
        status: { code: "endpoint_unavailable", updatedAt: NOW, attempts: 0 },
      },
      /아직 공고 알림을 지원하지 않습니다/,
    ],
    [{ ...registered, status: null }, /확인 중/],
  ] as [PushStateView, RegExp][])(
    "구독 상태 %j를 문구로 안내한다",
    async (state, message) => {
      renderBoard(fakeClient({ state: async () => state }));
      await screen.findByText(message);
      if (!state.supported) expect(screen.getByRole("switch")).toBeDisabled();
    },
  );
  it("등록 실패 상태에서는 다시 등록할 수 있다", async () => {
    const client = fakeClient({
      state: async () => ({
        ...registered,
        status: {
          code: "failed",
          updatedAt: NOW,
          attempts: 2,
          error: "NETWORK",
        },
      }),
    });
    renderBoard(client);
    await screen.findByText(/등록 실패/);
    fireEvent.click(screen.getByRole("button", { name: "다시 등록" }));
    await waitFor(() => expect(client.setEnabled).toHaveBeenCalledWith(true));
  });
  it("Chrome 종료, OS 알림 차단, 구독 주소 저장을 안내한다", async () => {
    renderBoard(fakeClient());
    await screen.findByText(/등록됨/);
    expect(screen.getByText(/완전히 종료된 동안에는/)).toBeInTheDocument();
    expect(screen.getByText(/OS 알림 설정/)).toBeInTheDocument();
    expect(screen.getByText(/구독 주소가 서버에 저장/)).toBeInTheDocument();
  });
  it("구독 상태를 읽지 못하면 안내하고 공지함은 그대로 보여 준다", async () => {
    renderBoard(
      fakeClient({
        state: async () => {
          throw new PushApiError("NETWORK");
        },
      }),
    );
    await screen.findByText("구독 상태를 불러오지 못했습니다.");
    await screen.findByRole("heading", { name: "먼저 마감 회사" });
  });
});
