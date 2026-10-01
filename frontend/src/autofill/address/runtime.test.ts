import { describe, it, expect } from "vitest";
import { createAddressSearch } from "./runtime";
import type { AddressPort } from "./relay";
function port() {
  const sent: Record<string, unknown>[] = [];
  let listener: (m: unknown) => void = () => {};
  let closed = () => {};
  return {
    sent,
    receive: (m: unknown) => listener(m),
    port: {
      name: "cf-address-top",
      postMessage: (m) => sent.push(m as Record<string, unknown>),
      disconnect: () => closed(),
      onMessage: {
        addListener: (f) => {
          listener = f;
        },
      },
      onDisconnect: {
        addListener: (f) => {
          closed = f;
        },
      },
    },
  } satisfies {
    sent: Record<string, unknown>[];
    receive: (m: unknown) => void;
    port: AddressPort;
  };
}
describe("address runtime client", () => {
  it("commits only after current page validation and resolves selection", async () => {
    const p = port();
    let checked = false;
    const result = createAddressSearch(() => p.port)(
      { address: "공개 예시", postalCode: "12345" },
      async () => {
        checked = true;
        return true;
      },
      new AbortController().signal,
    );
    expect(p.sent[0]?.type).toBe("SEARCH");
    const id = p.sent[0]?.id;
    p.receive({ type: "PROPOSE", id });
    await Promise.resolve();
    await Promise.resolve();
    expect(checked).toBe(true);
    expect(p.sent).toContainEqual({ type: "COMMIT", id });
    p.receive({ type: "SELECTED", id });
    expect(await result).toBe(true);
  });
  it("cancels when validation fails or the caller aborts", async () => {
    const p = port(),
      abort = new AbortController();
    const result = createAddressSearch(() => p.port)(
      { address: "공개 예시", postalCode: "12345" },
      async () => false,
      abort.signal,
    );
    const id = p.sent[0]?.id;
    p.receive({ type: "PROPOSE", id });
    await Promise.resolve();
    await Promise.resolve();
    abort.abort();
    expect(await result).toBe(false);
    expect(p.sent).not.toContainEqual({ type: "COMMIT", id });
  });
});
