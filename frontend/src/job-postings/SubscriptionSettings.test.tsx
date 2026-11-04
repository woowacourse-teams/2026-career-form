import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PushStateView } from "./push-messages";
import {
  SubscriptionSettings,
  SubscriptionSwitch,
} from "./SubscriptionSettings";

const NOW = Date.parse("2026-10-26T03:00:00Z");
const base: PushStateView = {
  enabled: true,
  supported: true,
  status: { code: "registered", updatedAt: NOW, attempts: 0 },
  permission: "granted",
  visibility: { result: "seen", checkedAt: NOW, source: "test" },
  unread: 0,
  roles: [],
};
function renderSettings(state: PushStateView | null = base, failed = false) {
  const onEnabledChange = vi.fn(async () => {});
  const onTest = vi.fn(async () => {});
  const onAnswer = vi.fn(async () => {});
  const track = vi.fn();
  render(
    <SubscriptionSettings
      state={state ?? undefined}
      failed={failed}
      busy={false}
      onEnabledChange={onEnabledChange}
      onTest={onTest}
      onAnswer={onAnswer}
      track={track}
      userAgent="Mozilla/5.0 (Macintosh) Chrome/130"
    />,
  );
  return { onEnabledChange, onTest, track };
}
function renderSwitch(state: PushStateView | null = base) {
  const onEnabledChange = vi.fn(async () => {});
  const track = vi.fn();
  render(
    <SubscriptionSwitch
      state={state ?? undefined}
      busy={false}
      onEnabledChange={onEnabledChange}
      track={track}
    />,
  );
  return { onEnabledChange, track };
}

describe("SubscriptionSwitch", () => {
  it("새 공고 알림 스위치로 구독을 끄고 이벤트를 보낸다", async () => {
    const { onEnabledChange, track } = renderSwitch();
    const toggle = screen.getByRole("switch", { name: "새 공고 알림" });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(onEnabledChange).toHaveBeenCalledWith(false));
    expect(track).toHaveBeenCalledWith("push_subscription_disabled", {
      surface: "options",
    });
  });
  it("상태를 모르거나 미지원 Chrome이면 스위치를 잠근다", () => {
    renderSwitch(null);
    expect(screen.getByRole("switch", { name: "새 공고 알림" })).toBeDisabled();
  });
  it("미지원 Chrome이면 스위치를 잠근다", () => {
    renderSwitch({ ...base, supported: false, status: null });
    expect(screen.getByRole("switch", { name: "새 공고 알림" })).toBeDisabled();
  });
});

describe("SubscriptionSettings", () => {
  it("구독 상태, 표시 확인 결과, 알림 테스트를 짧은 항목으로 보여 준다", async () => {
    const { onTest, track } = renderSettings();
    expect(screen.getByText("구독")).toBeInTheDocument();
    expect(screen.getByText("등록됨")).toBeInTheDocument();
    expect(screen.getByText("확인됨, 10월 26일")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(/자동 저장/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "알림 테스트" }));
    await waitFor(() => expect(onTest).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith("notification_test_sent", {
      surface: "options",
    });
  });
  it("Chrome 종료, OS 알림, 로컬 저장, 서버 전송을 이름과 값으로 안내한다", () => {
    renderSettings();
    const facts = Object.fromEntries(
      Array.from(document.querySelectorAll("dt")).map((dt) => [
        dt.textContent,
        dt.nextElementSibling?.textContent,
      ]),
    );
    expect(facts).toMatchObject({
      "마감 알림": "마감 24시간·2시간 전",
      "Chrome 종료 중": "알림 없음",
      "OS 알림 꺼짐": "아이콘 숫자와 새 공고 탭으로 확인",
      "놓친 알림": "다시 실행하면 공고당 1개",
      "저장 위치": "이 브라우저에만 저장 (암호화 안 됨, 서버 동기화 없음)",
      "확장 삭제 시": "저장한 공고도 삭제",
      "서버 전송": "푸시 구독 주소만 (프로필·지원서 내용 없음)",
    });
  });
  it("상태를 읽지 못하면 짧게 알린다", () => {
    renderSettings(null, true);
    expect(
      screen.getByText("구독 상태를 불러오지 못했어요"),
    ).toBeInTheDocument();
  });
  it("미지원 Chrome은 필요한 버전을 보여 준다", () => {
    renderSettings({ ...base, supported: false, status: null });
    expect(screen.getByText("Chrome 121 이상 필요")).toBeInTheDocument();
  });
  it("등록에 실패하면 다시 등록할 수 있다", async () => {
    const { onEnabledChange } = renderSettings({
      ...base,
      status: { code: "failed", updatedAt: NOW, attempts: 1 },
    });
    expect(screen.getByText("등록 실패 (자동 재시도)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 등록" }));
    await waitFor(() => expect(onEnabledChange).toHaveBeenCalledWith(true));
  });
});
