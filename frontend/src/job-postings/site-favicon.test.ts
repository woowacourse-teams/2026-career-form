import { afterEach, expect, it, vi } from "vitest";
vi.mock("wxt/browser", () => ({
  browser: {
    permissions: { request: vi.fn(), contains: vi.fn() },
    storage: { local: { set: vi.fn(), get: vi.fn() } },
  },
}));
import { browser } from "wxt/browser";
import { captureSiteIcon, iconCandidates } from "./site-favicon";
it("상대 파비콘 주소와 shortcut icon을 실제 페이지 주소로 해석한다", () => {
  expect(
    iconCandidates(
      '<link rel="shortcut icon" href="../assets/logo.ico">',
      "https://jobs.example.com/main/jobs",
    ),
  ).toEqual([
    "https://jobs.example.com/assets/logo.ico",
    "https://jobs.example.com/favicon.ico",
  ]);
});
it("스크립트 주소와 외부 도메인은 요청하지 않고 기본 경로를 시도한다", () => {
  expect(
    iconCandidates(
      '<link rel="icon" href="javascript:alert(1)"><link rel="icon" href="https://other.example/icon.png">',
      "https://jobs.example.com/jobs",
    ),
  ).toEqual(["https://jobs.example.com/favicon.ico"]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("저장 시 허용된 사이트의 아이콘을 내려받아 로컬에 보관한다", async () => {
  vi.mocked(browser.permissions.contains).mockImplementation(
    () => Promise.resolve(true) as never,
  );
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('<link rel="icon" href="/logo.png">'))
    .mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(["png"], { type: "image/png" }),
    });
  vi.stubGlobal("fetch", fetcher);
  await captureSiteIcon("https://jobs.example.com/post/1");
  expect(browser.permissions.contains).toHaveBeenCalledWith({
    origins: ["https://jobs.example.com/*"],
  });
  expect(browser.permissions.request).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[1][0]).toBe("https://jobs.example.com/logo.png");
  expect(browser.storage.local.set).toHaveBeenCalledWith({
    "careerForm.siteIcon.https://jobs.example.com/post/1":
      expect.stringMatching(/^data:image\/png;base64,/),
  });
});
it("권한 거절 시 페이지를 요청하지 않고 정상 종료한다", async () => {
  vi.mocked(browser.permissions.contains).mockImplementation(
    () => Promise.resolve(false) as never,
  );
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    captureSiteIcon("https://jobs.example.com/post/1"),
  ).resolves.toBeUndefined();
  expect(fetcher).not.toHaveBeenCalled();
});

it("새로고침 재수집은 이미 허용된 권한만 확인하고 권한창을 띄우지 않는다", async () => {
  vi.mocked(browser.permissions.contains).mockImplementation(
    () => Promise.resolve(false) as never,
  );
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await captureSiteIcon("https://jobs.example.com/jobs", false);
  expect(browser.permissions.contains).toHaveBeenCalled();
  expect(browser.permissions.request).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
