import { describe, expect, it, vi } from "vitest";

import { openOptionsPage, openSidePanel } from "./navigation";

describe("extension navigation", () => {
  it("opens the options page through the runtime API", async () => {
    const runtime = { openOptionsPage: vi.fn(async () => undefined) };

    await openOptionsPage(runtime);

    expect(runtime.openOptionsPage).toHaveBeenCalledOnce();
  });

  it("opens the side panel in the current Chrome window", async () => {
    const windows = { getCurrent: vi.fn(async () => ({ id: 27 })) };
    const sidePanel = { open: vi.fn(async () => undefined) };

    await openSidePanel({ windows, sidePanel });

    expect(sidePanel.open).toHaveBeenCalledWith({ windowId: 27 });
  });

  it("reports a missing current window instead of making an invalid call", async () => {
    const windows = { getCurrent: vi.fn(async () => ({})) };
    const sidePanel = { open: vi.fn(async () => undefined) };

    await expect(openSidePanel({ windows, sidePanel })).rejects.toThrow(
      "현재 창을 확인할 수 없습니다",
    );
    expect(sidePanel.open).not.toHaveBeenCalled();
  });
});
