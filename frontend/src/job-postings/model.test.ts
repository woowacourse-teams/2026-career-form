import { describe, expect, it } from "vitest";
import {
  createPosting,
  editPosting,
  pendingReminders,
  formatDeadline,
  parseDeadlineInput,
  deadlineInput,
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
    { role: "" },
    { deadline: now },
    { deadline: NaN },
    { minutes: [0] },
    { minutes: [-1] },
    { minutes: [Infinity] },
    { timeZone: "unknown" },
  ])("유효하지 않은 입력을 거부한다: %j", (invalid) => {
    expect(() => createPosting({ ...input, ...invalid }, now, "job")).toThrow();
  });
  it("수정은 버전을 올리고 새 마감으로 예약을 다시 계산한다", () => {
    const p = createPosting(input, now, "job");
    const edited = editPosting(
      p,
      { ...input, deadline: now + 6 * 3600000 },
      now + 1000,
    );
    expect(edited.id).toBe(p.id);
    expect(edited.version).toBe(2);
    expect(pendingReminders(edited)[0].at).toBe(now + 4 * 3600000);
    expect(p.version).toBe(1);
  });
  it("한국 시간 입력을 정확한 절대 시각으로 변환하고 다시 표시한다", () => {
    const at = parseDeadlineInput("2026-10-06T18:00");
    expect(at).toBe(Date.parse("2026-10-06T09:00:00Z"));
    expect(deadlineInput(at)).toBe("2026-10-06T18:00");
    expect(formatDeadline(at, "Asia/Seoul")).toContain("18:00");
  });
  it.each(["", "2026-02-30T18:00", "2026-10-06", "2026-13-06T18:00"])(
    "잘못된 날짜 %s를 정규화하지 않는다",
    (value) => {
      expect(() => parseDeadlineInput(value)).toThrow();
    },
  );
});

it("마감이 지난 기존 공고의 정보 수정은 허용하되 알림을 되살리지 않는다", () => {
  const posting = createPosting(input, now, "job");
  const edited = editPosting(
    posting,
    { ...input, company: "수정한 예시 회사" },
    input.deadline + 60000,
  );
  expect(edited.company).toBe("수정한 예시 회사");
  expect(pendingReminders(edited)).toEqual([]);
});
