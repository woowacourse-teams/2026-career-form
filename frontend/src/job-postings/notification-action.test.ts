import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  click: vi.fn(),
  button: vi.fn(),
  open: vi.fn(),
  clear: vi.fn(),
  url: vi.fn(),
  recover: vi.fn().mockResolvedValue({}),
}));
vi.mock("wxt/browser", () => ({
  browser: {
    storage: { local: {} },
    runtime: {
      id: "own",
      onStartup: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
    },
    alarms: { onAlarm: { addListener: vi.fn() } },
    notifications: {
      onPermissionLevelChanged: { addListener: vi.fn() },
      onClicked: { addListener: mocks.click },
      onButtonClicked: { addListener: mocks.button },
      clear: mocks.clear,
    },
    tabs: { create: mocks.open },
  },
}));
vi.mock("./service", () => ({
  PostingService: class {
    recover = mocks.recover;
    notificationUrl = mocks.url;
  },
}));
import { installPostingBackground } from "./background";
it("지원하기 버튼은 현재 유효한 공고만 열고 다른 버튼은 무시한다", async () => {
  installPostingBackground();
  const click = mocks.button.mock.calls[0][0];
  mocks.url.mockResolvedValue("https://example.com/jobs");
  click("careerForm.job.example.1", 0);
  await vi.waitFor(() =>
    expect(mocks.open).toHaveBeenCalledWith({
      url: "https://example.com/jobs",
    }),
  );
  mocks.open.mockClear();
  mocks.url.mockResolvedValue(undefined);
  click("careerForm.job.example.1", 0);
  await vi.waitFor(() => expect(mocks.clear).toHaveBeenCalledTimes(2));
  expect(mocks.open).not.toHaveBeenCalled();
  mocks.url.mockClear();
  click("careerForm.job.example.1", 1);
  click("unrelated", 0);
  expect(mocks.url).not.toHaveBeenCalled();
});
