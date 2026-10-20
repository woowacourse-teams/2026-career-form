import type { QualityReport, QualityState } from "./observation";
import { qualityIdentity } from "./identity";

interface BufferedReport {
  run: string;
  snapshotId: string | null;
  fields: Record<string, QualityState>;
  identities: Record<string, string>;
  bytes: number;
}

export class QualityReportQueue {
  private buffered: ReadonlyMap<string, BufferedReport> = new Map();
  private sending: Promise<void> = Promise.resolve();
  private pendingCount = 0;
  private pendingBytes = 0;
  private bufferedBytes = 0;

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
    const bytes = new TextEncoder().encode(JSON.stringify(report)).length;
    if (
      (!previous && this.buffered.size >= 64) ||
      Object.keys(report.fields).length > 2000 ||
      this.bufferedBytes - (previous?.bytes ?? 0) + bytes + this.pendingBytes >
        4 * 1024 * 1024
    )
      return;
    if (
      !finished ||
      previous ||
      Object.keys(fields).length ||
      Object.keys(identities).length
    ) {
      this.bufferedBytes += bytes - (previous?.bytes ?? 0);
      this.buffered = new Map([...this.buffered, [id, { ...report, bytes }]]);
    }
    if (finished) this.flush(run, snapshotId, finished);
  }

  async drain(): Promise<void> {
    await this.sending;
  }

  private flush(
    run: string,
    snapshotId: string | null,
    finished: NonNullable<QualityReport["finished"]>,
  ): void {
    const buffered = [...this.buffered.values()].filter(
      (report) => report.run === run,
    );
    this.buffered = new Map(
      [...this.buffered].filter(([, report]) => report.run !== run),
    );
    this.bufferedBytes -= buffered.reduce(
      (total, report) => total + report.bytes,
      0,
    );
    const reports: ReadonlyArray<Omit<BufferedReport, "bytes">> =
      buffered.length
        ? buffered
        : [{ run, snapshotId, fields: {}, identities: {} }];
    for (const [index, report] of reports.entries()) {
      const fields = Object.entries(report.fields);
      for (let offset = 0; offset < Math.max(1, fields.length); offset += 300) {
        this.send(report.run, {
          eventId: this.eventId(),
          snapshotId: report.snapshotId,
          fields: Object.fromEntries(fields.slice(offset, offset + 300)),
          identities: offset === 0 ? report.identities : {},
          finished:
            index === reports.length - 1 && offset + 300 >= fields.length
              ? finished
              : null,
        });
      }
    }
  }

  private eventId(): string {
    return qualityIdentity();
  }

  private send(run: string, payload: QualityReport): void {
    if (!run || !payload.eventId) return;
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (
      this.pendingCount >= 64 ||
      this.pendingBytes + this.bufferedBytes + bytes > 4 * 1024 * 1024
    )
      return;
    this.pendingCount++;
    this.pendingBytes += bytes;
    this.sending = this.sending.then(async () => {
      try {
        await this.sendMessage({
          type: "AUTOFILL_QUALITY_REPORT",
          qualityRun: run,
          payload,
        });
      } catch {
        return;
      } finally {
        this.pendingCount--;
        this.pendingBytes -= bytes;
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
