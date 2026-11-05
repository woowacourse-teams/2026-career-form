import { describe, expect, it } from "vitest";
import {
  NotificationCheck,
  parseVisibilityState,
  PUSH_VISIBILITY_KEY,
  TEST_NOTIFICATION_ID,
  type NotificationPermission,
} from "./notification-check";

const NOW = Date.parse("2026-10-26T03:00:00Z");
function harness(permission: NotificationPermission = "granted") {
  const store: Record<string, unknown> = {};
  const shown: {
    id: string;
    title: string;
    message: string;
    buttons: string[];
  }[] = [];
  const cleared: string[] = [];
  let now = NOW;
  const check = new NotificationCheck({
    storage: {
      get: async (key) => ({ [key]: store[key] }),
      set: async (items) => {
        Object.assign(store, items);
      },
    },
    now: () => now,
    notify: async (id, notification) => {
      shown.push({ id, ...notification });
    },
    clearNotification: async (id) => {
      cleared.push(id);
    },
    permission: async () => permission,
  });
  return {
    check,
    store,
    shown,
    cleared,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("NotificationCheck", () => {
  it("기록이 없거나 손상되면 미확인 상태다", async () => {
    const h = harness();
    expect(await h.check.state()).toEqual({ result: "unknown" });
    expect(parseVisibilityState("garbage")).toEqual({ result: "unknown" });
    expect(parseVisibilityState({ result: "maybe", checkedAt: 1 })).toEqual({
      result: "unknown",
    });
    expect(
      parseVisibilityState({
        result: "seen",
        checkedAt: 1,
        source: "test",
        shownAt: 2,
        askLaterAt: 3,
      }),
    ).toEqual({
      result: "seen",
      checkedAt: 1,
      source: "test",
      shownAt: 2,
      askLaterAt: 3,
    });
  });
  it("알림 테스트는 버튼 없는 테스트 알림 하나를 띄우고 상태를 바꾸지 않는다", async () => {
    const h = harness();
    await h.check.sendTest();
    expect(h.shown).toEqual([
      expect.objectContaining({
        id: TEST_NOTIFICATION_ID,
        title: expect.stringContaining("알림 테스트"),
        buttons: [],
      }),
    ]);
    expect(h.shown[0].message).toContain("보였어요");
    expect(await h.check.state()).toEqual({ result: "unknown" });
  });
  it("응답을 기록하면 결과, 시각, 출처가 남는다", async () => {
    const h = harness();
    expect(await h.check.record("not_seen", "test")).toEqual({
      result: "not_seen",
      checkedAt: NOW,
      source: "test",
    });
    h.advance(1000);
    expect(await h.check.record("seen", "card")).toEqual({
      result: "seen",
      checkedAt: NOW + 1000,
      source: "card",
    });
    expect(h.store[PUSH_VISIBILITY_KEY]).toEqual({
      result: "seen",
      checkedAt: NOW + 1000,
      source: "card",
    });
    expect(h.cleared).toEqual([TEST_NOTIFICATION_ID, TEST_NOTIFICATION_ID]);
  });
  it("첫 알림 표시 시각은 미확인 상태에서 한 번만 기록한다", async () => {
    const h = harness();
    expect(await h.check.markShown()).toEqual({
      result: "unknown",
      shownAt: NOW,
    });
    h.advance(5000);
    expect(await h.check.markShown()).toEqual({
      result: "unknown",
      shownAt: NOW,
    });
    await h.check.record("seen", "test");
    expect(await h.check.markShown()).toMatchObject({ result: "seen" });
    expect((await h.check.state()).shownAt).toBe(NOW);
  });
  it("공고 알림 클릭은 자동으로 보임으로 기록하고 표시 시각을 보존한다", async () => {
    const h = harness();
    await h.check.markShown();
    h.advance(60000);
    expect(await h.check.markSeenByClick()).toEqual({
      result: "seen",
      checkedAt: NOW + 60000,
      source: "notification_click",
      shownAt: NOW,
    });
  });
  it("나중에는 질문 시각만 남기고 결과는 바꾸지 않는다", async () => {
    const h = harness();
    expect(await h.check.askLater()).toEqual({
      result: "unknown",
      askLaterAt: NOW,
    });
  });
  it("알림 권한 수준을 그대로 전달한다", async () => {
    expect(await harness("denied").check.permission()).toBe("denied");
    expect(await harness("granted").check.permission()).toBe("granted");
  });
});
