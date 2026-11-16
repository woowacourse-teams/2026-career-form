import {
  createPosting,
  isExpiredPlan,
  pendingReminders,
  type Posting,
  type PostingInput,
} from "./model";
import type { PostingRepository } from "./repository";
export type PostingProblem = "schedule" | "permission" | "notification";
export const EXPIRED_REVERT_MESSAGE =
  "마감이 지난 공고는 지원 예정으로 되돌릴 수 없습니다.";
export interface PostingSnapshot {
  postings: Posting[];
  problems: PostingProblem[];
}
export interface ReminderDelivery {
  id: string;
  title: string;
  message: string;
}
export interface PostingPorts {
  now(): number;
  id(): string;
  permission(): Promise<boolean>;
  schedule(at: number | undefined): Promise<void>;
  notify(delivery: ReminderDelivery): Promise<void>;
  clearNotification(id: string): Promise<void>;
}
export function notificationId(p: Posting): string {
  return `careerForm.job.${p.id}.${p.version}`;
}
export class PostingService {
  private queue: Promise<unknown> = Promise.resolve();
  private problems = new Set<PostingProblem>();
  constructor(
    private readonly repository: PostingRepository,
    private readonly ports: PostingPorts,
  ) {}
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async snapshot(postings: Posting[]): Promise<PostingSnapshot> {
    let allowed = false;
    try {
      allowed = await this.ports.permission();
    } catch {
      /* Report unavailable permission as blocked. */
    }
    if (allowed) this.problems.delete("permission");
    else this.problems.add("permission");
    return { postings, problems: [...this.problems] };
  }
  // Opening the page removes expired plans too. With nothing to remove it
  // stays read-only, so the storage change it would cause cannot loop back.
  list(): Promise<PostingSnapshot> {
    return this.serial(async () => {
      const loaded = await this.repository.load();
      const now = this.ports.now();
      if (!loaded.some((p) => isExpiredPlan(p, now)))
        return this.snapshot(loaded);
      const postings = await this.removeExpired(loaded, now);
      await this.reschedule(postings);
      return this.snapshot(postings);
    });
  }
  // Permanent: planned postings past their deadline leave storage, completed
  // ones stay. A failed write keeps what storage still holds; its past
  // deadline makes reschedule() check again a minute later.
  private async removeExpired(
    postings: Posting[],
    now: number,
  ): Promise<Posting[]> {
    const kept = postings.filter((p) => !isExpiredPlan(p, now));
    if (kept.length === postings.length) return postings;
    try {
      await this.repository.save(kept);
      return kept;
    } catch {
      return postings;
    }
  }
  private find(postings: Posting[], id: string, version: number): Posting {
    const posting = postings.find((p) => p.id === id);
    if (!posting || posting.version !== version)
      throw new Error(
        "다른 화면에서 공고가 변경되었습니다. 목록을 새로 불러와 주세요.",
      );
    return posting;
  }
  // Wake for the next reminder and for every planned deadline (past ones
  // included), so expired plans leave storage without the page being opened.
  private async reschedule(postings: Posting[]): Promise<void> {
    const times = postings.flatMap((p) => [
      ...pendingReminders(p).map((r) => r.at),
      ...(p.status === "planned" ? [p.deadline] : []),
    ]);
    const earliest = times.length ? Math.min(...times) : undefined;
    const next =
      earliest === undefined
        ? undefined
        : earliest > this.ports.now()
          ? earliest
          : this.ports.now() + 60000;
    try {
      await this.ports.schedule(next);
      this.problems.delete("schedule");
    } catch {
      this.problems.add("schedule");
    }
  }
  private async persist(
    postings: Posting[],
    previous?: Posting,
  ): Promise<PostingSnapshot> {
    await this.repository.save(postings);
    if (previous) {
      try {
        await this.ports.clearNotification(notificationId(previous));
      } catch {
        this.problems.add("notification");
      }
    }
    await this.reschedule(postings);
    return this.snapshot(postings);
  }
  save(input: PostingInput): Promise<PostingSnapshot> {
    return this.serial(async () => {
      const postings = await this.repository.load();
      return this.persist([
        ...postings,
        createPosting(input, this.ports.now(), this.ports.id()),
      ]);
    });
  }
  setCompleted(
    id: string,
    version: number,
    completed: boolean,
  ): Promise<PostingSnapshot> {
    return this.serial(async () => {
      const postings = await this.repository.load();
      const previous = this.find(postings, id, version);
      const now = this.ports.now();
      // Reverted past its deadline it would be an expired plan, removed for good.
      if (!completed && previous.deadline <= now)
        throw new Error(EXPIRED_REVERT_MESSAGE);
      const next: Posting = {
        ...previous,
        version: version + 1,
        status: completed ? "completed" : "planned",
        updatedAt: now,
        reminders: previous.reminders.map((r) => ({
          ...r,
          state: !completed && r.at > now ? "pending" : "skipped",
        })),
      };
      return this.persist(
        postings.map((p) => (p.id === id ? next : p)),
        previous,
      );
    });
  }
  remove(id: string, version: number): Promise<PostingSnapshot> {
    return this.serial(async () => {
      const postings = await this.repository.load();
      const previous = this.find(postings, id, version);
      return this.persist(
        postings.filter((p) => p.id !== id),
        previous,
      );
    });
  }
  recover(): Promise<PostingSnapshot> {
    return this.serial(async () => {
      try {
        return await this.reconcile();
      } catch (error) {
        this.problems.add("notification");
        try {
          await this.reschedule(await this.repository.load());
        } catch {
          this.problems.add("schedule");
        }
        throw error;
      }
    });
  }
  private async reconcile(): Promise<PostingSnapshot> {
    // Remove first so no reminder goes out for an expired plan. The loop
    // still skips postings whose deadline passes while it runs.
    let postings = await this.removeExpired(
      await this.repository.load(),
      this.ports.now(),
    );
    const initial = await this.snapshot(postings);
    const allowed = !initial.problems.includes("permission");
    this.problems.delete("notification");
    for (const posting of postings) {
      const now = this.ports.now();
      const due = pendingReminders(posting).filter((r) => r.at <= now);
      if (!due.length) continue;
      const expired = posting.deadline <= now;
      if (!expired && !allowed) continue;
      if (!expired) {
        try {
          const minutes = Math.ceil((posting.deadline - now) / 60000);
          const parts = (at: number) =>
            Object.fromEntries(
              new Intl.DateTimeFormat("ko-KR", {
                timeZone: posting.timeZone,
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
          const end = parts(posting.deadline);
          const current = parts(now);
          const date = `${end.year === current.year ? "" : `${end.year}/`}${end.month}/${end.day}`;
          const deadline = `${date} ${end.hour}:${end.minute}`;
          await this.ports.notify({
            id: notificationId(posting),
            title: `${minutes <= 60 ? "🚨" : "⏰"} ${posting.company} (~${deadline})`,
            message: "\n지금 바로 지원하기 →",
          });
        } catch {
          this.problems.add("notification");
          continue;
        }
      }
      postings = postings.map((p) =>
        p.id !== posting.id
          ? p
          : {
              ...p,
              reminders: p.reminders.map((r) =>
                due.some((d) => d.at === r.at)
                  ? {
                      ...r,
                      state: expired ? "skipped" : "sent",
                      ...(expired ? {} : { deliveredAt: now }),
                    }
                  : r,
              ),
            },
      );
      await this.repository.save(postings);
    }
    await this.reschedule(postings);
    return this.snapshot(postings);
  }
  notificationUrl(id: string): Promise<string | undefined> {
    return this.serial(async () => {
      const postings = await this.repository.load();
      return postings.find(
        (p) =>
          notificationId(p) === id &&
          p.status === "planned" &&
          p.reminders.some((r) => r.state === "sent"),
      )?.url;
    });
  }
}
