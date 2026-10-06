import {
  createPosting,
  editPosting,
  formatDeadline,
  pendingReminders,
  remainingTime,
  type Posting,
  type PostingInput,
} from "./model";
import type { PostingRepository } from "./repository";
export type PostingProblem = "schedule" | "permission" | "notification";
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
  list(): Promise<PostingSnapshot> {
    return this.serial(async () => this.snapshot(await this.repository.load()));
  }
  private find(postings: Posting[], id: string, version: number): Posting {
    const posting = postings.find((p) => p.id === id);
    if (!posting || posting.version !== version)
      throw new Error(
        "다른 화면에서 공고가 변경되었습니다. 목록을 새로 불러와 주세요.",
      );
    return posting;
  }
  private async reschedule(postings: Posting[]): Promise<void> {
    const times = postings.flatMap((p) => pendingReminders(p).map((r) => r.at));
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
  save(
    input: PostingInput,
    id?: string,
    version?: number,
  ): Promise<PostingSnapshot> {
    return this.serial(async () => {
      const postings = await this.repository.load();
      const previous = id ? this.find(postings, id, version ?? 0) : undefined;
      const next = previous
        ? editPosting(previous, input, this.ports.now())
        : createPosting(input, this.ports.now(), this.ports.id());
      return this.persist(
        previous
          ? postings.map((p) => (p.id === id ? next : p))
          : [...postings, next],
        previous,
      );
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
    let postings = await this.repository.load();
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
          await this.ports.notify({
            id: notificationId(posting),
            title: `${posting.company} ${posting.role} 지원 마감 · ${remainingTime(posting.deadline, now)}`,
            message: `${formatDeadline(posting.deadline, posting.timeZone)} 마감입니다. 클릭하면 공고를 엽니다.`,
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
