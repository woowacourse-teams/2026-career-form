import { describe, expect, it, vi } from "vitest";
import { createResumeImportHandler } from "./resume-import-background";
import {
  RESUME_IMPORT_MESSAGE,
  requestResumeDraft,
} from "./resume-import-client";

const EXTENSION_ID = "synthetic-extension";
const pageSender = {
  id: EXTENSION_ID,
  url: `chrome-extension://${EXTENSION_ID}/sidepanel.html`,
};
const contentSender = { id: EXTENSION_ID, url: "https://example.test/apply" };

const emptyProfile = {
  personal: {},
  contact: {},
  education: [],
  languages: [],
  certifications: [],
  careers: [],
  projects: [],
  publications: [],
  compensation: {},
  military: {},
  veteran: {},
  disability: {},
  health: [],
};

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

function setup(
  response: () => Promise<Response> | Response,
  baseUrl = "https://api.example.test/",
) {
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => response(),
  );
  const handle = createResumeImportHandler({
    baseUrl,
    extensionId: EXTENSION_ID,
    fetcher: fetcher as unknown as typeof fetch,
  });
  return { fetcher, handle };
}

describe("createResumeImportHandler", () => {
  it("ignores unrelated messages", () => {
    const { handle } = setup(() => json(200, {}));
    expect(handle({ type: "other" }, pageSender)).toBeUndefined();
  });

  it("posts the text to the resume draft API and returns the draft", async () => {
    const profile = {
      ...emptyProfile,
      contact: { email: "synthetic@example.test" },
      education: [
        { sectionId: "university", values: { schoolName: "합성대학교" } },
      ],
    };
    const { fetcher, handle } = setup(() =>
      json(200, { schemaVersion: 1, profile }),
    );
    await expect(
      handle({ type: RESUME_IMPORT_MESSAGE, text: "합성 이력서" }, pageSender),
    ).resolves.toEqual({ ok: true, profile });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/v1/profile-import/resume");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(init?.body))).toEqual({ text: "합성 이력서" });
  });

  it("accepts the in-page panel, which runs as this extension's content script", async () => {
    const { fetcher, handle } = setup(() =>
      json(200, { schemaVersion: 1, profile: emptyProfile }),
    );
    await expect(
      handle({ type: RESUME_IMPORT_MESSAGE, text: "합성" }, contentSender),
    ).resolves.toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    [{ id: "other-extension", url: pageSender.url }, "합성"],
    [pageSender, ""],
    [pageSender, "   "],
    [pageSender, 42],
  ])(
    "rejects a foreign sender or empty text without a request",
    async (sender, text) => {
      const { fetcher, handle } = setup(() => json(200, {}));
      await expect(
        handle({ type: RESUME_IMPORT_MESSAGE, text }, sender),
      ).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("rejects text over the limit without a request", async () => {
    const { fetcher, handle } = setup(() => json(200, {}));
    await expect(
      handle(
        { type: RESUME_IMPORT_MESSAGE, text: "가".repeat(20_001) },
        pageSender,
      ),
    ).resolves.toEqual({ ok: false, code: "TOO_LONG" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports a missing API origin without a request", async () => {
    const { fetcher, handle } = setup(() => json(200, {}), " ");
    await expect(
      handle({ type: RESUME_IMPORT_MESSAGE, text: "합성" }, pageSender),
    ).resolves.toEqual({ ok: false, code: "NOT_CONFIGURED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [400, { error: "RESUME_TEXT_EMPTY" }, {}, { code: "EMPTY" }],
    [400, { error: "INVALID_INPUT" }, {}, { code: "INVALID_INPUT" }],
    [
      413,
      { error: "RESUME_TEXT_TOO_LONG", maxLength: 20000 },
      {},
      { code: "TOO_LONG" },
    ],
    [
      429,
      { error: "RATE_LIMITED" },
      { "Retry-After": "37" },
      { code: "RATE_LIMITED", retryAfterSeconds: 37 },
    ],
    [429, { error: "RATE_LIMITED" }, {}, { code: "RATE_LIMITED" }],
    [502, { error: "PROFILE_IMPORT_UNAVAILABLE" }, {}, { code: "UNAVAILABLE" }],
    [
      503,
      { error: "PROFILE_IMPORT_NOT_CONFIGURED" },
      {},
      { code: "NOT_CONFIGURED" },
    ],
    [500, {}, {}, { code: "UNAVAILABLE" }],
  ])(
    "maps HTTP %i to a fixed code",
    async (status, body, headers, expected) => {
      const { handle } = setup(() => json(status, body, headers));
      await expect(
        handle({ type: RESUME_IMPORT_MESSAGE, text: "합성" }, pageSender),
      ).resolves.toEqual({ ok: false, ...expected });
    },
  );

  it.each([
    [{ schemaVersion: 2, profile: emptyProfile }],
    [{ schemaVersion: 1, profile: { ...emptyProfile, contact: { email: 3 } } }],
    [
      {
        schemaVersion: 1,
        profile: { ...emptyProfile, education: [{ sectionId: "university" }] },
      },
    ],
    [{ schemaVersion: 1 }],
  ])("treats an unexpected success body as unavailable", async (body) => {
    const { handle } = setup(() => json(200, body));
    await expect(
      handle({ type: RESUME_IMPORT_MESSAGE, text: "합성" }, pageSender),
    ).resolves.toEqual({ ok: false, code: "UNAVAILABLE" });
  });

  it("reports a network failure", async () => {
    const { handle } = setup(() => Promise.reject(new TypeError("offline")));
    await expect(
      handle({ type: RESUME_IMPORT_MESSAGE, text: "합성" }, pageSender),
    ).resolves.toEqual({ ok: false, code: "NETWORK" });
  });
});

describe("requestResumeDraft", () => {
  it("sends one message and passes a valid reply through", async () => {
    const send = vi.fn(async () => ({ ok: true, profile: emptyProfile }));
    await expect(requestResumeDraft("합성", send)).resolves.toEqual({
      ok: true,
      profile: emptyProfile,
    });
    expect(send).toHaveBeenCalledWith({
      type: RESUME_IMPORT_MESSAGE,
      text: "합성",
    });
  });

  it("maps a failed or malformed reply to fixed codes", async () => {
    await expect(
      requestResumeDraft("합성", async () => {
        throw new Error("no receiver");
      }),
    ).resolves.toEqual({ ok: false, code: "NETWORK" });
    await expect(
      requestResumeDraft("합성", async () => ({ ok: true })),
    ).resolves.toEqual({ ok: false, code: "UNAVAILABLE" });
    await expect(
      requestResumeDraft("합성", async () => ({
        ok: false,
        code: "RATE_LIMITED",
        retryAfterSeconds: 5,
      })),
    ).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
      retryAfterSeconds: 5,
    });
  });
});
