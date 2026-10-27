import { afterEach, describe, expect, it, vi } from "vitest";
import { runKakaoAddress } from "./kakao-executor";
import type { AddressSearch } from "./types";

const expected = {
  address: "제주특별자치도 제주시 첨단로 242",
  postalCode: "63309",
  detail: "공개 예시",
};

function setup(withPostcode: boolean) {
  document.body.innerHTML = `<div class="row">${withPostcode ? '<input id="zip" readonly>' : ""}<input id="road" readonly><button type="button" id="find">우편번호 찾기</button><label><input type="checkbox"> 해외 거주</label><input id="detail"></div><div class="modal" style="display:none"><iframe src="https://postcode.map.kakao.com/search"></iframe></div>`;
  const button = document.querySelector("#find")!;
  button.addEventListener("click", () => {
    document.querySelector<HTMLElement>(".modal")!.style.display = "block";
  });
  const input = (id: string) => document.querySelector<HTMLInputElement>(id);
  return {
    button,
    targets: {
      ...(withPostcode ? { postalCode: input("#zip")! } : {}),
      address: input("#road")!,
      detail: input("#detail")!,
    },
  };
}

const siteCallback =
  (withPostcode: boolean, suffix = ""): AddressSearch =>
  async (actual, maySelect, _signal, selected) => {
    expect(await maySelect()).toBe(true);
    selected?.(actual);
    if (withPostcode)
      document.querySelector<HTMLInputElement>("#zip")!.value =
        actual.postalCode;
    document.querySelector<HTMLInputElement>("#road")!.value =
      actual.address + suffix;
    document.querySelector<HTMLElement>(".modal")!.style.display = "none";
    return true;
  };

describe("generic Kakao address targets without a site policy", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the detail only after the site finishes resetting it", async () => {
    vi.useFakeTimers();
    const { button, targets } = setup(false);
    const run = runKakaoAddress({
      document,
      button,
      expected,
      loadCurrent: async () => expected,
      signal: new AbortController().signal,
      search: async (actual, maySelect, signal, selected) => {
        const done = await siteCallback(false)(actual, maySelect, signal, selected);
        // The site finalizes its own form state a moment after the callback.
        setTimeout(() => {
          targets.detail.value = "";
        }, 300);
        return done;
      },
      targets,
    });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await run;
    expect(result.status).toBe("written");
    expect(targets.detail.value).toBe(expected.detail);
  });

  it("reports manual when the site clears the written detail afterwards", async () => {
    vi.useFakeTimers();
    const { button, targets } = setup(false);
    let cleared = false;
    targets.detail.addEventListener("input", () => {
      if (cleared) return;
      cleared = true;
      setTimeout(() => {
        targets.detail.value = "";
      }, 100);
    });
    const run = runKakaoAddress({
      document,
      button,
      expected,
      loadCurrent: async () => expected,
      signal: new AbortController().signal,
      search: siteCallback(false),
      targets,
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect((await run).status).toBe("manual");
  });

  it.each([true, false])(
    "writes the detail after the site callback (postcode input: %s)",
    async (withPostcode) => {
      const { button, targets } = setup(withPostcode);
      const result = await runKakaoAddress({
        document,
        button,
        expected,
        loadCurrent: async () => expected,
        signal: new AbortController().signal,
        search: siteCallback(withPostcode),
        targets,
      });
      expect(result.status).toBe("written");
      expect(targets.detail.value).toBe(expected.detail);
    },
  );

  it("writes postcode and road address and reports the missing detail field", async () => {
    const { button, targets } = setup(true);
    const { detail, ...withoutDetail } = targets;
    detail.remove();
    const result = await runKakaoAddress({
      document,
      button,
      expected,
      loadCurrent: async () => expected,
      signal: new AbortController().signal,
      search: siteCallback(true),
      targets: withoutDetail,
    });
    expect(result.status).toBe("written");
    expect(result.reason).toContain("상세주소 칸이 없어");
    expect(withoutDetail.address.value).toBe(expected.address);
    expect(detail.value).toBe("");
  });

  it("accepts a callback that appends the road reference", async () => {
    const { button, targets } = setup(false);
    const result = await runKakaoAddress({
      document,
      button,
      expected,
      loadCurrent: async () => expected,
      signal: new AbortController().signal,
      search: siteCallback(false, " (영평동)"),
      targets,
    });
    expect(result.status).toBe("written");
  });

  it("stays manual without a policy or targets", async () => {
    const { button } = setup(false);
    let searched = false;
    const result = await runKakaoAddress({
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
    expect(result.status).toBe("manual");
    expect(searched).toBe(false);
  });

  it("preserves a different existing address without opening the search", async () => {
    const { button, targets } = setup(false);
    targets.detail.value = "기존 입력";
    let searched = false;
    const result = await runKakaoAddress({
      document,
      button,
      expected,
      loadCurrent: async () => expected,
      signal: new AbortController().signal,
      search: async () => {
        searched = true;
        return true;
      },
      targets,
    });
    expect(result.status).toBe("manual");
    expect(searched).toBe(false);
    expect(targets.detail.value).toBe("기존 입력");
  });

  it("does not write the detail when the callback leaves another address", async () => {
    const { button, targets } = setup(false);
    const result = await runKakaoAddress({
      document,
      button,
      expected,
      loadCurrent: async () => expected,
      signal: new AbortController().signal,
      search: async (actual, maySelect, _signal, selected) => {
        expect(await maySelect()).toBe(true);
        selected?.(actual);
        targets.address.value = "서울특별시 다른로 1";
        return true;
      },
      targets,
    });
    expect(result.status).toBe("manual");
    expect(targets.detail.value).toBe("");
  });

  it("rejects a replaced target before selection", async () => {
    const { button, targets } = setup(false);
    const result = await runKakaoAddress({
      document,
      button,
      expected,
      loadCurrent: async () => expected,
      signal: new AbortController().signal,
      search: async (_actual, maySelect) => {
        targets.address.replaceWith(targets.address.cloneNode());
        expect(await maySelect()).toBe(false);
        return false;
      },
      targets,
    });
    expect(result.status).toBe("manual");
    expect(targets.detail.value).toBe("");
  });
});
