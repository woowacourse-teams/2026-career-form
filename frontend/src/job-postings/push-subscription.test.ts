import { describe, expect, it } from "vitest";
import { PushApiError, type PushApiErrorCode } from "./push-api";
import {
  MINIMUM_CHROME_VERSION,
  parsePushStatus,
  PUSH_ENABLED_KEY,
  PUSH_STATUS_KEY,
  PushSubscriptionService,
  RETRY_DELAYS_MS,
  type PushSubscriptionLike,
} from "./push-subscription";

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
const point = (seed: number) =>
  Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 4 : (i + seed) % 256));
const KEY_A = point(1);
const KEY_B = point(2);

function harness(options: { chrome?: number; manager?: boolean } = {}) {
  const store: Record<string, unknown> = {};
  const log: string[] = [];
  let publicKey = base64Url(KEY_A);
  let failWith: PushApiErrorCode | undefined;
  let failRegisterWith: PushApiErrorCode | undefined;
  let failUnregisterWith: PushApiErrorCode | undefined;
  let gate: Promise<void> = Promise.resolve();
  let sequence = 0;
  let current: PushSubscriptionLike | null = null;
  const subscription = (key: Uint8Array): PushSubscriptionLike => {
    const endpoint = `https://push.example.test/sub-${++sequence}`;
    const self: PushSubscriptionLike = {
      endpoint,
      options: { applicationServerKey: key.slice().buffer },
      toJSON: () => ({
        endpoint,
        expirationTime: null,
        keys: { p256dh: "synthetic-p256dh", auth: "synthetic-auth" },
      }),
      unsubscribe: async () => {
        log.push(`browser:unsubscribe:${endpoint}`);
        if (current === self) current = null;
        return true;
      },
    };
    return self;
  };
  const manager = {
    getSubscription: async () => current,
    subscribe: async (init: {
      userVisibleOnly: boolean;
      applicationServerKey: Uint8Array;
    }) => {
      log.push(
        `browser:subscribe:${init.userVisibleOnly}:${base64Url(init.applicationServerKey)}`,
      );
      current = subscription(init.applicationServerKey);
      return current;
    },
  };
  const retries: (number | undefined)[] = [];
  let now = 1_700_000_000_000;
  const service = new PushSubscriptionService({
    api: {
      publicKey: async () => {
        await gate;
        log.push("api:publicKey");
        if (failWith) throw new PushApiError(failWith);
        return publicKey;
      },
      register: async (json) => {
        log.push(`api:register:${json.endpoint}:${json.keys.p256dh}`);
        if (failRegisterWith) throw new PushApiError(failRegisterWith);
        return { created: true };
      },
      unregister: async (endpoint) => {
        log.push(`api:unregister:${endpoint}`);
        if (failUnregisterWith) throw new PushApiError(failUnregisterWith);
      },
      openPostings: async () => [],
    },
    storage: {
      get: async (key) => ({ [key]: store[key] }),
      set: async (items) => {
        Object.assign(store, items);
      },
    },
    pushManager: () => (options.manager === false ? undefined : manager),
    chromeVersion: () => options.chrome ?? 130,
    now: () => now,
    scheduleRetry: async (delay) => {
      retries.push(delay);
    },
  });
  return {
    service,
    store,
    log,
    retries,
    setPublicKey: (key: Uint8Array) => {
      publicKey = base64Url(key);
    },
    failPublicKey: (code?: PushApiErrorCode) => {
      failWith = code;
    },
    failRegister: (code?: PushApiErrorCode) => {
      failRegisterWith = code;
    },
    failUnregister: (code?: PushApiErrorCode) => {
      failUnregisterWith = code;
    },
    hold: () => {
      let release = () => {};
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("PushSubscriptionService", () => {
  it("기본값은 켜짐이고 공개키 조회, 조용한 구독, 서버 등록 순으로 진행한다", async () => {
    const h = harness();
    expect(await h.service.isEnabled()).toBe(true);
    const status = await h.service.sync();
    expect(status).toMatchObject({ code: "registered", attempts: 0 });
    expect(h.log).toEqual([
      "api:publicKey",
      `browser:subscribe:false:${base64Url(KEY_A)}`,
      "api:register:https://push.example.test/sub-1:synthetic-p256dh",
    ]);
    expect(h.store[PUSH_STATUS_KEY]).toEqual(status);
    expect(h.retries).toEqual([undefined]);
    expect(await h.service.status()).toEqual(status);
  });
  it("기존 구독의 키가 같으면 다시 만들지 않고 서버에만 다시 등록한다", async () => {
    const h = harness();
    await h.service.sync();
    await h.service.sync();
    expect(h.log.filter((e) => e.startsWith("browser:subscribe"))).toHaveLength(
      1,
    );
    expect(h.log.filter((e) => e.startsWith("api:register"))).toEqual([
      "api:register:https://push.example.test/sub-1:synthetic-p256dh",
      "api:register:https://push.example.test/sub-1:synthetic-p256dh",
    ]);
  });
  it("서버 공개키가 바뀌면 기존 구독을 해제하고 새 키로 구독한다", async () => {
    const h = harness();
    await h.service.sync();
    h.setPublicKey(KEY_B);
    await h.service.sync();
    expect(h.log.slice(3)).toEqual([
      "api:publicKey",
      "browser:unsubscribe:https://push.example.test/sub-1",
      `browser:subscribe:false:${base64Url(KEY_B)}`,
      "api:register:https://push.example.test/sub-2:synthetic-p256dh",
    ]);
  });
  it("Chrome 121 미만이거나 pushManager가 없으면 구독을 시도하지 않는다", async () => {
    const old = harness({ chrome: MINIMUM_CHROME_VERSION - 1 });
    expect(old.service.supported()).toBe(false);
    expect(await old.service.sync()).toMatchObject({ code: "unsupported" });
    expect(old.log).toEqual([]);
    const missing = harness({ manager: false });
    expect(await missing.service.setEnabled(true)).toMatchObject({
      code: "unsupported",
    });
    expect(missing.log).toEqual([]);
    expect(harness().service.supported()).toBe(true);
  });
  it.each([
    ["NOT_CONFIGURED", "not_configured"],
    ["ENDPOINT_UNAVAILABLE", "endpoint_unavailable"],
  ] as const)("%s는 재시도 없이 %s 상태만 남긴다", async (code, expected) => {
    const h = harness();
    h.failPublicKey(code);
    expect(await h.service.sync()).toMatchObject({
      code: expected,
      attempts: 0,
    });
    expect(h.retries).toEqual([undefined]);
    expect(h.log).toEqual(["api:publicKey"]);
  });
  it("일시 오류는 실패 상태와 함께 재시도를 점점 늦게 예약하고 성공하면 초기화한다", async () => {
    const h = harness();
    h.failPublicKey("NETWORK");
    const expected = [...RETRY_DELAYS_MS, RETRY_DELAYS_MS.at(-1)];
    for (const [index, delay] of expected.entries()) {
      expect(await h.service.sync()).toMatchObject({
        code: "failed",
        attempts: index + 1,
        error: "NETWORK",
      });
      expect(h.retries.at(-1)).toBe(delay);
    }
    h.failPublicKey(undefined);
    expect(await h.service.sync()).toMatchObject({
      code: "registered",
      attempts: 0,
    });
    expect(h.retries.at(-1)).toBeUndefined();
  });
  it("서버가 구독을 거절하면 재시도하지 않고 실패 코드를 남긴다", async () => {
    const h = harness();
    h.failRegister("BAD_REQUEST");
    expect(await h.service.sync()).toMatchObject({
      code: "failed",
      attempts: 1,
      error: "BAD_REQUEST",
    });
    expect(h.retries).toEqual([undefined]);
  });
  it("끄면 서버 해지 뒤 브라우저 구독을 해제하고 켜면 새로 등록한다", async () => {
    const h = harness();
    await h.service.sync();
    expect(await h.service.setEnabled(false)).toMatchObject({
      code: "disabled",
    });
    expect(h.store[PUSH_ENABLED_KEY]).toBe(false);
    expect(h.log.slice(3)).toEqual([
      "api:unregister:https://push.example.test/sub-1",
      "browser:unsubscribe:https://push.example.test/sub-1",
    ]);
    expect(await h.service.sync()).toMatchObject({ code: "disabled" });
    expect(h.log).toHaveLength(5);
    expect(await h.service.setEnabled(true)).toMatchObject({
      code: "registered",
    });
    expect(h.store[PUSH_ENABLED_KEY]).toBe(true);
    expect(h.log.slice(5)).toEqual([
      "api:publicKey",
      `browser:subscribe:false:${base64Url(KEY_A)}`,
      "api:register:https://push.example.test/sub-2:synthetic-p256dh",
    ]);
  });
  it("서버 해지가 실패해도 브라우저 구독은 해제하고 꺼짐 상태에 오류를 남긴다", async () => {
    const h = harness();
    await h.service.sync();
    h.failUnregister("NETWORK");
    expect(await h.service.setEnabled(false)).toMatchObject({
      code: "disabled",
      error: "NETWORK",
    });
    expect(h.log.at(-1)).toBe(
      "browser:unsubscribe:https://push.example.test/sub-1",
    );
  });
  it("동시에 호출해도 한 번에 하나씩 처리한다", async () => {
    const h = harness();
    const release = h.hold();
    const first = h.service.sync();
    const second = h.service.setEnabled(false);
    release();
    await Promise.all([first, second]);
    expect(h.log).toEqual([
      "api:publicKey",
      `browser:subscribe:false:${base64Url(KEY_A)}`,
      "api:register:https://push.example.test/sub-1:synthetic-p256dh",
      "api:unregister:https://push.example.test/sub-1",
      "browser:unsubscribe:https://push.example.test/sub-1",
    ]);
  });
  it("손상된 상태 기록은 무시한다", () => {
    expect(parsePushStatus("garbage")).toBeUndefined();
    expect(parsePushStatus({ code: "weird", updatedAt: 1, attempts: 0 })).toBe(
      undefined,
    );
    expect(
      parsePushStatus({
        code: "failed",
        updatedAt: 1,
        attempts: 2,
        error: "NETWORK",
      }),
    ).toEqual({ code: "failed", updatedAt: 1, attempts: 2, error: "NETWORK" });
  });
});
