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

    expect(scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 27 },
      files: ["content-scripts/autofill.js"],
    });
    expect(tabs.sendMessage).toHaveBeenCalledTimes(2);
  });
});
