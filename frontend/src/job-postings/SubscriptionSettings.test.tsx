import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PushStateView } from "./push-messages";
import { SubscriptionSettings } from "./SubscriptionSettings";

const NOW = Date.parse("2026-10-26T03:00:00Z");
const base: PushStateView = {
  enabled: true,
  supported: true,
  status: { code: "registered", updatedAt: NOW, attempts: 0 },
  permission: "granted",
  visibility: { result: "seen", checkedAt: NOW, source: "test" },
  autoSave: true,
  unread: 0,
};
function renderSettings(state: PushStateView | null = base, failed = false) {
  const onEnabledChange = vi.fn(async () => {});
  const onAutoSaveChange = vi.fn(async () => {});
  const onTest = vi.fn(async () => {});
  const onAnswer = vi.fn(async () => {});
  const track = vi.fn();
  render(
    <SubscriptionSettings
      state={state ?? undefined}
      failed={failed}
      busy={false}
      onEnabledChange={onEnabledChange}
      onAutoSaveChange={onAutoSaveChange}
      onTest={onTest}
      onAnswer={onAnswer}
      track={track}
      userAgent="Mozilla/5.0 (Macintosh) Chrome/130"
    />,
  );
  return { onEnabledChange, onAutoSaveChange, onTest, track };
}

describe("SubscriptionSettings", () => {
  it("구독 스위치, 표시 확인 결과 행, 알림 테스트, 자동 저장 스위치를 보여 준다", async () => {
    const { onEnabledChange, onAutoSaveChange, onTest, track } =
      renderSettings();
    expect(
      screen.getByRole("heading", { name: "공고 알림 구독" }),
    ).toBeInTheDocument();
    const subscription = screen.getByRole("switch", {
      name: "새 공고를 Chrome 알림으로 받기",
    });
    expect(subscription).toBeChecked();
    expect(screen.getByText(/등록됨/)).toBeInTheDocument();
    expect(screen.getByText("알림 표시 확인됨 · 10/26")).toBeInTheDocument();
    fireEvent.click(subscription);
    await waitFor(() => expect(onEnabledChange).toHaveBeenCalledWith(false));
    expect(track).toHaveBeenCalledWith("push_subscription_disabled", {
      surface: "options",
    });
    const autoSave = screen.getByRole("switch", {
      name: "공고를 열면 마감 알림에 자동 저장",
    });
    expect(autoSave).toBeChecked();
    fireEvent.click(autoSave);
    await waitFor(() => expect(onAutoSaveChange).toHaveBeenCalledWith(false));
    fireEvent.click(screen.getByRole("button", { name: "알림 테스트" }));
    await waitFor(() => expect(onTest).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith("notification_test_sent", {
      surface: "options",
    });
  });
  it("배지·공지함, Chrome 종료, OS 알림 차단, 구독 주소 저장을 안내한다", () => {
    renderSettings();
    expect(
      screen.getByText(/아이콘 숫자와 공지함으로 새 공고를/),
    ).toBeInTheDocument();
    expect(screen.getByText(/완전히 종료된 동안에는/)).toBeInTheDocument();
    expect(screen.getByText(/OS 알림 설정/)).toBeInTheDocument();
    expect(screen.getByText(/구독 주소가 서버에 저장/)).toBeInTheDocument();
  });
  it("상태를 읽지 못하면 안내하고 스위치를 잠근다", () => {
    renderSettings(null, true);
    expect(
      screen.getByText("구독 상태를 불러오지 못했습니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "새 공고를 Chrome 알림으로 받기" }),
    ).toBeDisabled();
  });
  it("미지원 Chrome에서는 구독 스위치를 잠그고 안내한다", () => {
    renderSettings({ ...base, supported: false, status: null });
    expect(screen.getByText(/Chrome 121 이상/)).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "새 공고를 Chrome 알림으로 받기" }),
    ).toBeDisabled();
  });
});
