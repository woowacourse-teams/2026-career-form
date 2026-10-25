import { describe, expect, it } from "vitest";
import { PushApiError } from "./push-api";
import { createPushHandler } from "./push-background-handler";
import { parsePushMessage, PUSH_MESSAGE } from "./push-messages";
import type { PushSubscriptionService } from "./push-subscription";

const posting = {
  id: "0123456789abcdef0123456789abcdef",
  company: "합성 회사",
  role: "합성 직무",
  link: "https://careers.example.test/jobs/1",
  opensAt: 1,
  closesAt: 2,
};
function setup() {
  const calls: unknown[] = [];
  let enabled = true;
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
  const handler = createPushHandler(
    service,
    {
      publicKey: async () => "",
      register: async () => ({ created: true }),
      unregister: async () => {},
      openPostings: async () => {
        if (inboxError) throw inboxError;
        return [posting];
      },
    },
    "own",
  );
  const page = { id: "own", url: "chrome-extension://own/options.html" };
  return {
    handler,
    page,
    calls,
    failInbox: (error: unknown) => {
      inboxError = error;
    },
  };
}

describe("push background handler", () => {
  it("푸시 메시지가 아니면 처리하지 않는다", () => {
    const { handler, page } = setup();
    expect(handler({ type: "other" }, page)).toBeUndefined();
    expect(handler("text", page)).toBeUndefined();
  });
  it("관리 페이지가 아닌 발신자와 알 수 없는 동작은 거절한다", async () => {
    const { handler, page } = setup();
    expect(
      await handler(
        { type: PUSH_MESSAGE, action: "status" },
        { id: "own", url: "https://example.com" },
      ),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(await handler({ type: PUSH_MESSAGE, action: "drop" }, page)).toEqual(
      { ok: false, code: "UNAVAILABLE" },
    );
  });
  it("상태 조회와 켜기·끄기는 현재 상태를 돌려준다", async () => {
    const { handler, page, calls } = setup();
    expect(
      await handler({ type: PUSH_MESSAGE, action: "status" }, page),
    ).toEqual({
      ok: true,
      state: {
        enabled: true,
        supported: true,
        status: { code: "registered", updatedAt: 1, attempts: 0 },
      },
    });
    expect(
      await handler({ type: PUSH_MESSAGE, action: "disable" }, page),
    ).toMatchObject({ ok: true, state: { enabled: false } });
    expect(
      await handler({ type: PUSH_MESSAGE, action: "enable" }, page),
    ).toMatchObject({ ok: true, state: { enabled: true } });
    expect(calls).toEqual([
      ["setEnabled", false],
      ["setEnabled", true],
    ]);
  });
  it("공지함 목록과 오류 코드를 전달한다", async () => {
    const { handler, page, failInbox } = setup();
    expect(
      await handler({ type: PUSH_MESSAGE, action: "inbox" }, page),
    ).toEqual({ ok: true, postings: [posting] });
    failInbox(new PushApiError("ENDPOINT_UNAVAILABLE"));
    expect(
      await handler({ type: PUSH_MESSAGE, action: "inbox" }, page),
    ).toEqual({ ok: false, code: "ENDPOINT_UNAVAILABLE" });
    failInbox(new Error("storage"));
    expect(
      await handler({ type: PUSH_MESSAGE, action: "inbox" }, page),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
  });
  it("명령 파서는 허용된 동작만 받아들인다", () => {
    expect(parsePushMessage({ type: PUSH_MESSAGE, action: "inbox" })).toEqual({
      type: PUSH_MESSAGE,
      action: "inbox",
    });
    expect(parsePushMessage({ type: PUSH_MESSAGE, action: "delete" })).toBe(
      undefined,
    );
    expect(
      parsePushMessage({ type: "careerForm.postings", action: "inbox" }),
    ).toBe(undefined);
    expect(parsePushMessage(null)).toBeUndefined();
  });
});
