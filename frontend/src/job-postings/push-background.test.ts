import { expect, it, vi } from "vitest";
import type { Posting } from "./model";
import type { PushSubscriptionLike } from "./push-subscription";

type Listener = (...args: never[]) => unknown;
const mocks = vi.hoisted(() => {
  const listeners: Record<string, Listener[]> = {};
  return {
    store: {} as Record<string, unknown>,
    listeners,
    notifications: [] as Record<string, unknown>[],
    cleared: [] as string[],
    tabs: [] as unknown[],
    alarms: [] as unknown[],
    badges: [] as string[],
    statusWrites: 0,
    on: (name: string) => ({
      addListener: (listener: Listener) => {
        (listeners[name] ??= []).push(listener);
      },
    }),
  };
});
vi.mock("wxt/browser", () => ({
  browser: {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: mocks.store[key] }),
        set: async (items: Record<string, unknown>) => {
          if ("careerForm.push.status" in items) mocks.statusWrites += 1;
          Object.assign(mocks.store, items);
        },
      },
    },
    runtime: {
      id: "own",
      onStartup: mocks.on("startup"),
      onInstalled: mocks.on("installed"),
    },
    alarms: {
      create: async (name: string, info: unknown) => {
        mocks.alarms.push([name, info]);
      },
      clear: async (name: string) => {
        mocks.alarms.push(["clear", name]);
      },
      onAlarm: mocks.on("alarm"),
    },
    action: {
      setBadgeText: async ({ text }: { text: string }) => {
        mocks.badges.push(text);
      },
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {},
    },
    notifications: {
      getPermissionLevel: async () => "granted",
      create: async (id: string, options: Record<string, unknown>) => {
        mocks.notifications.push({ id, ...options });
      },
      clear: async (id: string) => {
        mocks.cleared.push(id);
      },
      onClicked: mocks.on("clicked"),
      onButtonClicked: mocks.on("button"),
    },
    tabs: {
      create: async (options: unknown) => {
        mocks.tabs.push(options);
      },
    },
  },
}));
import {
  chromeVersion,
  installPushBackground,
  PUSH_RETRY_ALARM,
} from "./push-background";

const ID = "0123456789abcdef0123456789abcdef";
const payload = {
  id: ID,
  company: "합성 회사",
  role: "합성 직무",
  link: "https://careers.example.test/jobs/1",
  opensAt: "2026-10-27T00:00:00Z",
  closesAt: "2099-11-03T09:00:00Z",
};
function install() {
  const scopeListeners: Record<string, Listener[]> = {};
  let current: PushSubscriptionLike | null = null;
  const scope = {
    registration: {
      pushManager: {
        getSubscription: async () => current,
        subscribe: async () => {
          current = {
            endpoint: "https://push.example.test/sub-1",
            options: { applicationServerKey: null },
            toJSON: () => ({
              endpoint: "https://push.example.test/sub-1",
              expirationTime: null,
              keys: { p256dh: "p", auth: "a" },
            }),
            unsubscribe: async () => true,
          };
          return current;
        },
      },
    },
    addEventListener: (type: string, listener: Listener) => {
      (scopeListeners[type] ??= []).push(listener);
    },
  };
  const saved: unknown[] = [];
  const removed: unknown[] = [];
  const tracked: [string, unknown][] = [];
  let rows: Posting[] = [];
  const installed = installPushBackground({
    baseUrl: undefined,
    extensionVersion: "0.1.0",
    postings: {
      list: async () => ({ postings: rows, problems: [] }),
      save: async (input) => {
        saved.push(input);
        rows = [
          {
            ...input,
            id: "job",
            version: 1,
            status: "planned",
            updatedAt: 0,
            reminders: [],
          },
        ];
        return { postings: rows, problems: [] };
      },
      remove: async (id, version) => {
        removed.push([id, version]);
        rows = rows.filter((row) => row.id !== id);
        return { postings: rows, problems: [] };
      },
    },
    track: (event, properties) => tracked.push([event, properties]),
    scope,
    userAgent: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36",
  });
  return { ...installed, scopeListeners, saved, removed, tracked };
}
const dispatch = async (listener: Listener | undefined, event: unknown) => {
  const waits: Promise<unknown>[] = [];
  (listener as ((e: unknown) => void) | undefined)?.({
    ...(event as object),
    waitUntil: (promise: Promise<unknown>) => {
      waits.push(promise);
    },
  });
  await Promise.all(waits);
};

it("서비스워커 push 이벤트를 알림으로 바꾸고 클릭과 버튼을 연결한다", async () => {
  const { scopeListeners, saved, tracked } = install();
  expect(Object.keys(scopeListeners).sort()).toEqual([
    "push",
    "pushsubscriptionchange",
  ]);
  await dispatch(scopeListeners.push[0], { data: { json: () => payload } });
  expect(mocks.notifications).toEqual([
    expect.objectContaining({
      id: `careerForm.push.posting.${ID}`,
      type: "basic",
      iconUrl: "chrome-extension://own/notification-icon.png",
      title: "합성 회사 · 합성 직무",
      buttons: [{ title: "공고 열기" }, { title: "마감 알림 저장" }],
    }),
  ]);
  const clicked = mocks.listeners.clicked[0] as (id: string) => void;
  const button = mocks.listeners.button[0] as (
    id: string,
    index: number,
  ) => void;
  clicked(`careerForm.push.posting.${ID}`);
  await vi.waitFor(() => expect(mocks.tabs).toEqual([{ url: payload.link }]));
  expect(mocks.cleared).toContain(`careerForm.push.posting.${ID}`);
  button(`careerForm.push.posting.${ID}`, 1);
  await vi.waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({ url: payload.link, minutes: [1440, 120] });
  await vi.waitFor(() =>
    expect(mocks.notifications.at(-1)).toMatchObject({
      id: `careerForm.push.saved.${ID}`,
    }),
  );
  clicked(`careerForm.push.saved.${ID}`);
  await vi.waitFor(() =>
    expect(mocks.cleared).toContain(`careerForm.push.saved.${ID}`),
  );
  button("careerForm.job.other.1", 0);
  clicked("careerForm.job.other.1");
  button(`careerForm.push.posting.${ID}`, 0);
  await vi.waitFor(() => expect(mocks.tabs).toHaveLength(2));
  expect(tracked.map(([event]) => event)).toEqual([
    "posting_notification_shown",
    "posting_notification_opened",
    "posting_notification_saved",
    "posting_notification_opened",
  ]);
  expect(JSON.stringify(tracked)).not.toContain("careers.example.test");
});

it("payload가 JSON이 아니거나 비어 있으면 무시한다", async () => {
  const { scopeListeners } = install();
  const before = mocks.notifications.length;
  await dispatch(scopeListeners.push[0], {
    data: {
      json: () => {
        throw new SyntaxError("not json");
      },
    },
  });
  await dispatch(scopeListeners.push[0], { data: null });
  await dispatch(scopeListeners.push[0], {
    data: { json: () => ({ ...payload, id: "duplicate check", link: "x" }) },
  });
  expect(mocks.notifications).toHaveLength(before);
});

it("구독 변경 이벤트, 시작, 설치, 재시도 알람은 구독 동기화를 실행한다", async () => {
  const { scopeListeners } = install();
  mocks.statusWrites = 0;
  await dispatch(scopeListeners.pushsubscriptionchange[0], {});
  expect(mocks.store["careerForm.push.status"]).toMatchObject({
    code: "not_configured",
  });
  expect(mocks.statusWrites).toBe(1);
  (mocks.listeners.startup.at(-1) as () => void)();
  (mocks.listeners.installed.at(-1) as () => void)();
  (mocks.listeners.alarm.at(-1) as (alarm: { name: string }) => void)({
    name: PUSH_RETRY_ALARM,
  });
  (mocks.listeners.alarm.at(-1) as (alarm: { name: string }) => void)({
    name: "careerForm.jobPostings.next",
  });
  await vi.waitFor(() => expect(mocks.statusWrites).toBe(4));
  expect(mocks.alarms).toContainEqual(["clear", PUSH_RETRY_ALARM]);
});

it("관리 페이지 메시지에 구독 상태를 돌려준다", async () => {
  const { handleMessage } = install();
  expect(
    await handleMessage(
      { type: "careerForm.push", action: "status" },
      { id: "own", url: "chrome-extension://own/options.html" },
    ),
  ).toMatchObject({ ok: true, state: { enabled: true, supported: true } });
});

it("Chrome 메이저 버전을 UA에서 읽는다", () => {
  expect(chromeVersion("Mozilla/5.0 Chrome/121.0.6167.85 Safari/537.36")).toBe(
    121,
  );
  expect(chromeVersion("Mozilla/5.0 Firefox/130.0")).toBeUndefined();
});

it("시작 시 저장된 미확인 목록으로 배지를 다시 그리고 알림마다 늘린다", async () => {
  mocks.store["careerForm.push.unread"] = {
    ["c".repeat(32)]: Date.now() + 86400000,
  };
  mocks.badges.length = 0;
  const { scopeListeners } = install();
  await vi.waitFor(() => expect(mocks.badges).toContain("1"));
  await dispatch(scopeListeners.push[0], {
    data: { json: () => ({ ...payload, id: "d".repeat(32) }) },
  });
  expect(mocks.badges.at(-1)).toBe("2");
  delete mocks.store["careerForm.push.unread"];
});

it("온보딩 페이지는 알림 테스트만 보낼 수 있고 공지함은 열 수 없다", async () => {
  const { handleMessage } = install();
  const onboarding = {
    id: "own",
    url: "chrome-extension://own/onboarding.html",
  };
  expect(
    await handleMessage(
      { type: "careerForm.push", action: "test" },
      onboarding,
    ),
  ).toMatchObject({ ok: true });
  expect(mocks.notifications.at(-1)).toMatchObject({
    id: "careerForm.push.test",
    iconUrl: "chrome-extension://own/notification-icon.png",
  });
  expect(
    await handleMessage(
      { type: "careerForm.push", action: "inbox" },
      onboarding,
    ),
  ).toEqual({ ok: false, code: "UNAVAILABLE" });
});

it("자동 저장 후속 알림의 저장 취소 버튼은 저장을 되돌린다", async () => {
  const { scopeListeners, saved, removed } = install();
  const id = "e".repeat(32);
  await dispatch(scopeListeners.push[0], {
    data: { json: () => ({ ...payload, id }) },
  });
  const clicked = mocks.listeners.clicked.at(-1) as (id: string) => void;
  const button = mocks.listeners.button.at(-1) as (
    id: string,
    index: number,
  ) => void;
  clicked(`careerForm.push.posting.${id}`);
  await vi.waitFor(() =>
    expect(mocks.notifications.at(-1)).toMatchObject({
      id: `careerForm.push.autosaved.${id}`,
      buttons: [{ title: "저장 취소" }],
    }),
  );
  expect(saved).toHaveLength(1);
  button(`careerForm.push.autosaved.${id}`, 0);
  await vi.waitFor(() => expect(removed).toHaveLength(1));
  expect(mocks.cleared).toContain(`careerForm.push.autosaved.${id}`);
  clicked("careerForm.push.test");
  await vi.waitFor(() =>
    expect(mocks.cleared).toContain("careerForm.push.test"),
  );
});
