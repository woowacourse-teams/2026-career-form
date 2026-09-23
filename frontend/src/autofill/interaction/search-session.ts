import type {
  ExecuteReadonlySearchArgs,
  ReadonlySearchFailureReason,
} from "./readonly-search";

export type SearchReason =
  | ReadonlySearchFailureReason
  | "aborted"
  | "decision_abstained"
  | "existing_value_conflict"
  | "search_query_conflict";
export class SearchFailure extends Error {
  constructor(readonly reason: SearchReason) {
    super(reason);
  }
}
export class SearchSession {
  readonly deadline = performance.now() + 30_000;
  private readonly cleanup = new Set<() => void>();
  private stopped = false;
  providerCalls = 0;
  candidateCount = 0;
  decisions = 0;
  constructor(readonly args: ExecuteReadonlySearchArgs) {}
  check(): void {
    if (
      this.stopped ||
      this.args.signal?.aborted ||
      this.args.assertCurrent?.() === false
    )
      throw new SearchFailure("aborted");
    if (performance.now() >= this.deadline)
      throw new SearchFailure("deadline_exceeded");
  }
  addCleanup(stop: () => void): void {
    this.cleanup.add(stop);
  }
  async race<T>(promise: Promise<T>, timeout = 8_000): Promise<T> {
    this.check();
    return new Promise<T>((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer);
        this.args.signal?.removeEventListener("abort", abort);
        this.cleanup.delete(abort);
      };
      const abort = () => {
        stop();
        reject(new SearchFailure("aborted"));
      };
      const timer = setTimeout(
        () => {
          stop();
          reject(new SearchFailure("deadline_exceeded"));
        },
        Math.min(timeout, Math.max(0, this.deadline - performance.now())),
      );
      this.cleanup.add(abort);
      this.args.signal?.addEventListener("abort", abort, { once: true });
      promise.then(
        (value) => {
          stop();
          try {
            this.check();
            resolve(value);
          } catch (error) {
            reject(error);
          }
        },
        (error: unknown) => {
          stop();
          reject(error);
        },
      );
    });
  }
  async pause(ms = 100): Promise<void> {
    this.check();
    await new Promise<void>((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer);
        this.args.signal?.removeEventListener("abort", abort);
        this.cleanup.delete(abort);
      };
      const abort = () => {
        stop();
        reject(new SearchFailure("aborted"));
      };
      const timer = setTimeout(
        () => {
          stop();
          resolve();
        },
        Math.min(ms, Math.max(0, this.deadline - performance.now())),
      );
      this.cleanup.add(abort);
      this.args.signal?.addEventListener("abort", abort, { once: true });
    });
    this.check();
  }
  async wait<T>(
    read: () => T | undefined,
    reason: SearchReason,
    timeout = 8_000,
  ): Promise<T> {
    const until = Math.min(this.deadline, performance.now() + timeout);
    while (performance.now() < until) {
      this.check();
      const value = read();
      if (value !== undefined) return value;
      await this.pause();
    }
    throw new SearchFailure(reason);
  }
  async prepareMutation(): Promise<void> {
    this.check();
    if (
      this.args.beforeMutation &&
      !(await this.race(this.args.beforeMutation()))
    )
      throw new SearchFailure("stale_target");
    this.check();
  }
  stop(): void {
    this.stopped = true;
    for (const dispose of [...this.cleanup]) dispose();
    this.cleanup.clear();
  }
}
