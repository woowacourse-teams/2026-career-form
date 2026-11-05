import { describe, expect, it } from "vitest";
import {
  createPosting,
  pendingReminders,
  formatDeadline,
  type PostingInput,
} from "./model";

const now = Date.parse("2026-10-06T06:00:00Z");
const input: PostingInput = {
  company: "예시 회사",
  role: "백엔드",
  url: "https://example.com/jobs/1",
  deadline: now + 3 * 3600000,
  timeZone: "Asia/Seoul",
  minutes: [1440, 120],
};
describe("공고와 알림 시각", () => {
  it("마감 3시간 전 등록은 과거 알림을 건너뛰고 2시간 전만 예약한다", () => {
    const posting = createPosting(input, now, "job");
    expect(pendingReminders(posting).map((r) => r.at)).toEqual([now + 3600000]);
    expect(posting.version).toBe(1);
  });
  it("같은 알림 시점을 하나로 합친다", () => {
    expect(
      createPosting({ ...input, minutes: [120, 120] }, now, "job").reminders,
    ).toHaveLength(1);
  });
  it.each([
    "javascript:alert(1)",
    "file:///tmp/a",
    "https://user:password@example.com",
  ])("안전하지 않은 링크 %s를 거부한다", (url) => {
    expect(() => createPosting({ ...input, url }, now, "job")).toThrow();
  });
  it.each([
    { company: " " },
    { deadline: now },
    { deadline: NaN },
    { minutes: [0] },
    { minutes: [-1] },
    { minutes: [Infinity] },
    { timeZone: "unknown" },
  ])("유효하지 않은 입력을 거부한다: %j", (invalid) => {
    expect(() => createPosting({ ...input, ...invalid }, now, "job")).toThrow();
  });
  it("직무 없이 회사명만으로 저장하고 회사명이 비면 회사명만 요구한다", () => {
    expect(createPosting({ ...input, role: "" }, now, "job").role).toBe("");
    expect(createPosting({ ...input, role: "  " }, now, "job").role).toBe("");
    expect(() => createPosting({ ...input, company: " " }, now, "job")).toThrow(
      "회사명을 입력해 주세요.",
    );
  });
  it("마감을 한국 시간으로 표시한다", () => {
    const at = Date.parse("2026-10-06T09:00:00Z");
    expect(formatDeadline(at, "Asia/Seoul")).toContain("18:00");
  });
});
