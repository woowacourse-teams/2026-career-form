import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("wxt/browser", () => ({ browser: { runtime: { id: "extension-a" } } }));

import { loadPolicyForSender } from "./background";

const host = "synthetic.recruiter.co.kr";
const sender = {
  id: "extension-a",
  url: `https://${host}/v1/applicant/modify-resume/login`,
  frameId: 0,
  tab: { id: 7 },
};
const request = (payload: unknown) => ({
  type: "AUTOFILL_LOAD_EXECUTION_POLICY",
  payload,
});

let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test/");
  fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify({ executionPolicy: null }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetcher);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("loadPolicyForSender", () => {
  it("loads the policy for the current SPA route after same-document navigation", async () => {
    await expect(
      loadPolicyForSender(
        request({ host, pathPattern: "/v1/applicant/resume-form/123" }),
        sender,
      ),
    ).resolves.toEqual({ ok: true, data: { executionPolicy: null } });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/v1/execution-policy");
    expect(JSON.parse(String(init?.body))).toEqual({
      host,
      pathPattern: "/v1/applicant/resume-form/123",
    });
  });

  it("rejects a payload host that differs from the sender host", async () => {
    await expect(
      loadPolicyForSender(
        request({ host: "other.recruiter.co.kr", pathPattern: "/a" }),
        sender,
      ),
    ).resolves.toEqual({ ok: false, code: "BAD_REQUEST" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([["/a?x=1"], ["/a#b"], ["a/b"], [42], [null]])(
    "rejects a malformed path pattern %j",
    async (pathPattern) => {
      await expect(
        loadPolicyForSender(request({ host, pathPattern }), sender),
      ).resolves.toEqual({ ok: false, code: "BAD_REQUEST" });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["another extension", { ...sender, id: "extension-b" }],
    ["a sub-frame", { ...sender, frameId: 1 }],
    ["no tab id", { ...sender, tab: {} }],
  ])("rejects a sender from %s", async (_, untrusted) => {
    await expect(
      loadPolicyForSender(
        request({ host, pathPattern: "/v1/applicant/modify-resume/login" }),
        untrusted,
      ),
    ).resolves.toEqual({ ok: false, code: "BAD_REQUEST" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
