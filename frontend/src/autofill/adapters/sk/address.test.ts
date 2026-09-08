import { beforeEach, describe, it, expect } from "vitest";
import { runSkAddress } from "./address";
const expected = {
  address: "제주특별자치도 제주시 첨단로 242",
  postalCode: "63309",
  detail: "공개 예시",
};
function setup() {
  document.body.innerHTML =
    '<div id="applyContentUserInfo"><button id="btnSearchAddress" type="button">우편번호 찾기</button><input id="prsZipCode" name="prsZipCode" readonly><input id="prsAddress" name="prsAddress" readonly><input id="prsAddressDtl" name="prsAddressDtl"></div><div id="layer" style="display:none"><iframe title="우편번호서비스 레이어 프레임"></iframe></div>';
  const button = document.querySelector("#btnSearchAddress")!;
  button.addEventListener("click", () => {
    (document.querySelector("#layer") as HTMLElement).style.display = "block";
  });
  return button;
}
describe("SK address selection", () => {
  beforeEach(() => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(options: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://www.skcareers.com/Application/Index/synthetic",
    });
  });
  it("writes detail only after the site callback confirms postal code and base address", async () => {
    const button = setup();
    let searches = 0;
    const result = await runSkAddress({
      document,
      button,
      expected,
      loadCurrent: async () => expected,
      signal: new AbortController().signal,
      search: async (actual, validate) => {
        searches++;
        expect(actual).toEqual({
          address: expected.address,
          postalCode: expected.postalCode,
        });
        expect(await validate()).toBe(true);
        (document.querySelector("#prsZipCode") as HTMLInputElement).value =
          expected.postalCode;
        (document.querySelector("#prsAddress") as HTMLInputElement).value =
          expected.address;
        (document.querySelector("#layer") as HTMLElement).style.display =
          "none";
        return true;
      },
    });
    expect(result.status).toBe("written");
    expect(searches).toBe(1);
    expect(
      (document.querySelector("#prsAddressDtl") as HTMLInputElement).value,
    ).toBe(expected.detail);
    expect(
      (document.querySelector("#prsAddress") as HTMLInputElement).readOnly,
    ).toBe(true);
  });
  it("preserves existing conflicts without opening or searching", async () => {
    const button = setup();
    (document.querySelector("#prsAddressDtl") as HTMLInputElement).value =
      "기존 입력";
    let searched = false;
    await runSkAddress({
      document,
      button,
      expected,
      loadCurrent: async () => expected,
      signal: new AbortController().signal,
      search: async () => {
        searched = true;
        return true;
      },
    });
    expect(searched).toBe(false);
    expect(
      (document.querySelector("#layer") as HTMLElement).style.display,
    ).toBe("none");
  });
  it("rejects profile changes, replaced controls and cancellation before selection", async () => {
    for (const change of ["profile", "target", "abort"]) {
      const button = setup(),
        abort = new AbortController();
      let current = expected;
      await runSkAddress({
        document,
        button,
        expected,
        loadCurrent: async () => current,
        signal: abort.signal,
        search: async (_e, validate) => {
          if (change === "profile") current = { ...expected, detail: "변경" };
          if (change === "target")
            document
              .querySelector("#prsAddress")!
              .replaceWith(document.querySelector("#prsAddress")!.cloneNode());
          if (change === "abort") abort.abort();
          expect(await validate()).toBe(false);
          return false;
        },
      });
      expect(
        (document.querySelector("#prsAddressDtl") as HTMLInputElement).value,
      ).toBe("");
    }
  });
});

it("accepts the provider-verified road callback without its legal-dong reference", async () => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/synthetic",
  });
  const button = setup();
  const profile = { ...expected, address: expected.address + " (영평동)" };
  const result = await runSkAddress({
    document,
    button,
    expected: profile,
    loadCurrent: async () => profile,
    signal: new AbortController().signal,
    search: async (_expected, maySelect) => {
      expect(await maySelect()).toBe(true);
      document.querySelector<HTMLInputElement>("#prsZipCode")!.value =
        expected.postalCode;
      document.querySelector<HTMLInputElement>("#prsAddress")!.value =
        expected.address;
      document.querySelector<HTMLElement>("#layer")!.style.display = "none";
      return true;
    },
  });
  expect(result.status).toBe("written");
  expect(
    document.querySelector<HTMLInputElement>("#prsAddressDtl")!.value,
  ).toBe(profile.detail);
  expect(
    document.querySelector<HTMLInputElement>("#prsAddress")!.readOnly,
  ).toBe(true);
});

it("closes only its unchanged failed search through the owned normal close control", async () => {
  (
    globalThis as unknown as {
      jsdom: { reconfigure(o: { url: string }): void };
    }
  ).jsdom.reconfigure({
    url: "https://www.skcareers.com/Application/Index/synthetic",
  });
  const button = setup();
  const layer = document.querySelector<HTMLElement>("#layer")!;
  const close = document.createElement("img");
  close.id = "btnCloseLayer";
  close.alt = "닫기 버튼";
  close.addEventListener("click", () => {
    layer.style.display = "none";
  });
  layer.append(close);
  const result = await runSkAddress({
    document,
    button,
    expected,
    loadCurrent: async () => expected,
    signal: new AbortController().signal,
    search: async () => false,
  });
  expect(result.status).toBe("manual");
  expect(layer.style.display).toBe("none");
  expect(
    document.querySelector<HTMLInputElement>("#prsAddressDtl")!.value,
  ).toBe("");
});

it.each(["value", "profile", "close", "layer"])(
  "leaves a failed layer alone when its %s changes",
  async (change) => {
    (
      globalThis as unknown as {
        jsdom: { reconfigure(o: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://www.skcareers.com/Application/Index/synthetic",
    });
    const button = setup();
    const layer = document.querySelector<HTMLElement>("#layer")!;
    const close = document.createElement("img");
    close.id = "btnCloseLayer";
    close.addEventListener("click", () => {
      layer.style.display = "none";
    });
    layer.append(close);
    let current = expected;
    await runSkAddress({
      document,
      button,
      expected,
      loadCurrent: async () => current,
      signal: new AbortController().signal,
      search: async () => {
        if (change === "value")
          document.querySelector<HTMLInputElement>("#prsAddressDtl")!.value =
            "사용자 변경";
        if (change === "profile")
          current = { ...expected, detail: "프로필 변경" };
        if (change === "close") close.replaceWith(close.cloneNode(true));
        if (change === "layer") layer.replaceWith(layer.cloneNode(true));
        return false;
      },
    });
    expect(document.querySelector<HTMLElement>("#layer")!.style.display).toBe(
      "block",
    );
  },
);
