import { afterEach, expect, it, vi } from "vitest";
import { isDefaultFavicon } from "./favicon";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function images(different = false, fail = false) {
  vi.stubGlobal(
    "Image",
    class {
      onload = () => {};
      onerror = () => {};
      url = "";
      set src(value: string) {
        this.url = value;
        queueMicrotask(() => (fail ? this.onerror() : this.onload()));
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    let url = "";
    return {
      drawImage: (image: { url: string }) => {
        url = image.url;
      },
      getImageData: () => ({
        data: new Uint8ClampedArray(
          different && !url.includes(".invalid") ? [1, 2, 4] : [1, 2, 3],
        ),
      }),
    } as unknown as CanvasRenderingContext2D;
  });
}
it("기본 지구본과 동일한 픽셀만 제외한다", async () => {
  images();
  expect(
    await isDefaultFavicon(
      "chrome-extension://one/_favicon/?pageUrl=https://example.com&size=64",
    ),
  ).toBe(true);
});
it("실제 로고는 유지한다", async () => {
  images(true);
  expect(
    await isDefaultFavicon(
      "chrome-extension://two/_favicon/?pageUrl=https://example.com&size=64",
    ),
  ).toBe(false);
});
it("비교 실패 시 실제 로고를 숨기지 않는다", async () => {
  images(false, true);
  expect(
    await isDefaultFavicon(
      "chrome-extension://three/_favicon/?pageUrl=https://example.com&size=64",
    ),
  ).toBe(false);
});
