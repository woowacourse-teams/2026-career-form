import { describe, expect, it } from "vitest";
import { PushApiError } from "./push-api";
import { createPushClient } from "./push-client";
import { PUSH_ENABLED_KEY, PUSH_STATUS_KEY } from "./push-subscription";

const posting = {
  id: "0123456789abcdef0123456789abcdef",
  company: "합성 회사",
  role: "합성 직무",
  link: "https://careers.example.test/jobs/1",
  opensAt: 1,
  closesAt: 2,
};
function setup(respond: (message: unknown) => unknown) {
  const sent: unknown[] = [];
  const listeners: ((
    changes: Record<string, unknown>,
    area: string,
  ) => void)[] = [];
  const client = createPushClient({
    sendMessage: async (message) => {
      sent.push(message);
      return respond(message);
    },
    onChanged: {
      addListener: (listener) => {
        listeners.push(listener);
      },
      removeListener: (listener) => {
        listeners.splice(listeners.indexOf(listener), 1);
      },
    },
  });
  return { client, sent, listeners };
}
const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof PushApiError ? error.code : error;
  }
  return "resolved";
};
const state = {
  enabled: true,
  supported: true,
  status: { code: "registered", updatedAt: 1, attempts: 0 },
};

describe("push client", () => {
  it("상태 조회와 켜기·끄기 메시지를 보내고 응답을 검증한다", async () => {
    const { client, sent } = setup(() => ({ ok: true, state }));
    expect(await client.state()).toEqual(state);
    expect(await client.setEnabled(false)).toEqual(state);
    expect(await client.setEnabled(true)).toEqual(state);
    expect(sent).toEqual([
      { type: "careerForm.push", action: "status" },
      { type: "careerForm.push", action: "disable" },
      { type: "careerForm.push", action: "enable" },
    ]);
    const broken = setup(() => ({ ok: true, state: { enabled: "yes" } }));
    expect(await code(broken.client.state())).toBe("INVALID_RESPONSE");
    const garbage = setup(() => ({
      ok: true,
      state: { ...state, status: { code: "weird" } },
    }));
    expect(await code(garbage.client.state())).toBe("INVALID_RESPONSE");
  });
  it("공지함 응답의 유효한 공고만 돌려주고 오류 코드를 그대로 전달한다", async () => {
    const { client } = setup(() => ({
      ok: true,
      postings: [posting, { id: "broken" }],
    }));
    expect(await client.inbox()).toEqual([posting]);
    const missing = setup(() => ({ ok: false, code: "ENDPOINT_UNAVAILABLE" }));
    expect(await code(missing.client.inbox())).toBe("ENDPOINT_UNAVAILABLE");
    const unknown = setup(() => ({ ok: false, code: "UNAVAILABLE" }));
    expect(await code(unknown.client.inbox())).toBe("NETWORK");
    const rejected = setup(() => {
      throw new Error("no receiver");
    });
    expect(await code(rejected.client.inbox())).toBe("NETWORK");
  });
  it("로컬 저장소의 구독 상태 변경에만 반응한다", () => {
    const { client, listeners } = setup(() => ({ ok: true, state }));
    let count = 0;
    const unsubscribe = client.subscribe(() => {
      count += 1;
    });
    listeners[0]({ [PUSH_STATUS_KEY]: {} }, "local");
    listeners[0]({ [PUSH_ENABLED_KEY]: {} }, "local");
    listeners[0]({ other: {} }, "local");
    listeners[0]({ [PUSH_STATUS_KEY]: {} }, "sync");
    expect(count).toBe(2);
    unsubscribe();
    expect(listeners).toHaveLength(0);
  });
});
