import { expect, it } from "vitest";
import { createPostingHandler } from "./background-handler";
import { PostingService } from "./service";
import type { Posting } from "./model";
it("관리 페이지에서만 공고를 읽고 쓰며 패널은 진입만 허용한다", async () => {
  let rows: Posting[] = [];
  const pages: string[] = [];
  const service = new PostingService(
    {
      load: async () => rows,
      save: async (next) => {
        rows = next;
      },
    },
    {
      now: () => 0,
      id: () => "job",
      permission: async () => true,
      schedule: async () => {},
      notify: async () => {},
      clearNotification: async () => {},
    },
  );
  const handler = createPostingHandler(service, "own", async (hash) => {
    pages.push(hash);
  });
  const cmd = {
    type: "careerForm.postings",
    action: "save",
    input: {
      company: "예시",
      role: "개발",
      url: "https://example.com",
      deadline: 20000000,
      timeZone: "Asia/Seoul",
      minutes: [],
    },
  };
  expect(
    await handler(cmd, { id: "own", url: "https://example.com" }),
  ).toMatchObject({ ok: false });
  expect(rows).toHaveLength(0);
  expect(
    await handler(cmd, {
      id: "own",
      url: "chrome-extension://own/options.html",
    }),
  ).toMatchObject({ ok: true });
  expect(rows).toHaveLength(1);
  await handler(
    { type: "careerForm.openPostings", create: true },
    { id: "own", url: "https://example.com" },
  );
  expect(pages).toEqual(["#postings/new"]);
  expect(handler({ type: "other" }, { id: "own" })).toBeUndefined();
});
it("완료 또는 수정된 알림 클릭으로 오래된 공고를 열지 않는다", async () => {
  let rows: Posting[] = [];
  let now = 0;
  const service = new PostingService(
    {
      load: async () => rows,
      save: async (next) => {
        rows = next;
      },
    },
    {
      now: () => now,
      id: () => "job",
      permission: async () => true,
      schedule: async () => {},
      notify: async () => {},
      clearNotification: async () => {},
    },
  );
  await service.save({
    company: "예시",
    role: "개발",
    url: "https://example.com",
    deadline: 7200000,
    timeZone: "Asia/Seoul",
    minutes: [60],
  });
  now = 3600000;
  await service.recover();
  expect(await service.notificationUrl("careerForm.job.job.1")).toBe(
    "https://example.com",
  );
  await service.setCompleted("job", 1, true);
  expect(await service.notificationUrl("careerForm.job.job.1")).toBeUndefined();
});
