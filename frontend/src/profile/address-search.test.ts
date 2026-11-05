import { afterEach, describe, expect, it, vi } from "vitest";
import { createAddressSearchHandler } from "./address-search-background";
import { ADDRESS_SEARCH_MESSAGE, searchAddress } from "./address-search";

vi.mock("wxt/browser", () => ({ browser: { runtime: {} } }));

const EXTENSION_ID = "extension-id";
const pageSender = {
  id: EXTENSION_ID,
  url: `chrome-extension://${EXTENSION_ID}/options.html`,
};
const row = {
  postalCode: "63309",
  roadAddress: "제주특별자치도 제주시 첨단로 242",
  jibunAddress: "제주특별자치도 제주시 영평동 2181",
  buildingManagementNumber: "5011010400121810000000001",
};
const QUERY = "합성 검색어 첨단로 242";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function clientWith(
  fetcher: typeof fetch,
  baseUrl = "https://api.example.test/",
) {
  const handler = createAddressSearchHandler({
    baseUrl,
    extensionId: EXTENSION_ID,
    fetcher,
  });
  return (query: string, page = 1) =>
    searchAddress(query, page, async (message) => handler(message, pageSender));
}

afterEach(() => vi.restoreAllMocks());

describe("address search through the background", () => {
  it("posts the trimmed query in the body and returns the parsed page", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      json(200, { addresses: [row], page: 2, pageSize: 10, totalCount: 11 }),
    );

    await expect(clientWith(fetcher)(`  ${QUERY} `, 2)).resolves.toEqual({
      ok: true,
      addresses: [row],
      page: 2,
      pageSize: 10,
      totalCount: 11,
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/address/search");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ query: QUERY, page: 2 });
    expect(String(url)).not.toContain("query");
  });

  it.each([
    [400, { error: "INVALID_INPUT" }, "INVALID_INPUT"],
    [429, { error: "RATE_LIMITED" }, "RATE_LIMITED"],
    [502, { error: "ADDRESS_SEARCH_UNAVAILABLE" }, "UNAVAILABLE"],
    [503, { error: "ADDRESS_SEARCH_NOT_CONFIGURED" }, "NOT_CONFIGURED"],
    [500, {}, "UNAVAILABLE"],
  ])("maps status %i to a fixed code", async (status, body, code) => {
    const fetcher = vi.fn<typeof fetch>(async () => json(status, body));
    await expect(clientWith(fetcher)(QUERY)).resolves.toEqual({
      ok: false,
      code,
    });
  });

  it("reports a failed request as a network error", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("failed");
    });
    await expect(clientWith(fetcher)(QUERY)).resolves.toEqual({
      ok: false,
      code: "NETWORK",
    });
  });

  it.each([
    ["a non-JSON body", new Response("nope", { status: 200 })],
    ["a missing list", json(200, { page: 1, pageSize: 10, totalCount: 0 })],
    [
      "a malformed postal code",
      json(200, {
        addresses: [{ ...row, postalCode: "123" }],
        page: 1,
        pageSize: 10,
        totalCount: 1,
      }),
    ],
  ])("rejects %s", async (_name, response) => {
    const fetcher = vi.fn<typeof fetch>(async () => response);
    await expect(clientWith(fetcher)(QUERY)).resolves.toEqual({
      ok: false,
      code: "UNAVAILABLE",
    });
  });

  it.each([
    ["an empty query", "   ", 1],
    ["a query over 80 characters", "가".repeat(81), 1],
    ["page 0", QUERY, 0],
    ["page 101", QUERY, 101],
    ["a fractional page", QUERY, 1.5],
  ])("never calls the server for %s", async (_name, query, page) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(clientWith(fetcher)(query, page)).resolves.toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports a missing server address without a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(clientWith(fetcher, "  ")(QUERY)).resolves.toEqual({
      ok: false,
      code: "NOT_CONFIGURED",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["another extension", { id: "other", url: pageSender.url }],
    [
      "a content script on a web page",
      { id: EXTENSION_ID, url: "https://example.test/apply" },
    ],
  ])("refuses a search from %s", async (_name, sender) => {
    const fetcher = vi.fn<typeof fetch>();
    const handler = createAddressSearchHandler({
      baseUrl: "https://api.example.test",
      extensionId: EXTENSION_ID,
      fetcher,
    });
    await expect(
      handler({ type: ADDRESS_SEARCH_MESSAGE, query: QUERY, page: 1 }, sender),
    ).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("ignores other messages", () => {
    const handler = createAddressSearchHandler({
      baseUrl: "https://api.example.test",
      extensionId: EXTENSION_ID,
      fetcher: vi.fn<typeof fetch>(),
    });
    expect(handler({ type: "OTHER" }, pageSender)).toBeUndefined();
    expect(handler(null, pageSender)).toBeUndefined();
  });

  it("maps a rejected or malformed background reply to a fixed code", async () => {
    await expect(
      searchAddress(QUERY, 1, async () => {
        throw new Error("disconnected");
      }),
    ).resolves.toEqual({ ok: false, code: "NETWORK" });
    await expect(
      searchAddress(QUERY, 1, async () => undefined),
    ).resolves.toEqual({ ok: false, code: "UNAVAILABLE" });
  });

  it("writes nothing to the console on success or failure", async () => {
    const spies = (["log", "debug", "info", "warn", "error"] as const).map(
      (method) => vi.spyOn(console, method),
    );
    await clientWith(
      vi.fn<typeof fetch>(async () =>
        json(200, { addresses: [row], page: 1, pageSize: 10, totalCount: 1 }),
      ),
    )(QUERY);
    await clientWith(
      vi.fn<typeof fetch>(async () => {
        throw new TypeError(QUERY);
      }),
    )(QUERY);
    await clientWith(vi.fn<typeof fetch>(async () => json(502, {})))(QUERY);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
