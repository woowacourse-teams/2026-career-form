import type { QualityReport, QualityState } from "./observation";
import { qualityIdentity } from "./identity";

interface BufferedReport {
  run: string;
  snapshotId: string | null;
  fields: Record<string, QualityState>;
  identities: Record<string, string>;
}

export class QualityReportQueue {
  private buffered: ReadonlyMap<string, BufferedReport> = new Map();
  private sending: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly sendMessage: (message: unknown) => Promise<unknown>,
  ) {}

  enqueue(
    run: string,
    snapshotId: string | null,
    fields: Record<string, QualityState>,
    identities: Record<string, string>,
    finished: QualityReport["finished"],
  ): void {
    if (finished) {
      this.flush();
      this.send(run, {
        eventId: this.eventId(),
        snapshotId,
        fields,
        identities,
        finished,
      });
      return;
    }
    const id = `${run}|${snapshotId}`;
    const previous = this.buffered.get(id);
    const merged = Object.fromEntries(
      Object.entries(fields).map(([candidate, state]) => [
        candidate,
        this.merge(previous?.fields[candidate], state),
      ]),
    );
    const report = {
      run,
      snapshotId,
      fields: { ...previous?.fields, ...merged },
      identities: { ...previous?.identities, ...identities },
    };
    this.buffered = new Map([...this.buffered, [id, report]]);
    this.timer ??= globalThis.setTimeout(() => this.flush(), 100);
  }

  async drain(): Promise<void> {
    this.flush();
    await this.sending;
  }

  private flush(): void {
    if (this.timer !== undefined) globalThis.clearTimeout(this.timer);
    this.timer = undefined;
    const reports = this.buffered;
    this.buffered = new Map();
    for (const report of reports.values()) {
      const fields = Object.entries(report.fields);
      for (let offset = 0; offset < Math.max(1, fields.length); offset += 300) {
        this.send(report.run, {
          eventId: this.eventId(),
          snapshotId: report.snapshotId,
          fields: Object.fromEntries(fields.slice(offset, offset + 300)),
          identities: offset === 0 ? report.identities : {},
          finished: null,
        });
      }
    }
  }

  private eventId(): string {
    return qualityIdentity();
  }

  private send(run: string, payload: QualityReport): void {
    if (!run || !payload.eventId) return;
    this.sending = this.sending.then(async () => {
      try {
        await this.sendMessage({
          type: "AUTOFILL_QUALITY_REPORT",
          qualityRun: run,
          payload,
        });
      } catch {
        return;
      }
    });
  }

  private merge(
    previous: QualityState | undefined,
    next: QualityState,
  ): QualityState {
    if (!previous) return next;
    const retained = previous.retained || next.retained;
    const written = previous.written || next.written;
    const attempted = previous.attempted || next.attempted;
    const reason = retained
      ? null
      : this.rank(next) >= this.rank(previous)
        ? next.reason
        : previous.reason;
    return {
      bound: previous.bound || next.bound,
      attempted,
      written,
      retained,
      reason,
    };
  }

  private rank(state: QualityState): number {
    return state.retained
      ? 4
      : state.written
        ? 3
        : state.attempted
          ? 2
          : state.bound
            ? 1
            : 0;
  }
}
