import { afterEach, describe, expect, it, vi } from "vitest";
import { captureSearchFollowUp } from "./search-follow-up";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function fixture() {
  document.body.innerHTML = `<div data-repeater-item><input readonly><select disabled aria-busy="true"><option value="">등급</option></select></div><div><select><option>다른 행</option></select></div>`;
  const scope = document.querySelector("div")!;
  const target = scope.querySelector("input")!;
  const select = scope.querySelector("select")!;
  return { scope, target, select };
}

describe("search follow-up observation", () => {
  it("waits for changed options, active state and a stable interval in the captured row", async () => {
    vi.useFakeTimers();
    const { scope, target, select } = fixture();
    const observation = captureSearchFollowUp(scope, target)!;
    const pending = observation.wait({});
    select.innerHTML = `<option value="grade">합성 등급</option>`;
    await vi.advanceTimersByTimeAsync(300);
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    expect(settled).toBe(false);
    select.disabled = false;
    select.removeAttribute("aria-busy");
    await vi.advanceTimersByTimeAsync(600);
    expect(await pending).toEqual([select]);
    observation.dispose();
  });

  it("returns a newly inserted same-row input only after it is visible and ready", async () => {
    vi.useFakeTimers();
    const { scope, target } = fixture();
    scope.querySelector("select")!.remove();
    const observation = captureSearchFollowUp(scope, target)!;
    const pending = observation.wait({});
    const outcome = pending.then(
      (controls) => ({ controls }),
      (error: unknown) => ({ error }),
    );
    const input = document.createElement("input");
    input.name = "issuer";
    input.style.display = "none";
    scope.append(input);
    await vi.advanceTimersByTimeAsync(300);
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    expect(settled).toBe(false);
    input.style.display = "";
    await vi.advanceTimersByTimeAsync(1600);
    expect(await outcome).toEqual({ controls: [input] });
    observation.dispose();
  });

  it("returns a previously hidden same-row textarea when it becomes visible", async () => {
    vi.useFakeTimers();
    const { scope, target } = fixture();
    scope.querySelector("select")!.remove();
    const textarea = document.createElement("textarea");
    textarea.hidden = true;
    scope.append(textarea);
    const observation = captureSearchFollowUp(scope, target)!;
    const pending = observation.wait({});
    const outcome = pending.then(
      (controls) => ({ controls }),
      (error: unknown) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(300);
    textarea.hidden = false;
    await vi.advanceTimersByTimeAsync(1600);
    expect(await outcome).toEqual({ controls: [textarea] });
    observation.dispose();
  });

  it("returns an existing same-row input when it becomes enabled without value changes", async () => {
    vi.useFakeTimers();
    const { scope, target } = fixture();
    scope.querySelector("select")!.remove();
    const input = document.createElement("input");
    input.name = "issuer";
    input.disabled = true;
    scope.append(input);
    const observation = captureSearchFollowUp(scope, target)!;
    const pending = observation.wait({});
    const outcome = pending.then(
      (controls) => ({ controls }),
      (error: unknown) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(200);
    input.disabled = false;
    await vi.advanceTimersByTimeAsync(800);
    expect(await outcome).toEqual({ controls: [input] });
    observation.dispose();
  });

  it("waits longer than the old 150ms empty interval before declaring no follow-up", async () => {
    vi.useFakeTimers();
    const { scope, target } = fixture();
    scope.querySelector("select")!.remove();
    const observation = captureSearchFollowUp(scope, target)!;
    const pending = observation.wait({});
    await vi.advanceTimersByTimeAsync(400);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(await pending).toEqual([]);
    observation.dispose();
  });

  it("does not accept another row's change or unchanged disabled controls", async () => {
    vi.useFakeTimers();
    const { scope, target } = fixture();
    const observation = captureSearchFollowUp(scope, target)!;
    const pending = observation.wait({});
    const failure = expect(pending).rejects.toThrow("result_pending");
    document.querySelectorAll("select")[1]!.innerHTML =
      `<option value="other">changed</option>`;
    await vi.advanceTimersByTimeAsync(1600);
    await failure;
    observation.dispose();
  });

  it("invalidates a generation after trusted user input and never resumes on a late callback", async () => {
    vi.useFakeTimers();
    const { scope, target, select } = fixture();
    const observation = captureSearchFollowUp(scope, target)!;
    const addEventListener = scope.addEventListener.bind(scope);
    let inputListener: EventListener | undefined;
    vi.spyOn(scope, "addEventListener").mockImplementation(
      (type, listener, options) => {
        if (type === "input") inputListener = listener as EventListener;
        addEventListener(type, listener, options);
      },
    );
    const pending = observation.wait({});
    const outcome = pending.then(
      (controls) => ({ controls }),
      (error: unknown) => ({ error }),
    );
    inputListener?.call(scope, { isTrusted: true } as Event);
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome).toMatchObject({
      error: expect.objectContaining({
        reason: "selection_postcondition_failed",
      }),
    });
    observation.dispose();
    select.disabled = false;
    select.innerHTML = `<option value="late">late</option>`;
  });

  it("does not treat an asynchronous site-dispatched target event as user input", async () => {
    vi.useFakeTimers();
    const { scope, target } = fixture();
    scope.querySelector("select")!.remove();
    const observation = captureSearchFollowUp(scope, target)!;
    const verify = vi.fn();
    const pending = observation.wait({ verify });
    const outcome = pending.then(
      (controls) => ({ controls }),
      (error: unknown) => ({ error }),
    );
    setTimeout(() => {
      target.value = "verified result";
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    }, 200);
    await vi.advanceTimersByTimeAsync(800);
    expect(await outcome).toEqual({ controls: [] });
    expect(verify).toHaveBeenCalled();
    observation.dispose();
  });

  it("stops on abort and verifies peer postconditions during every observation", async () => {
    vi.useFakeTimers();
    const { scope, target } = fixture();
    const observation = captureSearchFollowUp(scope, target)!;
    const controller = new AbortController();
    const verify = vi.fn();
    const pending = observation.wait({ signal: controller.signal, verify });
    const failure = expect(pending).rejects.toThrow("aborted");
    controller.abort();
    await vi.advanceTimersByTimeAsync(50);
    await failure;
    expect(verify).toHaveBeenCalled();
    observation.dispose();
  });
});
