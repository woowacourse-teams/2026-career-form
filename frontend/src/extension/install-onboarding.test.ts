import { expect, it } from "vitest";
import { openInstalledOnboarding } from "./install-onboarding";
it("opens one onboarding tab on install but not update or browser restart", async () => {
  const tabs: string[] = [];
  const open = async () => {
    tabs.push("onboarding.html");
  };
  await openInstalledOnboarding("install", open);
  expect(tabs).toEqual(["onboarding.html"]);
  await openInstalledOnboarding("update", open);
  await openInstalledOnboarding("chrome_update", open);
  expect(tabs).toEqual(["onboarding.html"]);
});
