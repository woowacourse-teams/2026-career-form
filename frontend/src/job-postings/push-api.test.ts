import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  createPushApi,
  parseServerPosting,
  PushApiError,
} from "./push-api";

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
// Synthetic uncompressed P-256 point shape: 65 bytes starting with 0x04.
const POINT = Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 4 : i));
const PUBLIC_KEY = base64Url(POINT);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function setup(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
  options: { baseUrl: string | undefined; timeoutMs?: number } = {
    baseUrl: "https://api.example.test/",
  },
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = createPushApi({
    ...options,
    extensionVersion: "9.9.9",
    fetcher: async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      return respond(url, init);
    },
  });
  return { client, calls };
}
const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof PushApiError ? error.code : error;
  }
  return "resolved";
};

describe("push api contract", () => {
  it("baseUrl이 없으면 요청 없이 NOT_CONFIGURED로 끝난다", async () => {
    const { client, calls } = setup(() => json({}), { baseUrl: "  " });
    expect(await code(client.publicKey())).toBe("NOT_CONFIGURED");
    expect(await code(client.openPostings())).toBe("NOT_CONFIGURED");
    expect(calls).toHaveLength(0);
  });
  it("공개키 조회는 버전 헤더를 붙이고 자격 증명 없이 보낸다", async () => {
    const { client, calls } = setup(() => json({ publicKey: PUBLIC_KEY }));
    expect(await client.publicKey()).toBe(PUBLIC_KEY);
    expect(calls[0].url).toBe(
      "https://api.example.test/api/v1/notifications/vapid-public-key",
    );
    expect(calls[0].init?.credentials).toBe("omit");
    expect(
      new Headers(calls[0].init?.headers).get("X-Career-Form-Version"),
    ).toBe("9.9.9");
  });
  it.each([
    { publicKey: "short" },
    { publicKey: base64Url(new Uint8Array(65)) },
    { publicKey: 12 },
    {},
  ])("공개키가 P-256 비압축 점이 아니면 INVALID_RESPONSE: %j", async (body) => {
    const { client } = setup(() => json(body));
    expect(await code(client.publicKey())).toBe("INVALID_RESPONSE");
  });
  it("JSON이 아닌 응답은 INVALID_RESPONSE다", async () => {
    const { client } = setup(() => new Response("<html>", { status: 200 }));
    expect(await code(client.publicKey())).toBe("INVALID_RESPONSE");
  });
  it.each([
    [404, "ENDPOINT_UNAVAILABLE"],
    [400, "BAD_REQUEST"],
    [429, "BAD_REQUEST"],
    [500, "SERVER_ERROR"],
    [503, "SERVER_ERROR"],
  ])("HTTP %i는 %s로 분류한다", async (status, expected) => {
    const { client } = setup(() => json({ error: "x" }, status));
    expect(await code(client.openPostings())).toBe(expected);
  });
  it("네트워크 오류와 시간 초과를 구분한다", async () => {
    const network = setup(() => {
      throw new TypeError("offline");
    });
    expect(await code(network.client.publicKey())).toBe("NETWORK");
    const slow = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
      { baseUrl: "https://api.example.test", timeoutMs: 5 },
    );
    expect(await code(slow.client.publicKey())).toBe("TIMEOUT");
  });
  it("구독 등록은 endpoint·expirationTime·keys만 JSON으로 보낸다", async () => {
    const { client, calls } = setup(() => json({ created: true }, 201));
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/synthetic-token",
      expirationTime: null,
      keys: { p256dh: "p", auth: "a" },
      extra: "must-not-be-sent",
    };
    expect(await client.register(subscription)).toEqual({ created: true });
    expect(calls[0].url).toBe(
      "https://api.example.test/api/v1/notifications/subscriptions",
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(new Headers(calls[0].init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: { p256dh: "p", auth: "a" },
    });
  });
  it("같은 endpoint의 재등록 200 응답은 created=false로 돌려주고 본문이 비어도 성공이다", async () => {
    const existing = setup(() => json({ created: false }, 200));
    expect(
      await existing.client.register({
        endpoint: "https://fcm.googleapis.com/fcm/send/synthetic-token",
        expirationTime: null,
        keys: { p256dh: "p", auth: "a" },
      }),
    ).toEqual({ created: false });
    const empty = setup(() => new Response(null, { status: 200 }));
    expect(
      await empty.client.register({
        endpoint: "https://fcm.googleapis.com/fcm/send/synthetic-token",
        expirationTime: null,
        keys: { p256dh: "p", auth: "a" },
      }),
    ).toEqual({ created: false });
  });
  it("구독 해지는 unsubscribe 경로에 endpoint만 보내고 204면 끝난다", async () => {
    const { client, calls } = setup(() => new Response(null, { status: 204 }));
    await client.unregister("https://fcm.googleapis.com/fcm/send/synthetic");
    expect(calls[0].url).toBe(
      "https://api.example.test/api/v1/notifications/subscriptions/unsubscribe",
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/synthetic",
    });
    const missing = setup(() => json({}, 404));
    expect(await code(missing.client.unregister("https://x.test"))).toBe(
      "ENDPOINT_UNAVAILABLE",
    );
  });
  it("진행 중 공고 목록은 유효한 항목만 마감순으로 돌려준다", async () => {
    const { client, calls } = setup(() =>
      json({
        postings: [
          {
            id: "b".repeat(32),
            company: "합성 회사 B",
            role: "프론트엔드",
            link: "https://careers.example.test/jobs/b",
            opensAt: "2030-01-01T00:00:00Z",
            closesAt: "2030-01-03T00:00:00Z",
          },
          {
            id: "a".repeat(32),
            company: "합성 회사 A",
            role: "백엔드",
            link: "https://careers.example.test/jobs/a",
            opensAt: "2029-12-31T23:00:00+09:00",
            closesAt: "2030-01-02T00:00:00Z",
          },
          {
            id: "c".repeat(32),
            company: "링크 오류",
            role: "데이터",
            link: "ftp://careers.example.test/jobs/c",
            opensAt: "2030-01-01T00:00:00Z",
            closesAt: "2030-01-02T00:00:00Z",
          },
          { id: "d".repeat(32), company: "필드 누락", role: "데이터" },
        ],
      }),
    );
    expect(await client.openPostings()).toEqual([
      {
        id: "a".repeat(32),
        company: "합성 회사 A",
        role: "백엔드",
        link: "https://careers.example.test/jobs/a",
        opensAt: Date.parse("2029-12-31T14:00:00Z"),
        closesAt: Date.parse("2030-01-02T00:00:00Z"),
      },
      {
        id: "b".repeat(32),
        company: "합성 회사 B",
        role: "프론트엔드",
        link: "https://careers.example.test/jobs/b",
        opensAt: Date.parse("2030-01-01T00:00:00Z"),
        closesAt: Date.parse("2030-01-03T00:00:00Z"),
      },
    ]);
    expect(calls[0].url).toBe(
      "https://api.example.test/api/v1/notifications/postings",
    );
    const broken = setup(() => json({ postings: "none" }));
    expect(await code(broken.client.openPostings())).toBe("INVALID_RESPONSE");
  });
});

describe("parseServerPosting", () => {
  const valid = {
    id: "0123456789abcdef0123456789abcdef",
    company: "  합성 회사  ",
    role: "합성 직무",
    link: "https://careers.example.test/jobs/1",
    opensAt: "2030-01-01T00:00:00Z",
    closesAt: "2030-01-01T01:00:00Z",
  };
  it("문자열을 다듬고 시각을 밀리초로 바꾼다", () => {
    expect(parseServerPosting(valid)).toEqual({
      id: valid.id,
      company: "합성 회사",
      role: "합성 직무",
      link: valid.link,
      opensAt: Date.parse(valid.opensAt),
      closesAt: Date.parse(valid.closesAt),
    });
  });
  it.each([
    { ...valid, id: "has space" },
    { ...valid, id: "" },
    { ...valid, company: "" },
    { ...valid, company: "a".repeat(201) },
    { ...valid, role: "줄바꿈\n포함" },
    { ...valid, link: "https://user:pw@careers.example.test/jobs/1" },
    { ...valid, link: "javascript:alert(1)" },
    { ...valid, opensAt: "어제" },
    { ...valid, closesAt: valid.opensAt },
    { ...valid, closesAt: undefined },
    null,
    "문자열",
  ])("형식이 맞지 않으면 버린다: %j", (value) => {
    expect(parseServerPosting(value)).toBeUndefined();
  });
});

describe("base64UrlToBytes", () => {
  it("패딩 없는 base64url을 복원한다", () => {
    expect([...base64UrlToBytes(PUBLIC_KEY)]).toEqual([...POINT]);
  });
  it("허용되지 않은 문자가 있으면 거부한다", () => {
    expect(() => base64UrlToBytes("a+b/c=")).toThrow();
  });
});
