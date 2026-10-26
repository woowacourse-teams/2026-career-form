import { describe, expect, it } from "vitest";
import type { Posting } from "./model";
import {
  postingNotificationId,
  PUSH_AUTOSAVED_NOTIFICATION_PREFIX,
  PUSH_NOTIFIED_KEY,
  PUSH_SAVED_NOTIFICATION_PREFIX,
  PushReceiver,
  type PushNotification,
} from "./push-receiver";
import { PostingService } from "./service";

const NOW = Date.parse("2026-10-27T03:00:00Z");
const ID = "0123456789abcdef0123456789abcdef";
const payload = {
  id: ID,
  company: "합성 회사",
  role: "합성 직무",
  link: "https://careers.example.test/jobs/1",
  opensAt: "2026-10-27T00:00:00Z",
  closesAt: "2026-11-03T09:00:00Z",
};

function harness() {
  let now = NOW;
  const store: Record<string, unknown> = {};
  let rows: Posting[] = [];
  const shown: ({ id: string } & PushNotification)[] = [];
  const cleared: string[] = [];
  const opened: string[] = [];
  const tracked: [string, unknown][] = [];
  const unreadLog: string[] = [];
  const visibilityLog: string[] = [];
  let autoSave = true;
  const postings = new PostingService(
    {
      load: async () => rows,
      save: async (next) => {
        rows = next;
      },
    },
    {
      now: () => now,
      id: () => `job-${rows.length + 1}`,
      permission: async () => true,
      schedule: async () => {},
      notify: async () => {},
      clearNotification: async () => {},
    },
  );
  const receiver = new PushReceiver({
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
    openUrl: async (url) => {
      opened.push(url);
    },
    postings,
    track: (event, properties) => tracked.push([event, properties]),
    unread: {
      add: async (id, closesAt) => {
        unreadLog.push(`add:${id}:${closesAt}`);
      },
      remove: async (id) => {
        unreadLog.push(`remove:${id}`);
      },
    },
    visibility: {
      markShown: async () => {
        visibilityLog.push("shown");
      },
      markSeenByClick: async () => {
        visibilityLog.push("seen");
      },
    },
    autoSaveEnabled: async () => autoSave,
  });
  return {
    receiver,
    store,
    shown,
    cleared,
    opened,
    tracked,
    unreadLog,
    visibilityLog,
    rows: () => rows,
    setAutoSave: (value: boolean) => {
      autoSave = value;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("PushReceiver", () => {
  it("유효한 공고 푸시는 회사·직무·접수 기간·남은 시간을 담은 알림을 띄운다", async () => {
    const h = harness();
    expect(await h.receiver.receive(payload)).toBe("notified");
    expect(h.shown).toEqual([
      {
        id: postingNotificationId(ID),
        title: "합성 회사 · 합성 직무",
        message: "접수 10/27 09:00 ~ 11/3 18:00 (한국 시간)\n7일 6시간 남음",
        buttons: ["공고 열기", "마감 알림 저장"],
      },
    ]);
    expect(h.tracked).toEqual([
      [
        "posting_notification_shown",
        { surface: "notification", posting_id: ID },
      ],
    ]);
    expect(h.store[PUSH_NOTIFIED_KEY]).toEqual({
      [ID]: {
        id: ID,
        company: "합성 회사",
        role: "합성 직무",
        link: payload.link,
        opensAt: Date.parse(payload.opensAt),
        closesAt: Date.parse(payload.closesAt),
        notifiedAt: NOW,
      },
    });
  });
  it("직무 없는 공고는 회사명만 제목으로 쓴다", async () => {
    const h = harness();
    const { role: _role, ...withoutRole } = payload;
    expect(await h.receiver.receive(withoutRole)).toBe("notified");
    expect(h.shown[0].title).toBe("합성 회사");
    expect(await h.receiver.save(postingNotificationId(ID))).toBe("saved");
    expect(h.rows()[0]).toMatchObject({ company: "합성 회사", role: "" });
  });
  it("같은 공고 ID의 두 번째 푸시는 알림을 띄우지 않는다", async () => {
    const h = harness();
    await h.receiver.receive(payload);
    expect(await h.receiver.receive({ ...payload, role: "바뀐 직무" })).toBe(
      "duplicate",
    );
    expect(h.shown).toHaveLength(1);
    expect(h.tracked).toHaveLength(1);
  });
  it("마감이 지난 공고는 버리고 지난 알림 기록도 정리한다", async () => {
    const h = harness();
    await h.receiver.receive(payload);
    h.advance(10 * 86400000);
    expect(
      await h.receiver.receive({
        ...payload,
        id: "f".repeat(32),
        closesAt: "2026-11-05T09:00:00Z",
      }),
    ).toBe("expired");
    expect(h.shown).toHaveLength(1);
    expect(h.store[PUSH_NOTIFIED_KEY]).toEqual({});
  });
  it.each([
    { ...payload, link: "javascript:alert(1)" },
    { ...payload, closesAt: undefined },
    null,
    "text",
  ])("형식이 맞지 않는 payload는 버린다: %j", async (value) => {
    const h = harness();
    expect(await h.receiver.receive(value)).toBe("invalid");
    expect(h.shown).toEqual([]);
    expect(h.tracked).toEqual([]);
  });
  it("알림 본문이나 공고 열기 버튼은 기록된 링크만 열고 알림을 지운다", async () => {
    const h = harness();
    await h.receiver.receive(payload);
    expect(await h.receiver.open(postingNotificationId(ID))).toBe(true);
    expect(h.opened).toEqual([payload.link]);
    expect(h.cleared).toEqual([postingNotificationId(ID)]);
    expect(h.tracked[1]).toEqual([
      "posting_notification_opened",
      { surface: "notification", posting_id: ID },
    ]);
    expect(await h.receiver.open(postingNotificationId("unknown"))).toBe(false);
    expect(await h.receiver.open("careerForm.job.other.1")).toBe(false);
    expect(h.opened).toHaveLength(1);
  });
  it("마감 알림 저장은 CF-161 공고로 기본 알림 시점과 함께 저장한다", async () => {
    const h = harness();
    await h.receiver.receive(payload);
    expect(await h.receiver.save(postingNotificationId(ID))).toBe("saved");
    expect(h.rows()).toHaveLength(1);
    expect(h.rows()[0]).toMatchObject({
      company: "합성 회사",
      role: "합성 직무",
      url: payload.link,
      deadline: Date.parse(payload.closesAt),
      timeZone: "Asia/Seoul",
      status: "planned",
    });
    expect(h.rows()[0].reminders.map((r) => [r.minutes, r.state])).toEqual([
      [1440, "pending"],
      [120, "pending"],
    ]);
    expect(h.cleared).toEqual([postingNotificationId(ID)]);
    expect(h.shown[1]).toMatchObject({
      id: PUSH_SAVED_NOTIFICATION_PREFIX + ID,
      buttons: [],
      message: "마감 24시간 전, 2시간 전에 알려드려요.",
    });
    expect(h.tracked[1]).toEqual([
      "posting_notification_saved",
      { surface: "notification", posting_id: ID, trigger: "button" },
    ]);
  });
  it("이미 저장한 공고는 다시 저장하지 않는다", async () => {
    const h = harness();
    await h.receiver.receive(payload);
    await h.receiver.save(postingNotificationId(ID));
    expect(await h.receiver.save(postingNotificationId(ID))).toBe(
      "already_saved",
    );
    expect(h.rows()).toHaveLength(1);
    expect(h.shown[2].message).toContain("이미 저장한 공고");
    expect(
      h.tracked.filter(([event]) => event === "posting_notification_saved"),
    ).toHaveLength(1);
  });
  it("남은 알림이 없으면 저장하되 기존 안내를 보여 준다", async () => {
    const h = harness();
    await h.receiver.receive({
      ...payload,
      closesAt: new Date(NOW + 3600000).toISOString(),
    });
    expect(await h.receiver.save(postingNotificationId(ID))).toBe(
      "no_future_reminders",
    );
    expect(h.rows()[0].reminders.every((r) => r.state === "skipped")).toBe(
      true,
    );
    expect(h.shown[1].message).toContain("예약할 미래 알림이 없습니다");
  });
  it("저장 직전에 마감이 지났으면 저장하지 않고 안내한다", async () => {
    const h = harness();
    await h.receiver.receive({
      ...payload,
      closesAt: new Date(NOW + 3600000).toISOString(),
    });
    h.advance(7200000);
    expect(await h.receiver.save(postingNotificationId(ID))).toBe("expired");
    expect(h.rows()).toHaveLength(0);
    expect(h.shown[1].message).toContain("마감이 지난 공고");
    expect(await h.receiver.save(postingNotificationId("missing"))).toBe(
      undefined,
    );
  });
});

describe("PushReceiver display delay", () => {
  it.each([
    ["30초 전 발송", -30_000, 30_000],
    ["시계가 앞선 발송", 5_000, 0],
    ["25시간 전 발송", -25 * 3_600_000, 86_400_000],
  ])(
    "%s이면 delay_ms를 %s 기준으로 계산한다",
    async (_label, offset, expected) => {
      const h = harness();
      await h.receiver.receive({
        ...payload,
        sentAt: new Date(NOW + offset).toISOString(),
      });
      expect(h.tracked[0]).toEqual([
        "posting_notification_shown",
        { surface: "notification", posting_id: ID, delay_ms: expected },
      ]);
    },
  );
  it("sentAt이 없으면 delay_ms를 싣지 않는다", async () => {
    const h = harness();
    await h.receiver.receive(payload);
    expect(h.tracked[0]).toEqual([
      "posting_notification_shown",
      { surface: "notification", posting_id: ID },
    ]);
    expect(JSON.stringify(h.tracked)).not.toContain("example.test");
  });
});

describe("PushReceiver badge, visibility and auto-save", () => {
  it("알림 표시는 미확인 목록과 표시 시각을 기록하고 클릭은 보임과 개별 제거로 이어진다", async () => {
    const h = harness();
    await h.receiver.receive(payload);
    expect(h.unreadLog).toEqual([`add:${ID}:${Date.parse(payload.closesAt)}`]);
    expect(h.visibilityLog).toEqual(["shown"]);
    await h.receiver.receive({
      ...payload,
      id: "f".repeat(32),
      link: "ftp://x",
    });
    expect(h.unreadLog).toHaveLength(1);
    await h.receiver.open(postingNotificationId(ID));
    expect(h.visibilityLog).toEqual(["shown", "seen"]);
    expect(h.unreadLog).toEqual([
      `add:${ID}:${Date.parse(payload.closesAt)}`,
      `remove:${ID}`,
    ]);
  });
  it("자동 저장이 켜져 있으면 알림에서 공고를 열 때 저장하고 취소 버튼이 있는 후속 알림을 띄운다", async () => {
    const h = harness();
    await h.receiver.receive(payload);
    expect(h.rows()).toHaveLength(0);
    expect(await h.receiver.open(postingNotificationId(ID))).toBe(true);
    expect(h.rows()).toHaveLength(1);
    expect(h.rows()[0].reminders.map((r) => r.minutes)).toEqual([1440, 120]);
    expect(h.shown[1]).toMatchObject({
      id: PUSH_AUTOSAVED_NOTIFICATION_PREFIX + ID,
      title: expect.stringContaining("저장했어요"),
      buttons: ["저장 취소"],
    });
    expect(h.tracked).toEqual([
      [
        "posting_notification_shown",
        { surface: "notification", posting_id: ID },
      ],
      [
        "posting_notification_opened",
        { surface: "notification", posting_id: ID },
      ],
      [
        "posting_notification_saved",
        { surface: "notification", posting_id: ID, trigger: "open" },
      ],
    ]);
  });
  it("자동 저장이 꺼져 있으면 열어도 저장하지 않는다", async () => {
    const h = harness();
    h.setAutoSave(false);
    await h.receiver.receive(payload);
    await h.receiver.open(postingNotificationId(ID));
    expect(h.rows()).toHaveLength(0);
    expect(h.shown).toHaveLength(1);
    expect(h.tracked.map(([event]) => event)).toEqual([
      "posting_notification_shown",
      "posting_notification_opened",
    ]);
  });
  it("이미 저장한 공고를 열면 다시 저장하거나 후속 알림을 띄우지 않는다", async () => {
    const h = harness();
    await h.receiver.receive(payload);
    await h.receiver.save(postingNotificationId(ID));
    await h.receiver.open(postingNotificationId(ID));
    expect(h.rows()).toHaveLength(1);
    expect(h.shown.map((n) => n.id)).toEqual([
      postingNotificationId(ID),
      PUSH_SAVED_NOTIFICATION_PREFIX + ID,
    ]);
  });
  it("저장 취소 버튼은 저장 공고와 예약을 함께 지운다", async () => {
    const h = harness();
    await h.receiver.receive(payload);
    await h.receiver.open(postingNotificationId(ID));
    expect(h.rows()).toHaveLength(1);
    expect(
      await h.receiver.undoAutoSave(PUSH_AUTOSAVED_NOTIFICATION_PREFIX + ID),
    ).toBe(true);
    expect(h.rows()).toHaveLength(0);
    expect(h.cleared).toContain(PUSH_AUTOSAVED_NOTIFICATION_PREFIX + ID);
    expect(h.tracked.at(-1)).toEqual([
      "posting_auto_save_cancelled",
      { surface: "notification", posting_id: ID },
    ]);
    expect(
      await h.receiver.undoAutoSave(PUSH_AUTOSAVED_NOTIFICATION_PREFIX + "x"),
    ).toBe(false);
    expect(await h.receiver.undoAutoSave("careerForm.job.other.1")).toBe(false);
  });
});
