import { describe, expect, it } from "vitest";
import {
  countUnread,
  createUnreadReader,
  parseUnread,
  PUSH_UNREAD_KEY,
  UnreadPostings,
} from "./unread-postings";

const NOW = Date.parse("2026-10-26T03:00:00Z");
const A = "a".repeat(32);
const B = "b".repeat(32);
function harness() {
  const store: Record<string, unknown> = {};
  const badges: number[] = [];
  let now = NOW;
  const unread = new UnreadPostings({
    storage: {
      get: async (key) => ({ [key]: store[key] }),
      set: async (items) => {
        Object.assign(store, items);
      },
    },
    now: () => now,
    setBadge: async (count) => {
      badges.push(count);
    },
  });
  return {
    unread,
    store,
    badges,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("UnreadPostings", () => {
  it("알림마다 미확인 목록에 넣고 배지 숫자를 늘린다", async () => {
    const h = harness();
    expect(await h.unread.add(A, NOW + 86400000)).toBe(1);
    expect(await h.unread.add(B, NOW + 2 * 86400000)).toBe(2);
    expect(await h.unread.add(A, NOW + 86400000)).toBe(2);
    expect(h.badges).toEqual([1, 2, 2]);
    expect(h.store[PUSH_UNREAD_KEY]).toEqual({
      [A]: NOW + 86400000,
      [B]: NOW + 2 * 86400000,
    });
    expect(await h.unread.count()).toBe(2);
  });
  it("알림 클릭으로 연 공고만 지우고 공지함 열람은 전부 지운다", async () => {
    const h = harness();
    await h.unread.add(A, NOW + 86400000);
    await h.unread.add(B, NOW + 86400000);
    expect(await h.unread.remove(A)).toBe(1);
    expect(await h.unread.remove("missing")).toBe(1);
    expect(await h.unread.clear()).toBe(0);
    expect(h.store[PUSH_UNREAD_KEY]).toEqual({});
    expect(h.badges.at(-1)).toBe(0);
  });
  it("다시 그릴 때 마감이 지난 공고를 정리하고 저장된 개수로 배지를 복원한다", async () => {
    const h = harness();
    await h.unread.add(A, NOW + 1000);
    await h.unread.add(B, NOW + 86400000);
    h.advance(2000);
    expect(await h.unread.redraw()).toBe(1);
    expect(h.store[PUSH_UNREAD_KEY]).toEqual({ [B]: NOW + 86400000 });
    expect(h.badges.at(-1)).toBe(1);
  });
  it("손상된 기록은 비운 것으로 본다", () => {
    expect(parseUnread("garbage")).toEqual({});
    expect(parseUnread({ "bad id!": 1, [A]: "x", [B]: 5 })).toEqual({ [B]: 5 });
    expect(countUnread({ [A]: NOW - 1, [B]: NOW + 1 }, NOW)).toBe(1);
  });
  it("사이드 패널용 reader는 로컬 저장소 변경에 따라 개수를 알린다", async () => {
    const listeners: ((
      changes: Record<string, unknown>,
      area: string,
    ) => void)[] = [];
    const reader = createUnreadReader({
      storage: {
        get: async (key) => ({ [key]: { [A]: NOW + 1, [B]: NOW - 1 } }),
      },
      onChanged: {
        addListener: (l) => {
          listeners.push(l);
        },
        removeListener: (l) => {
          listeners.splice(listeners.indexOf(l), 1);
        },
      },
      now: () => NOW,
    });
    expect(await reader.count()).toBe(1);
    const counts: number[] = [];
    const unsubscribe = reader.subscribe((count) => counts.push(count));
    listeners[0](
      { [PUSH_UNREAD_KEY]: { newValue: { [A]: NOW + 1, [B]: NOW + 2 } } },
      "local",
    );
    listeners[0]({ other: { newValue: 1 } }, "local");
    listeners[0]({ [PUSH_UNREAD_KEY]: { newValue: {} } }, "sync");
    listeners[0]({ [PUSH_UNREAD_KEY]: {} }, "local");
    expect(counts).toEqual([2, 0]);
    unsubscribe();
    expect(listeners).toHaveLength(0);
  });
});
