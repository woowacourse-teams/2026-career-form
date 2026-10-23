/** Source-derived site handler: 1s .val() polling, plain click, nested HTML Confirm.
 * Synthetic values only; this does not claim a live-browser evaluation. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  mountAddress,
  addressExpected,
} from "./__fixtures__/hplace-mrs2-address.synthetic";
import { installExecutionPolicy } from "../workflow/execution-policy";
import { setAutofillDebugEnabled } from "../debug/autofill-debug";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  installExecutionPolicy(document);
  setAutofillDebugEnabled(false);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function finish(s: ReturnType<typeof mountAddress>) {
  const result = s.run();
  await vi.advanceTimersByTimeAsync(6500);
  return result;
}
const success =
  "[CareerForm] stage name=address collected=0 accepted=0 rejected=0 planned=1 executed=1";
const failure = (reason: string, step: string) =>
  `[CareerForm] skip stage=address key=hplace.mrs2.currentAddress.search reason=${reason} detail=${step}`;
it("waits for the site's 1s poll then uses plain click and nested Confirm before triple readback", async () => {
  setAutofillDebugEnabled(true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal("PointerEvent", undefined);
  const s = mountAddress({
    liveHandler: true,
    onEvent(name) {
      if (["details", "click", "ok"].includes(name))
        expect(log.mock.calls.flat()).not.toContain(success);
    },
  });
  const result = s.run();
  await vi.advanceTimersByTimeAsync(999);
  expect(s.events).not.toContain("click");
  expect(s.inputs().map((e) => e.value)).toEqual(["", "", ""]);
  await vi.advanceTimersByTimeAsync(1001);
  expect(await result).toMatchObject({ status: "written" });
  expect(s.inputs().map((e) => e.value)).toEqual([
    "00001",
    "서울특별시 가상구 가상새봄로 50",
    "가상동 101호",
  ]);
  expect(document.querySelector("#modal,#wrapDialog")).toBeNull();
  expect(log.mock.calls.filter(([line]) => line === success)).toHaveLength(1);
  expect(
    s.events.filter((e) =>
      ["click", "ok", "forbidden", "form-submit"].includes(e),
    ),
  ).toEqual(["click", "ok"]);
});
it.each([
  [{ results: [] }, "result-not-unique", "result-selection"],
  [
    { results: [addressExpected, addressExpected] },
    "result-not-unique",
    "result-selection",
  ],
  [{ stageWrong: true }, "result-click-no-effect", "result-staging"],
  [{ submitDisabled: true }, "submit-disabled-timeout", "submit-ready"],
  [{ noPointerResponse: true }, "submit-no-effect", "submit-activation"],
  [{ confirm: "missing" }, "confirm-missing", "confirm-lookup"],
  [{ confirm: "duplicate" }, "confirm-ambiguous", "confirm-lookup"],
  [{ confirm: "wrong" }, "staging-mismatch", "confirm-contract"],
  [{ keepModal: true }, "readback-mismatch", "commit-readback"],
] as const)(
  "diagnoses and closes owned UI for %j",
  async (options, reason, step) => {
    setAutofillDebugEnabled(true);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const s = mountAddress({ ...options, liveHandler: true });
    expect(await finish(s)).toMatchObject({ status: "manual" });
    expect(log.mock.calls.flat()).toContain(failure(reason, step));
    expect(log.mock.calls.flat()).not.toContain(success);
    expect(document.querySelector("#modal,#wrapDialog")).toBeNull();
    if (!("keepModal" in options))
      expect(s.inputs().map((e) => e.value)).toEqual(["", "", ""]);
    for (const args of log.mock.calls) {
      expect(args).toHaveLength(1);
      expect(args[0]).toMatch(
        /^\[CareerForm\] (skip|stage) (?:[A-Za-z][A-Za-z0-9_]*=[^\s=]+)(?: [A-Za-z][A-Za-z0-9_]*=[^\s=]+)*$/,
      );
      for (const value of Object.values(addressExpected))
        expect(args[0]).not.toContain(value);
    }
  },
);
it("reports cleanup failure when the captured site's close control has no effect", async () => {
  setAutofillDebugEnabled(true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const s = mountAddress({
    liveHandler: true,
    submitDisabled: true,
    brokenClose: true,
  });
  expect(await finish(s)).toMatchObject({ status: "manual" });
  expect(log.mock.calls.flat()).toContain(
    failure("cleanup-failed", "modal-close"),
  );
  expect(s.inputs().map((e) => e.value)).toEqual(["", "", ""]);
});
it("does not print diagnostics with debugging off", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  expect(
    await finish(mountAddress({ liveHandler: true, submitDisabled: true })),
  ).toMatchObject({ status: "manual" });
  expect(log).not.toHaveBeenCalled();
});

it.each([false, true])(
  "selects only address_info after asynchronous results with wrapper replacement=%s",
  async (replaceResultHost) => {
    const expected = {
      ...addressExpected,
      address: "서울특별시 중구 세종대로 110",
    };
    const s = mountAddress({
      liveHandler: true,
      results: [{ ...expected, address: "서울특별시\u00a0중구  세종대로 110" }],
      extraInfo: "(태평로1가 31)",
      resultDelay: 250,
      replaceResultHost,
      loadingRow: !replaceResultHost,
    });
    s.setCurrent(expected);
    const result = s.run(expected);
    await vi.advanceTimersByTimeAsync(240);
    expect(s.events).not.toContain("select");
    await vi.advanceTimersByTimeAsync(4000);
    expect(await result).toMatchObject({ status: "written" });
    expect(s.events.filter((e) => e === "select")).toHaveLength(1);
    expect(s.inputs().map((e) => e.value)).toEqual([
      "00001",
      "서울특별시\u00a0중구  세종대로 110",
      "가상동 101호",
    ]);
    expect(document.querySelector("#modal,#wrapDialog")).toBeNull();
  },
);

it("waits for an asynchronously growing result list to stabilise before uniqueness and native selection", async () => {
  setAutofillDebugEnabled(true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const s = mountAddress({
    liveHandler: true,
    resultDelay: 250,
    duplicateDelay: 20,
  });
  expect(await finish(s)).toMatchObject({ status: "manual" });
  expect(s.events).not.toContain("select");
  expect(log.mock.calls.flat()).toContain(
    failure("result-not-unique", "result-selection"),
  );
  expect(document.querySelector("#modal,#wrapDialog")).toBeNull();
  expect(s.inputs().map((e) => e.value)).toEqual(["", "", ""]);
});

it("waits for the captured owned Confirm to become visible without adopting another dialog", async () => {
  const s = mountAddress({ liveHandler: true, confirmRevealDelay: 60 });
  expect(await finish(s)).toMatchObject({ status: "written" });
  expect(document.querySelector("#modal,#wrapDialog")).toBeNull();
  expect(s.events.filter((e) => e === "ok")).toHaveLength(1);
});
