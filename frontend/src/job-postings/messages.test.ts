import { expect, it } from "vitest";
import { parsePostingMessage, isPostingPage } from "./messages";
it("잘못된 메시지와 외부 URL의 쓰기 권한을 거부한다", () => {
  expect(
    parsePostingMessage({
      type: "careerForm.postings",
      action: "remove",
      id: "x",
      version: -1,
    }),
  ).toBeUndefined();
  expect(
    parsePostingMessage({
      type: "careerForm.postings",
      action: "save",
      input: {},
    }),
  ).toBeUndefined();
  expect(
    parsePostingMessage({
      type: "careerForm.postings",
      action: "save",
      id: "x",
      input: {
        company: "a",
        role: "b",
        url: "https://example.com",
        deadline: 1,
        timeZone: "Asia/Seoul",
        minutes: [],
      },
    }),
  ).toBeUndefined();
  expect(
    isPostingPage(
      { id: "own", url: "https://example.com/options.html" },
      "own",
    ),
  ).toBe(false);
  expect(
    isPostingPage(
      { id: "other", url: "chrome-extension://own/options.html" },
      "own",
    ),
  ).toBe(false);
  expect(
    isPostingPage(
      { id: "own", url: "chrome-extension://own/options.html#postings" },
      "own",
    ),
  ).toBe(true);
});
it("유효한 목록·취소 메시지를 읽는다", () => {
  expect(
    parsePostingMessage({ type: "careerForm.postings", action: "list" })
      ?.action,
  ).toBe("list");
  expect(
    parsePostingMessage({
      type: "careerForm.postings",
      action: "complete",
      id: "job-1",
      version: 1,
      completed: true,
    })?.action,
  ).toBe("complete");
});
