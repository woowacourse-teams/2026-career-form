import { describe, expect, it } from "vitest";

import { shouldShowSidePanelLauncher } from "./side-panel-launcher-visibility";

describe("side panel launcher visibility", () => {
  it("shows on application URLs and SK Careers application pages", () => {
    expect(
      shouldShowSidePanelLauncher(new URL("https://example.test/apply/form")),
    ).toBe(true);
    expect(
      shouldShowSidePanelLauncher(
        new URL("https://example.test/form?next=apply"),
      ),
    ).toBe(true);
    expect(
      shouldShowSidePanelLauncher(
        new URL("https://www.skcareers.com/Application/Index/R261876"),
      ),
    ).toBe(true);
  });

  it("hides on pages whose URL does not contain apply", () => {
    expect(
      shouldShowSidePanelLauncher(new URL("https://example.test/jobs/123")),
    ).toBe(false);
    expect(
      shouldShowSidePanelLauncher(
        new URL("https://recruit.skhynix.com/job/list"),
      ),
    ).toBe(false);
    expect(
      shouldShowSidePanelLauncher(new URL("https://www.skcareers.com/Recruit")),
    ).toBe(false);
  });
});
