import { POSTING_TIME_ZONE, type Posting, type PostingInput } from "./model";
import type { ServerPosting } from "./push-api";

// Same defaults as the posting form: 24 hours and 2 hours before the deadline.
export const DEFAULT_REMINDER_MINUTES = [1440, 120] as const;

export function postingInput(posting: ServerPosting): PostingInput {
  return {
    company: posting.company,
    role: posting.role,
    url: posting.link,
    deadline: posting.closesAt,
    timeZone: POSTING_TIME_ZONE,
    minutes: [...DEFAULT_REMINDER_MINUTES],
  };
}

function dateParts(at: number): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: POSTING_TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map(({ type, value }) => [type, value]),
  );
}

export function formatPostingPeriod(opensAt: number, closesAt: number): string {
  const start = dateParts(opensAt);
  const end = dateParts(closesAt);
  const withYear = start.year !== end.year;
  const format = (parts: Record<string, string>) =>
    `${withYear ? `${parts.year}/` : ""}${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
  return `${format(start)} ~ ${format(end)}`;
}

export type ReminderOutcome = "saved" | "no_future_reminders";
export function reminderOutcome(saved: Posting): ReminderOutcome {
  return saved.reminders.some((reminder) => reminder.state === "pending")
    ? "saved"
    : "no_future_reminders";
}
