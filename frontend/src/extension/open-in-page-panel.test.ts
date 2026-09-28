import { describe, expect, it, vi } from "vitest";

import { openInPagePanel } from "./open-in-page-panel";

describe("openInPagePanel", () => {
  it("opens the panel in the active tab when its content script is ready", async () => {
    const tabs = {
      query: vi.fn(async () => [{ id: 27 }]),
      sendMessage: vi.fn(async () => undefined),
    };
    const scripting = { executeScript: vi.fn(async () => undefined) };

    await openInPagePanel({ tabs, scripting });

    expect(tabs.sendMessage).toHaveBeenCalledWith(27, {
      type: "career-form:open-in-page-profile-panel",
    });
    expect(scripting.executeScript).not.toHaveBeenCalled();
  });

  it("injects the content script and retries when the page has no listener yet", async () => {
    const tabs = {
      query: vi.fn(async () => [{ id: 27 }]),
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(new Error("Could not establish connection"))
        .mockResolvedValueOnce(undefined),
    };
    const scripting = { executeScript: vi.fn(async () => undefined) };

    await openInPagePanel({ tabs, scripting });

    expect(scripting.executeScript).toHaveBeenNthCalledWith(1, {
      target: { tabId: 27, allFrames: true },
      files: ["content-scripts/verified-js-result-main.js"],
      world: "MAIN",
    });
    expect(scripting.executeScript).toHaveBeenNthCalledWith(2, {
      target: { tabId: 27 },
      files: ["content-scripts/autofill.js"],
    });
    expect(tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("still opens the panel when a frame refuses the MAIN-world bridge", async () => {
    const tabs = {
      query: vi.fn(async () => [{ id: 27 }]),
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(new Error("Could not establish connection"))
        .mockResolvedValueOnce(undefined),
    };
    const scripting = {
      executeScript: vi
        .fn()
        .mockRejectedValueOnce(new Error("Cannot access contents of the page"))
        .mockRejectedValueOnce(new Error("Cannot access contents of the page"))
        .mockResolvedValueOnce(undefined),
    };

    await openInPagePanel({ tabs, scripting });

    expect(scripting.executeScript).toHaveBeenNthCalledWith(2, {
      target: { tabId: 27 },
      files: ["content-scripts/verified-js-result-main.js"],
      world: "MAIN",
    });
    expect(scripting.executeScript).toHaveBeenLastCalledWith({
      target: { tabId: 27 },
      files: ["content-scripts/autofill.js"],
    });
    expect(tabs.sendMessage).toHaveBeenCalledTimes(2);
  });
});
