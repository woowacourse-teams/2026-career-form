import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PANEL_FONT_PATH } from "./panel-font-path";

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: { id: "test" },
  },
}));

const fontBytes = new ArrayBuffer(8);
const faces = vi.fn();
const add = vi.fn();
const fetchFont = vi.fn();
const warn = vi.fn();

class FakeFontFace {
  loaded = false;
  constructor(
    readonly family: string,
    readonly source: ArrayBuffer,
    readonly descriptors: FontFaceDescriptors,
  ) {
    faces(this);
  }
  async load() {
    this.loaded = true;
    return this;
  }
}

async function freshLoader() {
  vi.resetModules();
  return (await import("./panel-font")).loadPanelFont;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchFont.mockResolvedValue(new Response(fontBytes));
  vi.stubGlobal("fetch", fetchFont);
  vi.stubGlobal("FontFace", FakeFontFace);
  vi.spyOn(console, "warn").mockImplementation(warn);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { add },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "fonts");
});

describe("loadPanelFont", () => {
  it("adds the packaged font from its bytes once across repeated mounts", async () => {
    const loadPanelFont = await freshLoader();
    const styleCount = document.querySelectorAll("style").length;

    await Promise.all([loadPanelFont(), loadPanelFont()]);
    await loadPanelFont();

    expect(fetchFont).toHaveBeenCalledTimes(1);
    expect(fetchFont).toHaveBeenCalledWith(
      `chrome-extension://test/${PANEL_FONT_PATH}`,
    );
    expect(add).toHaveBeenCalledTimes(1);
    const face = add.mock.calls[0]![0] as FakeFontFace;
    expect(face.family).toBe("Pretendard Variable");
    expect(face.descriptors).toEqual({ weight: "45 920", style: "normal" });
    expect(face.source.byteLength).toBe(fontBytes.byteLength);
    expect(face.loaded).toBe(true);
    expect(document.querySelectorAll("style")).toHaveLength(styleCount);
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps the system font and warns once when the fetch fails", async () => {
    fetchFont.mockRejectedValue(new TypeError("page-specific failure detail"));
    const loadPanelFont = await freshLoader();

    await expect(loadPanelFont()).resolves.toBeUndefined();
    await expect(loadPanelFont()).resolves.toBeUndefined();

    expect(fetchFont).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain("page-specific");
  });

  it("treats a missing font file as a failed load", async () => {
    fetchFont.mockResolvedValue(new Response(null, { status: 404 }));
    const loadPanelFont = await freshLoader();

    await loadPanelFont();

    expect(faces).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
