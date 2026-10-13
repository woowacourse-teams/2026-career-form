import type { CandidateRegistry } from "../dom/candidate-registry";
import type { FieldCandidateHandle } from "../dom/types";
import type { ReviewPlanItem } from "../review/review-plan";
import type { ApprovedWriteResult } from "../write/write-result";
import { QualityReportQueue } from "./report-queue";
import { qualityIdentity } from "./identity";

export type QualityReason =
  | "NOT_MAPPED"
  | "NOT_APPROVED"
  | "PROFILE_VALUE_MISSING"
  | "EXISTING_VALUE_PROTECTED"
  | "UNSUPPORTED_CONTROL"
  | "UNSUPPORTED_FORMAT"
  | "STALE_TARGET"
  | "CONFLICT"
  | "EXECUTION_FAILED"
  | "RETENTION_UNOBSERVED"
  | "RETENTION_LOST"
  | "CANCELLED"
  | "UNCLASSIFIED";
export interface QualityState {
  bound: boolean;
  attempted: boolean;
  written: boolean;
  retained: boolean;
  reason: QualityReason | null;
}
export interface QualityReport {
  eventId: string;
  snapshotId: string | null;
  fields: Record<string, QualityState>;
  identities: Record<string, string>;
  finished: "COMPLETED" | "CANCELLED" | null;
}
type SendMessage = (message: unknown) => Promise<unknown>;
interface Snapshot {
  id: string;
  registry: CandidateRegistry;
  identities: Record<string, string>;
}

function nodes(handle: FieldCandidateHandle): readonly Element[] {
  return handle.elements.length
    ? handle.elements
    : (handle.customElements ?? []);
}

function localValue(element: Element): string {
  if (element instanceof HTMLInputElement)
    return JSON.stringify([element.value, element.checked]);
  if (element instanceof HTMLSelectElement)
    return JSON.stringify(
      [...element.options].map((option) => [option.value, option.selected]),
    );
  if (element instanceof HTMLTextAreaElement) return element.value;
  return JSON.stringify([
    element.getAttribute("aria-checked"),
    element.getAttribute("aria-selected"),
    element.textContent,
  ]);
}

export class QualityObservation {
  private run = qualityIdentity();
  private elements = new WeakMap<Element, string>();
  private nextElement = 0;
  private snapshots: readonly Snapshot[] = [];
  private pending: readonly Promise<void>[] = [];
  private readonly queue: QualityReportQueue;
  private controller = new AbortController();

  constructor(sendMessage: SendMessage) {
    this.queue = new QualityReportQueue(sendMessage);
  }

  get runKey(): string {
    return this.run;
  }

  begin(): void {
    this.controller.abort();
    this.run = qualityIdentity();
    this.controller = new AbortController();
    this.elements = new WeakMap();
    this.nextElement = 0;
    this.snapshots = [];
    this.pending = [];
  }

  snapshot(
    id: string,
    registry: CandidateRegistry,
    candidates: readonly string[],
  ): Record<string, string> {
    const identities = Object.fromEntries(
      candidates.flatMap((candidateId) => {
        const lookup = registry.lookupField(candidateId);
        if (!("handle" in lookup)) return [];
        const controls = nodes(lookup.handle);
        if (!controls.length) return [];
        const refs = controls.map((element) => {
          const previous = this.elements.get(element);
          if (previous) return previous;
          const reference = `e${++this.nextElement}`;
          this.elements.set(element, reference);
          return reference;
        });
        return [[candidateId, refs.toSorted().join(".")]];
      }),
    );
    this.snapshots = [
      ...this.snapshots.filter((snapshot) => snapshot.id !== id),
      { id, registry, identities },
    ];
    return identities;
  }

  readySnapshot(id: string): void {
    const snapshot = this.snapshots.find((value) => value.id === id);
    if (snapshot) this.emit(id, {}, null, snapshot.identities);
  }

  review(id: string, items: readonly ReviewPlanItem[]): void {
    const fields = Object.fromEntries(
      items.map((item) => {
        const bound =
          !!item.analysis &&
          item.profileValue !== undefined &&
          item.profileValue !== "";
        const reason: QualityReason = !item.analysis
          ? "NOT_MAPPED"
          : !bound
            ? "PROFILE_VALUE_MISSING"
            : item.status === "conflict"
              ? "EXISTING_VALUE_PROTECTED"
              : item.disabled
                ? "UNSUPPORTED_CONTROL"
                : "NOT_APPROVED";
        return [
          item.candidateId,
          { bound, attempted: false, written: false, retained: false, reason },
        ];
      }),
    );
    this.emit(id, fields);
  }

  write(
    item: ReviewPlanItem,
    result: ApprovedWriteResult,
    registry: CandidateRegistry,
  ): void {
    const snapshot = this.snapshots.findLast(
      (value) =>
        value.registry === registry && value.identities[item.candidateId],
    );
    if (!snapshot) return;
    const bound = item.profileValue !== undefined && item.profileValue !== "";
    if (result.status !== "written") {
      const reason: QualityReason =
        result.code === "EXECUTION_FAILED"
          ? "EXECUTION_FAILED"
          : result.code === "NOT_APPROVED"
            ? "NOT_APPROVED"
            : result.code === "CONFLICT"
              ? "EXISTING_VALUE_PROTECTED"
              : result.code === "STALE_TARGET"
                ? "STALE_TARGET"
                : result.code === "UNSUPPORTED_FORMAT"
                  ? "UNSUPPORTED_FORMAT"
                  : result.code === "UNSUPPORTED_CONTROL"
                    ? "UNSUPPORTED_CONTROL"
                    : "UNCLASSIFIED";
      this.emit(snapshot.id, {
        [item.candidateId]: {
          bound,
          attempted:
            reason === "EXECUTION_FAILED" ||
            result.code === "RETAINED_VALUE_UNCONFIRMED",
          written: false,
          retained: false,
          reason,
        },
      });
      return;
    }
    const initial: QualityState = {
      bound: true,
      attempted: true,
      written: true,
      retained: false,
      reason: "RETENTION_UNOBSERVED",
    };
    this.emit(snapshot.id, { [item.candidateId]: initial });
    const lookup = registry.lookupField(item.candidateId);
    const handle = "handle" in lookup ? lookup.handle : undefined;
    const captured = handle ? [...nodes(handle)] : [];
    const values = captured.map(localValue);
    const page = captured[0]?.ownerDocument;
    const url = page?.URL;
    const signal = this.controller.signal;
    const run = this.run;
    const observation = new Promise<void>((resolve) => {
      const done = () => {
        signal.removeEventListener("abort", aborted);
        const current = registry.lookupField(item.candidateId);
        const currentNodes = "handle" in current ? nodes(current.handle) : [];
        const sameState =
          current.status === lookup.status &&
          (current.status === "ready" ||
            (current.status === "blocked" &&
              current.reason === "readonly" &&
              lookup.status === "blocked" &&
              lookup.reason === "readonly"));
        const observed =
          !signal.aborted &&
          sameState &&
          page?.URL === url &&
          captured.length > 0 &&
          captured.every(
            (element, index) =>
              element.isConnected && element === currentNodes[index],
          );
        const retained =
          observed &&
          captured.every(
            (element, index) => localValue(element) === values[index],
          );
        this.emit(
          snapshot.id,
          {
            [item.candidateId]: {
              ...initial,
              retained,
              reason: retained
                ? null
                : observed
                  ? "RETENTION_LOST"
                  : "RETENTION_UNOBSERVED",
            },
          },
          null,
          {},
          run,
        );
        resolve();
      };
      const timer = globalThis.setTimeout(done, 1000);
      const aborted = () => {
        globalThis.clearTimeout(timer);
        done();
      };
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted();
    });
    this.pending = [...this.pending, observation];
  }

  async finish(status: "COMPLETED" | "CANCELLED"): Promise<void> {
    const run = this.run;
    const snapshot = this.snapshots.at(-1)?.id ?? null;
    const signal = this.controller.signal;
    if (status === "CANCELLED") this.controller.abort();
    await Promise.all(this.pending);
    this.emit(snapshot, {}, signal.aborted ? "CANCELLED" : status, {}, run);
    await this.queue.drain();
  }

  private emit(
    snapshotId: string | null,
    fields: Record<string, QualityState>,
    finished: QualityReport["finished"] = null,
    identities: Record<string, string> = {},
    run = this.run,
  ): void {
    this.queue.enqueue(run, snapshotId, fields, identities, finished);
  }
}
