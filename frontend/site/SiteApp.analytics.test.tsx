import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SiteApp } from "./SiteApp";

beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

it("tracks route entry once under strict effects, not policies", () => {
  const track = vi.fn();
  const view = (path: string) => (
    <StrictMode>
      <SiteApp path={path} track={track} />
    </StrictMode>
  );
  const { rerender } = render(view("/"));
  rerender(view("/"));
  rerender(view("/onboarding/"));
  fireEvent.click(screen.getByRole("button", { name: /프로필 등록 알아보기/ }));
  rerender(view("/onboarding"));
  rerender(view("/privacy/"));
  rerender(view("/terms/"));
  rerender(view("/missing/"));
  rerender(view("/"));
  expect(track.mock.calls).toEqual([
    ["landing_viewed", { surface: "site" }],
    ["onboarding_viewed", { surface: "site" }],
    ["landing_viewed", { surface: "site" }],
  ]);
});

it("tracks every landing install link on every click", () => {
  const track = vi.fn();
  render(<SiteApp path="/" track={track} />);
  const links = screen.getAllByRole("link", { name: /Chrome에 추가/ });
  links.forEach((link) => fireEvent.click(link));
  fireEvent.click(links[0]);
  expect(track.mock.calls).toEqual([
    ["landing_viewed", { surface: "site" }],
    ...Array.from({ length: links.length + 1 }, () => [
      "install_link_clicked",
      { surface: "site" },
    ]),
  ]);
});

it.each(["site", "extension_onboarding"] as const)(
  "tracks onboarding install links on %s",
  (surface) => {
    const track = vi.fn();
    render(<SiteApp path="/onboarding/" surface={surface} track={track} />);
    fireEvent.click(screen.getByRole("link", { name: /Chrome에 추가/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /프로필 등록 알아보기/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /지원서에서 사용하기/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /결과 확인 알아보기/ }));
    fireEvent.click(screen.getByRole("link", { name: /Chrome에 추가/ }));
    expect(track.mock.calls).toEqual([
      ["onboarding_viewed", { surface }],
      ["install_link_clicked", { surface }],
      ["install_link_clicked", { surface }],
    ]);
  },
);

it("keeps identity and network untouched without a site key", async () => {
  const { createSiteTracker } = await import("./analytics");
  const getItem = vi.spyOn(Storage.prototype, "getItem");
  const uuid = vi.spyOn(crypto, "randomUUID");
  const fetch = vi.fn();
  await createSiteTracker({ fetch })("landing_viewed", { surface: "site" });
  expect(getItem).not.toHaveBeenCalled();
  expect(uuid).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("lazily persists and reuses a site-only ID", async () => {
  const { createSiteTracker } = await import("./analytics");
  localStorage.clear();
  const uuid = vi
    .spyOn(crypto, "randomUUID")
    .mockReturnValue("00000000-0000-4000-8000-000000000147");
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(null, { status: 200 }),
  );
  const track = createSiteTracker({
    key: "site-key",
    host: "https://capture.example",
    fetch,
  });
  expect(uuid).not.toHaveBeenCalled();
  expect(localStorage.getItem("analyticsDistinctId")).toBeNull();
  await Promise.all([
    track("landing_viewed", { surface: "site" }),
    track("install_link_clicked", { surface: "site" }),
  ]);
  const secondTracker = createSiteTracker({ key: "site-key", fetch });
  await secondTracker("onboarding_viewed", { surface: "site" });
  expect(uuid).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(localStorage.getItem("analyticsDistinctId")).toBe(
    "00000000-0000-4000-8000-000000000147",
  );
  expect(fetch.mock.calls[0][0]).toBe("https://capture.example/i/v0/e/");
  for (const [, init] of fetch.mock.calls) {
    const payload = JSON.parse(init!.body as string);
    expect(payload.distinct_id).toBe(
      localStorage.getItem("analyticsDistinctId"),
    );
    expect(payload.properties).toEqual({
      surface: "site",
      $process_person_profile: false,
    });
  }
  localStorage.clear();
});

it("contains storage and network failures without rejecting actions", async () => {
  const { createSiteTracker } = await import("./analytics");
  const fetch = vi.fn(async () => {
    throw new Error("offline");
  });
  const track = createSiteTracker({ key: "site-key", fetch });
  await expect(
    track("landing_viewed", { surface: "site" }),
  ).resolves.toBeUndefined();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  await expect(
    track("install_link_clicked", { surface: "site" }),
  ).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledOnce();
});

it("wires the installed extension onboarding entrypoint to extension telemetry", async () => {
  const extensionTracker = await import("../src/analytics/extension-tracker");
  const track = vi
    .spyOn(extensionTracker, "trackExtensionEvent")
    .mockImplementation(() => {});
  const { App } = await import("../entrypoints/onboarding/App");
  const { rerender } = render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /자동 기입 준비하기/ }));
  fireEvent.click(screen.getByRole("button", { name: /프로필 등록 알아보기/ }));
  fireEvent.click(screen.getByRole("button", { name: /지원서에서 사용하기/ }));
  rerender(<App />);
  expect(track.mock.calls).toEqual([
    ["onboarding_viewed", { surface: "extension_onboarding" }],
  ]);
});

it("keeps the embedded demo panel inert even when extension tracking is configured", async () => {
  const extensionTracker = await import("../src/analytics/extension-tracker");
  const track = vi
    .spyOn(extensionTracker, "trackExtensionEvent")
    .mockImplementation(() => {});
  const { PanelPreview } = await import("./demo/PanelPreview");
  render(<PanelPreview />);
  const copy = await screen.findAllByRole("button", { name: /복사/ });
  fireEvent.click(copy[0]);
  fireEvent.click(screen.getByRole("button", { name: "프로필 관리" }));
  fireEvent.click(screen.getByRole("button", { name: "자동 기입" }));
  expect(track).not.toHaveBeenCalled();
});
