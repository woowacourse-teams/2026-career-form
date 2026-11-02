import { browser } from "wxt/browser";
import { POSTING_TIME_ZONE, type Posting } from "./model";
import { POSTINGS_KEY, isRecord, parsePostings } from "./repository";

const URGENT_DAYS = 3;
const DAY_MS = 86400000;

const koreanParts = new Intl.DateTimeFormat("en-US", {
  timeZone: POSTING_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  hourCycle: "h23",
});

function partsOf(at: number) {
  const parts = Object.fromEntries(
    koreanParts.formatToParts(at).map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
  };
}

function koreanDayNumber(at: number) {
  const { year, month, day } = partsOf(at);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** Calendar days between two instants in Korean time; 0 means the same date. */
export function daysUntil(deadline: number, now: number): number {
  return koreanDayNumber(deadline) - koreanDayNumber(now);
}

export function isUrgent(deadline: number, now: number): boolean {
  return daysUntil(deadline, now) <= URGENT_DAYS;
}

/** Postings still open to apply to, nearest deadline first. */
export function upcomingPostings(
  postings: readonly Posting[],
  now: number,
): Posting[] {
  return postings
    .filter((p) => p.status !== "completed" && p.deadline > now)
    .sort((a, b) => a.deadline - b.deadline);
}

export function deadlineSummary(posting: Posting): string {
  const { month, day, hour } = partsOf(posting.deadline);
  const deadline = `${month}월 ${day}일 ${hour}시`;
  return posting.role ? `${posting.role}, ${deadline}` : deadline;
}

type ChangeListener = (changes: Record<string, unknown>, area: string) => void;
interface SavedPostingsPorts {
  storage: { get(key: string): Promise<Record<string, unknown>> };
  onChanged: {
    addListener(listener: ChangeListener): void;
    removeListener(listener: ChangeListener): void;
  };
}
export interface SavedPostingsReader {
  list(): Promise<Posting[]>;
  subscribe(listener: () => void): () => void;
}

/**
 * Read-only view of saved postings for the panels. The background's posting
 * commands only answer the management page, and the in-page panel runs as a
 * content script, so this reads the same storage key directly.
 */
export function createSavedPostingsReader(
  ports: SavedPostingsPorts,
): SavedPostingsReader {
  return {
    list: async () => {
      const stored = await ports.storage.get(POSTINGS_KEY);
      return parsePostings(isRecord(stored) ? stored[POSTINGS_KEY] : undefined);
    },
    subscribe: (listener) => {
      const changed: ChangeListener = (changes, area) => {
        if (area === "local" && POSTINGS_KEY in changes) listener();
      };
      ports.onChanged.addListener(changed);
      return () => ports.onChanged.removeListener(changed);
    },
  };
}

export const savedPostingsReader: SavedPostingsReader =
  createSavedPostingsReader({
    storage: { get: (key) => browser.storage.local.get(key) },
    onChanged: {
      addListener: (listener) => {
        try {
          browser.storage.onChanged.addListener(listener);
        } catch {
          /* Extension storage is unavailable here. */
        }
      },
      removeListener: (listener) => {
        try {
          browser.storage.onChanged.removeListener(listener);
        } catch {
          /* Extension storage is unavailable here. */
        }
      },
    },
  });
