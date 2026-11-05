// @vitest-environment node
import { describe, expect, it } from "vitest";
import { listPageTargets, probeTargets, replaceTarget } from "./health.mjs";

const ENDPOINT = "http://127.0.0.1:9";
const PAGE_A = "https://example.test/apply/write?x=1#top";
const PAGE_B = "https://example.test/resume/writeResume#step2";

// A fake DevTools endpoint: /json/list, /json/version and one socket per
// target. Sockets listed in `hung` never answer; those in `broken` fail.
function fakeCdp({ hung = [], broken = [] } = {}) {
  const calls = [];
  const sockets = [];
  const targets = [
    { id: "t-a", type: "page", url: PAGE_A, webSocketDebuggerUrl: "ws://a" },
    { id: "t-b", type: "page", url: PAGE_B, webSocketDebuggerUrl: "ws://b" },
    {
      id: "t-w",
      type: "service_worker",
      url: "chrome-extension://x/sw.js",
      webSocketDebuggerUrl: "ws://w",
    },
  ];
  const fetchImpl = async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith("/json/version")
        ? { webSocketDebuggerUrl: "ws://browser" }
        : targets,
  });
  class FakeSocket extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.closed = false;
      sockets.push(this);
      setTimeout(() => {
        if (broken.includes(url)) this.dispatchEvent(new Event("error"));
        else this.dispatchEvent(new Event("open"));
      }, 0);
    }
    send(raw) {
      const { id, method, params } = JSON.parse(raw);
      calls.push({ socket: this.url, method, params });
      if (hung.includes(this.url)) return;
      const result =
        method === "Target.createTarget"
          ? { targetId: "t-new" }
          : method === "Target.closeTarget"
            ? { success: true }
            : { result: { type: "string", value: "complete" } };
      setTimeout(
        () =>
          this.dispatchEvent(
            new MessageEvent("message", {
              data: JSON.stringify({ id, result }),
            }),
          ),
        0,
      );
    }
    close() {
      this.closed = true;
    }
  }
  return { calls, sockets, fetchImpl, WebSocketImpl: FakeSocket };
}

describe("listPageTargets", () => {
  it("keeps page targets only", async () => {
    const cdp = fakeCdp();
    const targets = await listPageTargets(ENDPOINT, cdp);
    expect(targets.map((t) => t.targetId)).toEqual(["t-a", "t-b"]);
  });
});

describe("probeTargets", () => {
  it("classifies a target that never answers Runtime.evaluate as timeout", async () => {
    const cdp = fakeCdp({ hung: ["ws://b"] });
    const probes = await probeTargets(ENDPOINT, { ...cdp, timeoutMs: 60 });
    expect(probes).toHaveLength(2);
    const [a, b] = probes;
    expect(a).toMatchObject({ targetId: "t-a", ok: true, state: "ok" });
    expect(b).toMatchObject({ targetId: "t-b", ok: false, state: "timeout" });
    expect(b.ms).toBeGreaterThanOrEqual(55);
    expect(a.ms).toBeLessThan(b.ms);
    // Every target got the same probe, in parallel, and every socket closed.
    expect(cdp.calls.map((c) => c.method)).toEqual([
      "Runtime.evaluate",
      "Runtime.evaluate",
    ]);
    expect(cdp.calls[0].params).toEqual({
      expression: "document.readyState",
      returnByValue: true,
    });
    expect(cdp.sockets.every((s) => s.closed)).toBe(true);
  });

  it("records briefed URLs only (no query, no hash)", async () => {
    const probes = await probeTargets(ENDPOINT, fakeCdp());
    expect(probes.map((p) => p.url)).toEqual([
      "https://example.test/apply/write",
      "https://example.test/resume/writeResume",
    ]);
    expect(JSON.stringify(probes)).not.toContain("x=1");
  });

  it("reports a socket that fails to open as ws-error", async () => {
    const probes = await probeTargets(
      ENDPOINT,
      fakeCdp({ broken: ["ws://a"] }),
    );
    expect(probes[0]).toMatchObject({ ok: false, state: "ws-error" });
    expect(probes[1]).toMatchObject({ ok: true, state: "ok" });
  });
});

describe("replaceTarget", () => {
  it("creates the new tab at the same address before closing the hung one", async () => {
    const cdp = fakeCdp({ hung: ["ws://b"] });
    const result = await replaceTarget(ENDPOINT, "t-b", cdp);
    expect(result).toEqual({
      ok: true,
      url: "https://example.test/resume/writeResume",
      newTargetId: "t-new",
      closed: true,
    });
    // Only the browser session is used: the hung tab's own socket is never
    // opened, and create comes strictly before close.
    expect(cdp.calls.map((c) => [c.socket, c.method])).toEqual([
      ["ws://browser", "Target.createTarget"],
      ["ws://browser", "Target.closeTarget"],
    ]);
    expect(cdp.calls[0].params).toEqual({
      url: "https://example.test/resume/writeResume",
      newWindow: false,
      background: true,
    });
    expect(cdp.calls[1].params).toEqual({ targetId: "t-b" });
    expect(cdp.sockets.every((s) => s.closed)).toBe(true);
  });

  it("refuses an unknown target without touching the browser", async () => {
    const cdp = fakeCdp();
    expect(await replaceTarget(ENDPOINT, "t-x", cdp)).toEqual({
      ok: false,
      code: "target-not-found",
    });
    expect(cdp.calls).toEqual([]);
  });

  it("gives up with replace-timeout when the browser session does not answer", async () => {
    const cdp = fakeCdp({ hung: ["ws://browser"] });
    const result = await replaceTarget(ENDPOINT, "t-a", {
      ...cdp,
      timeoutMs: 40,
    });
    expect(result).toMatchObject({ ok: false, code: "replace-timeout" });
    expect(cdp.calls.map((c) => c.method)).toEqual(["Target.createTarget"]);
  });
});
