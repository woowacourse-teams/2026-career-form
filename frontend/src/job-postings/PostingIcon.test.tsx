import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("wxt/browser", () => ({
  browser: {
    runtime: { id: "example" },
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  },
}));
vi.mock("./favicon", () => ({ isDefaultFavicon: vi.fn(async () => false) }));
import { isDefaultFavicon } from "./favicon";
vi.mock("./site-favicon", () => ({
  cachedSiteIcon: vi.fn(async () => undefined),
  captureSiteIcon: vi.fn(async () => {}),
}));
import { cachedSiteIcon } from "./site-favicon";
import { browser } from "wxt/browser";
import { PostingIcon } from "./PostingIcon";
it("공고 URL을 Chrome 파비콘 경로에 인코딩하고 로드 후 표시한다", async () => {
  const { container } = render(
    <PostingIcon company="예시" url="https://example.com/jobs?id=1&lang=ko" />,
  );
  const img = container.querySelector("img")!;
  const src = new URL(img.src);
  expect(src.protocol).toBe("chrome-extension:");
  expect(src.pathname).toBe("/_favicon/");
  expect(src.searchParams.get("pageUrl")).toBe(
    "https://example.com/jobs?id=1&lang=ko",
  );
  expect(screen.getByText("예")).toBeInTheDocument();
  fireEvent.load(img);
  await waitFor(() => expect(screen.queryByText("예")).not.toBeInTheDocument());
});
it("이미지 로드에 실패하면 회사 첫 글자를 유지한다", () => {
  const { container } = render(
    <PostingIcon company="예시" url="https://example.com" />,
  );
  fireEvent.error(container.querySelector("img")!);
  expect(screen.getByText("예")).toBeInTheDocument();
  expect(container.querySelector("img")?.src).toBe(
    "https://example.com/favicon.ico",
  );
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toBeNull();
});
it("웹 링크가 아니면 파비콘을 요청하지 않는다", () => {
  const { container } = render(
    <PostingIcon company="예시" url="file:///private/example" />,
  );
  expect(container.querySelector("img")).toBeNull();
});

it("Chrome 기본 지구본이면 회사 첫 글자로 대체한다", async () => {
  vi.mocked(isDefaultFavicon).mockResolvedValueOnce(true);
  const { container } = render(
    <PostingIcon
      company="현대"
      url="https://talent.hyundai.com/main/main.hc"
    />,
  );
  fireEvent.load(container.querySelector("img")!);
  await waitFor(() =>
    expect(container.querySelector("img")?.src).toBe(
      "https://talent.hyundai.com/favicon.ico",
    ),
  );
  fireEvent.error(container.querySelector("img")!);
  expect(screen.getByText("현")).toBeVisible();
});

it("다른 저장소 변경이 이미 표시된 캐시 아이콘을 숨기지 않는다", async () => {
  vi.mocked(cachedSiteIcon).mockResolvedValue("data:image/png;base64,AA==");
  const { container } = render(
    <PostingIcon company="현대" url="https://example.com" />,
  );
  await waitFor(() =>
    expect(container.querySelector("img")?.src).toContain("data:image"),
  );
  fireEvent.load(container.querySelector("img")!);
  expect(screen.queryByText("현")).toBeNull();
  const listener = vi
    .mocked(browser.storage.onChanged.addListener)
    .mock.calls.at(-1)![0];
  await act(async () => {
    listener({ unrelated: { newValue: 1 } }, "local");
  });
  expect(screen.queryByText("현")).toBeNull();
});
