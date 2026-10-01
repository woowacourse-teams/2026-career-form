import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { attachKakaoProvider } from "./provider";
import type { AddressPort } from "./relay";
const expected = {
  address: "제주특별자치도 제주시 첨단로 242",
  postalCode: "63309",
};
function setup() {
  document.body.innerHTML =
    '<form id="searchForm"><input id="region_name" name="region_name"><button type="button" class="btn_search">검색</button><input id="cQuery" type="hidden"></form><ul></ul><div class="paging_post">현재페이지1 / 1</div>';
  let listener: (m: unknown) => void = () => {};
  let disconnect = () => {};
  const messages: unknown[] = [];
  const port: AddressPort = {
    name: "cf-address-frame",
    postMessage: (m) => messages.push(m),
    disconnect: () => disconnect(),
    onMessage: {
      addListener: (f) => {
        listener = f;
      },
    },
    onDisconnect: {
      addListener: (f) => {
        disconnect = f;
      },
    },
  };
  let selections = 0;
  document.querySelector(".btn_search")!.addEventListener("click", () => {
    (document.querySelector("#cQuery") as HTMLInputElement).value =
      expected.address;
    document.querySelector("ul")!.innerHTML =
      '<li class="list_post_item" data-zonecode="63309"><span class="txt_postcode">63309</span><button class="link_post"><span class="txt_addr">' +
      expected.address +
      "</span></button></li>";
    document
      .querySelector(".link_post")!
      .addEventListener("click", () => selections++);
  });
  attachKakaoProvider(document, port);
  return {
    send: (m: unknown) => listener(m),
    messages,
    port,
    selections: () => selections,
  };
}
describe("postcode provider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("searches the base address and waits for commit before selecting", async () => {
    const p = setup();
    p.send({ type: "SEARCH", id: "run", expected });
    await vi.advanceTimersByTimeAsync(200);
    expect(
      (document.querySelector("#region_name") as HTMLInputElement).value,
    ).toBe(expected.address);
    expect(p.messages).toContainEqual({ type: "PROPOSE", id: "run" });
    expect(p.selections()).toBe(0);
    p.send({ type: "COMMIT", id: "run" });
    expect(p.selections()).toBe(1);
    expect(p.messages).toContainEqual({ type: "SELECTED", id: "run" });
    p.send({ type: "COMMIT", id: "run" });
    expect(p.selections()).toBe(1);
  });
  it("never selects after cancellation or replaced results", async () => {
    const p = setup();
    p.send({ type: "SEARCH", id: "run", expected });
    await vi.advanceTimersByTimeAsync(200);
    document.querySelector(".txt_addr")!.textContent = "다른 주소";
    p.send({ type: "COMMIT", id: "run" });
    expect(p.selections()).toBe(0);
    expect(p.messages).toContainEqual({ type: "FAILED", id: "run" });
    p.send({ type: "CANCEL", id: "run" });
    await vi.advanceTimersByTimeAsync(9000);
    expect(p.selections()).toBe(0);
  });
  it("times out with no candidate and stops on disconnection", async () => {
    const p = setup();
    document
      .querySelector(".btn_search")!
      .replaceWith(document.querySelector(".btn_search")!.cloneNode(true));
    p.send({ type: "SEARCH", id: "run", expected });
    await vi.advanceTimersByTimeAsync(8100);
    expect(p.messages).toContainEqual({ type: "FAILED", id: "run" });
    expect(p.selections()).toBe(0);
    p.port.disconnect();
  });
});

it("uses the loaded result document without submitting the same query again", async () => {
  vi.useFakeTimers();
  try {
    const p = setup();
    (document.querySelector("#region_name") as HTMLInputElement).value =
      expected.address;
    (document.querySelector(".btn_search") as HTMLButtonElement).click();
    let submissions = 0;
    document
      .querySelector(".btn_search")!
      .addEventListener("click", () => submissions++);
    p.send({ type: "SEARCH", id: "run", expected });
    await vi.advanceTimersByTimeAsync(200);
    expect(submissions).toBe(0);
    expect(p.messages).toContainEqual({ type: "PROPOSE", id: "run" });
    p.send({ type: "CANCEL", id: "run" });
  } finally {
    vi.useRealTimers();
  }
});
