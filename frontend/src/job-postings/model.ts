export const POSTING_SCHEMA_VERSION = 1;
export const POSTING_TIME_ZONE = "Asia/Seoul";
export interface PostingInput {
  company: string;
  role: string;
  url: string;
  deadline: number;
  timeZone: string;
  minutes: number[];
}
export interface Reminder {
  minutes: number;
  at: number;
  state: "pending" | "sent" | "skipped";
  deliveredAt?: number;
}
export interface Posting extends Omit<PostingInput, "minutes"> {
  id: string;
  version: number;
  status: "planned" | "completed";
  reminders: Reminder[];
  updatedAt: number;
}
export interface PostingEnvelope {
  schemaVersion: 1;
  postings: Posting[];
}
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function validateInput(input: PostingInput, now: number): void {
  if (!input.company.trim() || !input.role.trim())
    throw new Error("회사명과 직무를 입력해 주세요.");
  if (!isHttpUrl(input.url))
    throw new Error(
      "HTTP(S) 공고 링크를 입력해 주세요. 계정 정보가 포함된 링크는 사용할 수 없습니다.",
    );
  if (
    !Number.isFinite(input.deadline) ||
    input.deadline <= now ||
    input.deadline > 8640000000000000
  )
    throw new Error("앞으로 남은 마감 날짜·시간을 입력해 주세요.");
  if (
    input.minutes.length > 2 ||
    input.minutes.some((m) => !Number.isSafeInteger(m) || m <= 0)
  )
    throw new Error(
      "알림은 최대 2개이며 마감 전 1분 이상의 간격이어야 합니다.",
    );
  try {
    new Intl.DateTimeFormat("ko-KR", { timeZone: input.timeZone });
  } catch {
    throw new Error("시간대를 확인해 주세요.");
  }
}
export function createPosting(
  input: PostingInput,
  now: number,
  id: string,
): Posting {
  validateInput(input, now);
  return {
    id,
    version: 1,
    company: input.company.trim(),
    role: input.role.trim(),
    url: input.url.trim(),
    deadline: input.deadline,
    timeZone: input.timeZone,
    status: "planned",
    updatedAt: now,
    reminders: [...new Set(input.minutes)]
      .sort((a, b) => b - a)
      .map((minutes) => {
        const at = input.deadline - minutes * 60000;
        return { minutes, at, state: at > now ? "pending" : "skipped" };
      }),
  };
}
export function editPosting(
  posting: Posting,
  input: PostingInput,
  now: number,
): Posting {
  const next = createPosting(input, now, posting.id);
  return {
    ...next,
    version: posting.version + 1,
    status: posting.status,
    reminders:
      posting.status === "completed"
        ? next.reminders.map((r) => ({ ...r, state: "skipped" }))
        : next.reminders,
  };
}
export function pendingReminders(posting: Posting): Reminder[] {
  return posting.status === "completed"
    ? []
    : posting.reminders.filter((r) => r.state === "pending");
}
export function deadlineInput(at: number): string {
  // This first version explicitly edits Korean time; never depend on the OS zone.
  return new Date(at + 9 * 3600000).toISOString().slice(0, 16);
}
export function parseDeadlineInput(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("마감 날짜·시간을 입력해 주세요.");
  const at = Date.parse(`${value}:00+09:00`);
  if (!Number.isFinite(at) || deadlineInput(at) !== value)
    throw new Error("올바른 마감 날짜·시간을 입력해 주세요.");
  return at;
}
export function formatDeadline(at: number, timeZone: string): string {
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone, year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at)} · ${timeZone === POSTING_TIME_ZONE ? "한국 시간" : timeZone}`;
}
export function remainingTime(deadline: number, now: number): string {
  const minutes = Math.ceil((deadline - now) / 60000);
  if (minutes <= 0) return "마감 지남";
  if (minutes < 60) return `${minutes}분 남음`;
  if (minutes < 1440)
    return `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ""} 남음`;
  return `${Math.floor(minutes / 1440)}일${Math.floor((minutes % 1440) / 60) ? ` ${Math.floor((minutes % 1440) / 60)}시간` : ""} 남음`;
}
