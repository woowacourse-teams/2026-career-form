import { describe, expect, it, vi } from "vitest";
import type { NotificationCheck } from "./notification-check";
import { PushApiError } from "./push-api";
import { createPushHandler } from "./push-background-handler";
import { parsePushMessage, PUSH_MESSAGE } from "./push-messages";
import type { PushSubscriptionService } from "./push-subscription";
import type { UnreadPostings } from "./unread-postings";

const posting = {
  id: "0123456789abcdef0123456789abcdef",
  company: "합성 회사",
  role: "합성 직무",
  link: "https://careers.example.test/jobs/1",
  opensAt: 1,
  closesAt: 2,
};
const options = { id: "own", url: "chrome-extension://own/options.html" };
const onboarding = { id: "own", url: "chrome-extension://own/onboarding.html" };
function setup() {
  const calls: unknown[] = [];
  let enabled = true;
  let autoSave = true;
  let inboxError: unknown;
  const service = {
    isEnabled: async () => enabled,
    supported: () => true,
    status: async () => ({ code: "registered", updatedAt: 1, attempts: 0 }),
    setEnabled: async (value: boolean) => {
      calls.push(["setEnabled", value]);
      enabled = value;
    },
  } as unknown as PushSubscriptionService;
  const check = {
    state: async () => ({ result: "unknown" }),
    permission: async () => "granted",
    sendTest: vi.fn(async () => {
      calls.push(["sendTest"]);
    }),
    record: vi.fn(async (answer: string, source: string) => {
      calls.push(["record", answer, source]);
      return { result: answer, checkedAt: 1, source };
    }),
    askLater: vi.fn(async () => {
      calls.push(["askLater"]);
      return { result: "unknown", askLaterAt: 1 };
    }),
  } as unknown as NotificationCheck;
  const unread = {
    count: async () => 2,
    clear: vi.fn(async () => {
      calls.push(["clearUnread"]);
      return 0;
    }),
  } as unknown as UnreadPostings;
  const handler = createPushHandler({
    service,
    api: {
      publicKey: async () => "",
      register: async () => ({ created: true }),
      unregister: async () => {},
      openPostings: async () => {
        if (inboxError) throw inboxError;
        return [posting];
      },
    },
    check,
    unread,
    autoSave: {
      read: async () => autoSave,
      write: async (value: boolean) => {
        calls.push(["autoSave", value]);
        autoSave = value;
      },
    },
    extensionId: "own",
  });
  return {
    handler,
    calls,
    failInbox: (error: unknown) => {
      inboxError = error;
    },
  };
}
const message = (action: string, extra: Record<string, unknown> = {}) => ({
  type: PUSH_MESSAGE,
  action,
  ...extra,
});

describe("push background handler", () => {
  it("푸시 메시지가 아니면 처리하지 않는다", () => {
    const { handler } = setup();
    expect(handler({ type: "other" }, options)).toBeUndefined();
    expect(handler("text", options)).toBeUndefined();
  });
  it("관리 페이지가 아닌 발신자와 알 수 없는 동작은 거절한다", async () => {
    const { handler } = setup();
    expect(
      await handler(message("status"), {
        id: "own",
        url: "https://example.com",
      }),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(await handler(message("drop"), options)).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });
  it("상태 조회는 구독, 권한, 표시 확인, 자동 저장, 미확인 개수를 함께 돌려준다", async () => {
    const { handler } = setup();
    expect(await handler(message("status"), options)).toEqual({
      ok: true,
      state: {
        enabled: true,
        supported: true,
        status: { code: "registered", updatedAt: 1, attempts: 0 },
        permission: "granted",
        visibility: { result: "unknown" },
        autoSave: true,
        unread: 2,
      },
    });
  });
  it("켜기·끄기와 자동 저장 설정은 저장 뒤 상태를 돌려준다", async () => {
    const { handler, calls } = setup();
    expect(await handler(message("disable"), options)).toMatchObject({
      ok: true,
      state: { enabled: false },
    });
    expect(await handler(message("enable"), options)).toMatchObject({
      ok: true,
      state: { enabled: true },
    });
    expect(
      await handler(message("autosave", { enabled: false }), options),
    ).toMatchObject({ ok: true, state: { autoSave: false } });
    expect(
      await handler(message("autosave", { enabled: "no" }), options),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(calls).toEqual([
      ["setEnabled", false],
      ["setEnabled", true],
      ["autoSave", false],
    ]);
  });
  it("알림 테스트, 응답 기록, 나중에는 표시 확인 서비스로 이어진다", async () => {
    const { handler, calls } = setup();
    expect(await handler(message("test"), options)).toMatchObject({ ok: true });
    expect(
      await handler(
        message("record", { answer: "not_seen", source: "test" }),
        options,
      ),
    ).toMatchObject({ ok: true });
    expect(
      await handler(
        message("record", { answer: "maybe", source: "test" }),
        options,
      ),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(await handler(message("later"), options)).toMatchObject({
      ok: true,
    });
    expect(calls).toEqual([
      ["sendTest"],
      ["record", "not_seen", "test"],
      ["askLater"],
    ]);
  });
  it("공지함 열람은 목록을 받은 뒤 미확인 개수를 지우고 오류 코드는 그대로 전달한다", async () => {
    const { handler, calls, failInbox } = setup();
    expect(await handler(message("inbox"), options)).toEqual({
      ok: true,
      postings: [posting],
    });
    expect(calls).toEqual([["clearUnread"]]);
    failInbox(new PushApiError("ENDPOINT_UNAVAILABLE"));
    expect(await handler(message("inbox"), options)).toEqual({
      ok: false,
      code: "ENDPOINT_UNAVAILABLE",
    });
    expect(calls).toEqual([["clearUnread"]]);
    failInbox(new Error("storage"));
    expect(await handler(message("inbox"), options)).toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });
  it("온보딩 페이지는 상태 조회, 끄기, 알림 테스트, 결과 기록만 보낼 수 있다", async () => {
    const { handler } = setup();
    for (const action of ["status", "disable", "test"])
      expect(await handler(message(action), onboarding)).toMatchObject({
        ok: true,
      });
    expect(
      await handler(
        message("record", { answer: "seen", source: "test" }),
        onboarding,
      ),
    ).toMatchObject({ ok: true });
    for (const action of ["enable", "inbox", "later"])
      expect(await handler(message(action), onboarding)).toEqual({
        ok: false,
        code: "UNAVAILABLE",
      });
    expect(
      await handler(message("autosave", { enabled: true }), onboarding),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(
      await handler(message("status"), {
        id: "own",
        url: "chrome-extension://own/sidepanel.html",
      }),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
  });
  it("명령 파서는 허용된 동작과 유효한 값만 받아들인다", () => {
    expect(parsePushMessage(message("inbox"))).toEqual(message("inbox"));
    expect(
      parsePushMessage(message("record", { answer: "seen", source: "card" })),
    ).toEqual(message("record", { answer: "seen", source: "card" }));
    expect(parsePushMessage(message("record", { answer: "seen" }))).toBe(
      undefined,
    );
    expect(parsePushMessage(message("autosave", { enabled: true }))).toEqual(
      message("autosave", { enabled: true }),
    );
    expect(parsePushMessage(message("autosave"))).toBeUndefined();
    expect(parsePushMessage(message("delete"))).toBeUndefined();
    expect(
      parsePushMessage({ type: "careerForm.postings", action: "inbox" }),
    ).toBeUndefined();
    expect(parsePushMessage(null)).toBeUndefined();
  });
});
