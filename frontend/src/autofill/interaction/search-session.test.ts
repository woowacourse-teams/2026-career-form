import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchFailure, SearchSession } from "./search-session";

function args(
  overrides: Partial<ConstructorParameters<typeof SearchSession>[0]> = {},
) {
  return {
    document,
    registry: undefined as never,
    targetCandidateId: "field-1",
    canonicalFieldKey: "education.university.schoolName",
    expectedValue: "가상값",
    ...overrides,
  };
}

describe("SearchSession", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("checks abort and approval guards before deadline", () => {
    const controller = new AbortController();
    const session = new SearchSession(args({ signal: controller.signal }));
    controller.abort();
    expect(() => session.check()).toThrowError(
      expect.objectContaining({ reason: "aborted" }),
    );

    const rejected = new SearchSession(args({ assertCurrent: () => false }));
    expect(() => rejected.check()).toThrowError(
      expect.objectContaining({ reason: "aborted" }),
    );
  });

  it("rejects after its deadline", () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(30_001);
    expect(() => new SearchSession(args()).check()).toThrowError(
      expect.objectContaining({ reason: "deadline_exceeded" }),
    );
  });

  it("races fulfillment and rejection while cleaning up listeners", async () => {
    const session = new SearchSession(args());
    await expect(session.race(Promise.resolve("ok"))).resolves.toBe("ok");
    await expect(session.race(Promise.reject(new Error("no")))).rejects.toThrow(
      "no",
    );
  });

  it("aborts a pending race without applying the eventual value", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const session = new SearchSession(args({ signal: controller.signal }));
    const pending = session.race(
      new Promise((resolve) => setTimeout(() => resolve("late"), 1000)),
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ reason: "aborted" });
    vi.advanceTimersByTime(1000);
  });

  it("times out a race and pause at the bounded deadline", async () => {
    vi.useFakeTimers();
    const session = new SearchSession(args());
    const pending = session.race(new Promise(() => {}), 25);
    const timedOut = expect(pending).rejects.toMatchObject({
      reason: "deadline_exceeded",
    });
    await vi.advanceTimersByTimeAsync(25);
    await timedOut;

    const pause = session.pause(10);
    await vi.advanceTimersByTimeAsync(10);
    await expect(pause).resolves.toBeUndefined();
  });

  it("waits until a value appears or returns the supplied timeout reason", async () => {
    vi.useFakeTimers();
    const session = new SearchSession(args());
    let ready = false;
    const pending = session.wait(
      () => (ready ? "ready" : undefined),
      "result_pending",
      100,
    );
    const timedOut = expect(pending).rejects.toMatchObject({
      reason: "result_pending",
    });
    await vi.advanceTimersByTimeAsync(100);
    await timedOut;

    const immediate = new SearchSession(args()).wait(
      () => "now",
      "result_pending",
    );
    await expect(immediate).resolves.toBe("now");
  });

  it("prepares mutations with a beforeMutation guard and stops cleanup", async () => {
    const cleanup = vi.fn();
    const allowed = new SearchSession(
      args({ beforeMutation: async () => true }),
    );
    allowed.addCleanup(cleanup);
    await expect(allowed.prepareMutation()).resolves.toBeUndefined();
    allowed.stop();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(() => allowed.check()).toThrowError(
      expect.objectContaining({ reason: "aborted" }),
    );

    const denied = new SearchSession(
      args({ beforeMutation: async () => false }),
    );
    await expect(denied.prepareMutation()).rejects.toMatchObject({
      reason: "stale_target",
    });
  });
});
