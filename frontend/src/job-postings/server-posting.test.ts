import { describe, expect, it } from "vitest";
import type { Posting } from "./model";
import {
  formatPostingPeriod,
  postingInput,
  reminderOutcome,
} from "./server-posting";

const posting = {
  id: "0123456789abcdef0123456789abcdef",
  company: "합성 회사",
  role: "합성 직무",
  link: "https://careers.example.test/jobs/1",
  opensAt: Date.parse("2026-10-27T00:00:00Z"),
  closesAt: Date.parse("2026-11-03T09:00:00Z"),
};

describe("server posting helpers", () => {
  it("CF-161 저장 입력으로 바꾸며 기본 알림은 24시간·2시간 전이다", () => {
    expect(postingInput(posting)).toEqual({
      company: "합성 회사",
      role: "합성 직무",
      url: "https://careers.example.test/jobs/1",
      deadline: posting.closesAt,
      timeZone: "Asia/Seoul",
      minutes: [1440, 120],
    });
  });
  it("직무가 없으면 빈 직무로 넘긴다", () => {
    expect(postingInput({ ...posting, role: "" }).role).toBe("");
  });
  it("접수 기간을 한국 시간으로 표시하고 해가 다르면 연도를 붙인다", () => {
    expect(formatPostingPeriod(posting.opensAt, posting.closesAt)).toBe(
      "10/27 09:00 ~ 11/3 18:00",
    );
    expect(
      formatPostingPeriod(
        Date.parse("2026-12-30T00:00:00Z"),
        Date.parse("2027-01-10T00:00:00Z"),
      ),
    ).toBe("2026/12/30 09:00 ~ 2027/1/10 09:00");
  });
  it("저장 결과에 남은 알림이 없으면 구분한다", () => {
    const saved: Posting = {
      id: "job",
      version: 1,
      company: "합성 회사",
      role: "합성 직무",
      url: posting.link,
      deadline: posting.closesAt,
      timeZone: "Asia/Seoul",
      status: "planned",
      updatedAt: 0,
      reminders: [
        { minutes: 1440, at: posting.closesAt - 86400000, state: "skipped" },
        { minutes: 120, at: posting.closesAt - 7200000, state: "pending" },
      ],
    };
    expect(reminderOutcome(saved)).toBe("saved");
    expect(
      reminderOutcome({
        ...saved,
        reminders: saved.reminders.map((r) => ({ ...r, state: "skipped" })),
      }),
    ).toBe("no_future_reminders");
  });
});
