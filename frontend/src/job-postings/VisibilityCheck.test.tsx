import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PushStateView } from "./push-messages";
import { VisibilityCheck, visibilityText } from "./VisibilityCheck";

const NOW = Date.parse("2026-10-26T03:00:00Z");
const base: PushStateView = {
  enabled: true,
  supported: true,
  status: { code: "registered", updatedAt: NOW, attempts: 0 },
  permission: "granted",
  visibility: { result: "unknown" },
  autoSave: true,
  unread: 0,
};
function renderCheck(
  variant: "onboarding" | "question" | "confirm" | "settings",
  state: PushStateView = base,
  userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0.0.0",
) {
  const onTest = vi.fn(async () => {});
  const onAnswer = vi.fn(async () => {});
  const onLater = vi.fn(async () => {});
  const onDisable = vi.fn(async () => {});
  const track = vi.fn();
  render(
    <VisibilityCheck
      variant={variant}
      state={state}
      busy={false}
      onTest={onTest}
      onAnswer={onAnswer}
      onLater={onLater}
      onDisable={onDisable}
      track={track}
      surface={variant === "onboarding" ? "extension_onboarding" : "options"}
      userAgent={userAgent}
    />,
  );
  return { onTest, onAnswer, onLater, onDisable, track };
}

describe("VisibilityCheck", () => {
  it("알림 테스트 뒤 보였나요 질문에 답하면 결과를 기록하고 계측한다", async () => {
    const { onTest, onAnswer, track } = renderCheck("question");
    expect(
      screen.getByText("알림이 잘 보이는지 확인해 볼까요?"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "알림 테스트" }));
    await waitFor(() => expect(onTest).toHaveBeenCalledTimes(1));
    await screen.findByText("방금 알림이 보였나요?");
    fireEvent.click(screen.getByRole("button", { name: "보였어요" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith("seen", "test"));
    expect(track.mock.calls).toEqual([
      ["notification_test_sent", { surface: "options" }],
      [
        "notification_visibility_answered",
        { surface: "options", answer: "seen" },
      ],
    ]);
  });
  it("나중에는 질문을 닫고 확인 카드는 봤어요·못 봤어요를 카드 출처로 기록한다", async () => {
    const question = renderCheck("question");
    fireEvent.click(screen.getByRole("button", { name: "나중에" }));
    await waitFor(() => expect(question.onLater).toHaveBeenCalledTimes(1));
    const confirm = renderCheck("confirm", {
      ...base,
      visibility: { result: "unknown", shownAt: NOW - 60000 },
    });
    expect(
      screen.getByText("조금 전 공고 알림을 보냈어요. 보셨나요?"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "못 봤어요" }));
    await waitFor(() =>
      expect(confirm.onAnswer).toHaveBeenCalledWith("not_seen", "card"),
    );
    expect(confirm.track).toHaveBeenCalledWith(
      "notification_visibility_answered",
      { surface: "options", answer: "not_seen" },
    );
  });
  it("안 보였다고 응답했거나 권한이 denied면 OS별 설정 안내와 다시 테스트를 보여 준다", async () => {
    renderCheck("settings", {
      ...base,
      visibility: { result: "not_seen", checkedAt: NOW, source: "test" },
    });
    expect(
      screen.getByText(/시스템 설정 › 알림 › Google Chrome/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/설정 › 시스템 › 알림/)).not.toBeInTheDocument();
    expect(screen.getByText(/Chrome에서 이 확장의 알림/)).toBeInTheDocument();
    expect(screen.getByText(/아이콘의 숫자와 공지함/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "다시 테스트" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("보이지 않는다고 응답 · 설정 안내"),
    ).toBeInTheDocument();
  });
  it("Windows에서는 Windows 경로를, 알 수 없는 OS에서는 둘 다 안내한다", () => {
    const denied = { ...base, permission: "denied" as const };
    renderCheck("settings", denied, "Mozilla/5.0 (Windows NT 10.0) Chrome/130");
    expect(screen.getByText(/설정 › 시스템 › 알림/)).toBeInTheDocument();
    expect(screen.queryByText(/시스템 설정 › 알림 › Google Chrome/)).toBeNull();
    expect(screen.getByText(/알림 권한이 차단/)).toBeInTheDocument();
    renderCheck("settings", denied, "Mozilla/5.0 (X11; Linux) Chrome/130");
    expect(
      screen.getAllByText(/시스템 설정 › 알림 › Google Chrome/),
    ).toHaveLength(1);
    expect(screen.getAllByText(/설정 › 시스템 › 알림/)).toHaveLength(2);
  });
  it("온보딩 카드는 알림 끄기를 제공하고 끈 뒤에는 안내만 남긴다", async () => {
    const { onDisable } = renderCheck("onboarding");
    expect(screen.getByText("새 공고 알림이 켜져 있어요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "알림 끄기" }));
    await waitFor(() => expect(onDisable).toHaveBeenCalledTimes(1));
    renderCheck("onboarding", { ...base, enabled: false });
    expect(screen.getAllByText(/알림을 껐어요/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "알림 끄기" })).toBeNull();
  });
  it("결과 행 문구를 상태별로 만든다", () => {
    expect(visibilityText({ result: "unknown" })).toBe("아직 확인하지 않음");
    expect(
      visibilityText({ result: "seen", checkedAt: NOW, source: "test" }),
    ).toBe("알림 표시 확인됨 · 10/26");
    expect(
      visibilityText({ result: "not_seen", checkedAt: NOW, source: "card" }),
    ).toBe("보이지 않는다고 응답 · 설정 안내");
  });
  it("결과가 기록된 질문·확인 카드는 렌더링하지 않는다", () => {
    renderCheck("question", {
      ...base,
      visibility: { result: "seen", checkedAt: NOW, source: "test" },
    });
    expect(screen.queryByRole("button", { name: "알림 테스트" })).toBeNull();
    renderCheck("confirm", {
      ...base,
      visibility: {
        result: "seen",
        checkedAt: NOW,
        source: "card",
        shownAt: 1,
      },
    });
    expect(screen.queryByText(/보셨나요/)).toBeNull();
  });
});
