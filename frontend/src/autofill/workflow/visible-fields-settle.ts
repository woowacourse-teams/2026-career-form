import type { FieldsAnalyzeRequest } from "../api/types";
import type { CollectedSnapshot } from "../dom/collect";

type Snapshot = CollectedSnapshot<FieldsAnalyzeRequest>;

/** Fields the page currently shows; a page mid-render can briefly hide them all. */
export function visibleFieldCount(snapshot: Snapshot): number {
  return snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ])
    .filter((field) => field.visibility === "visible").length;
}

const MIN_BASELINE = 4;

/**
 * A snapshot taken while the page hides most of what it showed a moment ago
 * (Component forms re-render after writes and server actions) is transient:
 * analysing it rebinds nothing and ends the run with silent gaps.
 */
export function transientlyHidden(
  previousVisible: number | undefined,
  snapshot: Snapshot,
): boolean {
  if (previousVisible === undefined || previousVisible < MIN_BASELINE)
    return false;
  return visibleFieldCount(snapshot) * 2 < previousVisible;
}

export interface SettleVisibleFieldsOptions {
  snapshot: Snapshot;
  previousVisible: number | undefined;
  collect: () => Promise<Snapshot>;
  /** Close whatever hides the page (an open popover) before re-collecting; true when something was closed. */
  dismiss?: () => boolean;
  signal?: AbortSignal;
  maxMs?: number;
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface SettledSnapshot {
  snapshot: Snapshot;
  /** How many times the page was re-collected while it was hidden. */
  retries: number;
  /** The deadline passed with the page still hidden. */
  stillHidden: boolean;
  /** How many times `dismiss` reported closing something. */
  dismissed: number;
}

/**
 * Keep re-collecting while the page is transiently hidden, up to the budget.
 * Returns the last snapshot either way so the caller can decide what to do
 * with a page that stays hidden.
 */
export async function settleVisibleFields({
  snapshot,
  previousVisible,
  collect,
  dismiss,
  signal,
  maxMs = 3000,
  pollMs = 100,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: SettleVisibleFieldsOptions): Promise<SettledSnapshot> {
  let current = snapshot;
  let retries = 0;
  let dismissed = 0;
  if (!transientlyHidden(previousVisible, current))
    return { snapshot: current, retries, stillHidden: false, dismissed };
  const deadline = now() + maxMs;
  while (!signal?.aborted && now() < deadline) {
    if (dismiss?.()) dismissed += 1;
    await sleep(pollMs);
    if (signal?.aborted) break;
    current = await collect();
    retries += 1;
    if (!transientlyHidden(previousVisible, current))
      return { snapshot: current, retries, stillHidden: false, dismissed };
  }
  return { snapshot: current, retries, stillHidden: true, dismissed };
}
