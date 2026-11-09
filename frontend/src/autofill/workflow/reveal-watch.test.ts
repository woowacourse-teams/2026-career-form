import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fillableControls } from "./generic-follow-up";
import { watchRevealedFields } from "./reveal-watch";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function page() {
  document.body.innerHTML = `<section><label>병역 상태<select><option>군필</option></select></label>
    <div id="more"></div><button type="button" id="save">저장</button></section>`;
  return fillableControls(document);
}

const reveal = () => {
  document.querySelector("#more")!.innerHTML = `<label>병과<input name="specialty"></label>`;
};

async function settle(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("watching for fields the page reveals after the run", () => {
  it("reports once after new empty fields appear and the page goes quiet", async () => {
    const baseline = page();
    const onReveal = vi.fn();
    watchRevealedFields({ document, baseline, onReveal, debounceMs: 100, idleMs: 300 });
    reveal();
    await settle(500);
    expect(onReveal).toHaveBeenCalledTimes(1);
    reveal();
    await settle(500);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("waits while the user types or sits in a revealed field", async () => {
    const baseline = page();
    const onReveal = vi.fn();
    watchRevealedFields({
      document,
      baseline,
      onReveal,
      debounceMs: 100,
      idleMs: 300,
      isUserEvent: () => true,
    });
    reveal();
    const field = document.querySelector<HTMLInputElement>("[name=specialty]")!;
    field.focus();
    await settle(1_000);
    expect(onReveal).not.toHaveBeenCalled();
    field.blur();
    document.body.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(200);
    expect(onReveal).not.toHaveBeenCalled();
    await settle(400);
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("ignores fields that already hold a value", async () => {
    const baseline = page();
    const onReveal = vi.fn();
    watchRevealedFields({ document, baseline, onReveal, debounceMs: 100, idleMs: 300 });
    document.querySelector("#more")!.innerHTML = `<input name="kept" value="x">`;
    await settle(1_000);
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("reports nothing after it is stopped", async () => {
    const baseline = page();
    const onReveal = vi.fn();
    const stop = watchRevealedFields({ document, baseline, onReveal, debounceMs: 100, idleMs: 300 });
    stop();
    reveal();
    await settle(1_000);
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("stops for good when the page address changes", async () => {
    const baseline = page();
    const onReveal = vi.fn();
    let url = "https://example.test/apply";
    watchRevealedFields({
      document,
      baseline,
      onReveal,
      debounceMs: 100,
      idleMs: 300,
      currentUrl: () => url,
    });
    url = "https://example.test/next";
    reveal();
    await settle(1_000);
    expect(onReveal).not.toHaveBeenCalled();
  });
});
