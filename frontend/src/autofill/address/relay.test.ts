import { describe, it, expect, vi } from "vitest";
import { createAddressRelay, type AddressPort } from "./relay";
function port(role: "top" | "frame", tabId = 1, origin?: string) {
  const messages: unknown[] = [];
  let listener: (m: unknown) => void = () => {};
  let closed: () => void = () => {};
  const url =
    origin ??
    (role === "top"
      ? "https://www.skcareers.com/Application/Index/synthetic"
      : "https://postcode.map.kakao.com/search");
  const p: AddressPort = {
    name: "cf-address-" + role,
    sender: {
      id: "extension",
      url,
      origin: new URL(url).origin,
      frameId: role === "top" ? 0 : 2,
      tab: {
        id: tabId,
        url: "https://www.skcareers.com/Application/Index/synthetic",
      },
    },
    postMessage: (m) => messages.push(m),
    disconnect: vi.fn(() => closed()),
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
  };
  return {
    p,
    messages,
    send: (m: unknown) => listener(m),
    close: () => closed(),
  };
}
const start = {
  type: "SEARCH",
  id: "run",
  expected: {
    address: "제주특별자치도 제주시 첨단로 242",
    postalCode: "63309",
  },
};
describe("address runtime relay", () => {
  it("relays only within the same tab and requires a proposal before commit", () => {
    const attach = createAddressRelay("extension"),
      top = port("top"),
      frame = port("frame"),
      other = port("frame", 2);
    [top, frame, other].forEach((x) => attach(x.p));
    top.send(start);
    expect(frame.messages).toContainEqual(start);
    expect(other.messages).toEqual([]);
    frame.send({ type: "PROPOSE", id: "run" });
    expect(top.messages).toContainEqual({ type: "PROPOSE", id: "run" });
    top.send({ type: "COMMIT", id: "run" });
    expect(frame.messages).toContainEqual({ type: "COMMIT", id: "run" });
  });
  it("rejects foreign origins and closes a run with duplicate providers", () => {
    const attach = createAddressRelay("extension"),
      bad = port("frame", 1, "https://example.test/search");
    attach(bad.p);
    expect(bad.p.disconnect).toHaveBeenCalled();
    const top = port("top"),
      a = port("frame"),
      b = port("frame");
    [top, a, b].forEach((x) => attach(x.p));
    top.send(start);
    expect(top.messages).toContainEqual({ type: "FAILED", id: "run" });
    expect(a.messages).not.toContainEqual(start);
  });
  it("cancels when top disconnects and refuses early commits", () => {
    const attach = createAddressRelay("extension"),
      top = port("top"),
      frame = port("frame");
    attach(top.p);
    attach(frame.p);
    top.send(start);
    top.send({ type: "COMMIT", id: "run" });
    expect(frame.messages).not.toContainEqual({ type: "COMMIT", id: "run" });
    top.close();
    expect(frame.messages).toContainEqual({ type: "CANCEL", id: "run" });
  });
});

it("continues one search navigation only in the original frame", () => {
  const attach = createAddressRelay("extension"),
    top = port("top"),
    initial = port("frame");
  attach(top.p);
  attach(initial.p);
  top.send(start);
  initial.close();
  expect(top.messages).not.toContainEqual({ type: "FAILED", id: "run" });
  const result = port("frame");
  attach(result.p);
  expect(result.messages).toContainEqual(start);
  result.send({ type: "PROPOSE", id: "run" });
  top.send({ type: "COMMIT", id: "run" });
  expect(result.messages).toContainEqual({ type: "COMMIT", id: "run" });
  top.close();
});
it("rejects replacement by a different frame and navigation after proposal", () => {
  const attach = createAddressRelay("extension"),
    top = port("top"),
    initial = port("frame");
  attach(top.p);
  attach(initial.p);
  top.send(start);
  initial.close();
  const other = port("frame");
  other.p.sender!.frameId = 7;
  attach(other.p);
  expect(other.messages).not.toContainEqual(start);
  expect(top.messages).toContainEqual({ type: "FAILED", id: "run" });
});
