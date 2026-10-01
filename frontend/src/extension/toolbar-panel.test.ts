import { expect, it, vi } from "vitest";
import { openToolbarPanel } from "./toolbar-panel";

it("opens the same in-page panel in the clicked web tab without an intermediate popup", async () => {
  const openPanel = vi.fn(async (_id: number) => {});
  const openProfile = vi.fn(async () => {});
  await openToolbarPanel(
    { id: 7, url: "https://example.test/application" },
    { openPanel, openProfile },
  );
  expect(openPanel).toHaveBeenCalledWith(7);
  expect(openProfile).not.toHaveBeenCalled();
});
it("opens profile registration on restricted pages or when injection fails", async () => {
  const openPanel = vi.fn(async () => {
    throw new Error("unavailable");
  });
  const openProfile = vi.fn(async () => {});
  await openToolbarPanel(
    { id: 7, url: "chrome://extensions" },
    { openPanel, openProfile },
  );
  expect(openPanel).not.toHaveBeenCalled();
  await openToolbarPanel(
    { id: 8, url: "https://example.test/" },
    { openPanel, openProfile },
  );
  expect(openProfile).toHaveBeenCalledTimes(2);
});
