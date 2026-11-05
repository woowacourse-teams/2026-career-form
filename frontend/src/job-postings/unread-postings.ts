import { browser } from "wxt/browser";
import { isRecord } from "./repository";

export const PUSH_UNREAD_KEY = "careerForm.push.unread";
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Posting ID → closesAt. Only IDs and instants; never company names or links.
export function parseUnread(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        ID_PATTERN.test(entry[0]) &&
        typeof entry[1] === "number" &&
        Number.isFinite(entry[1]),
    ),
  );
}
export function countUnread(value: unknown, now: number): number {
  return Object.values(parseUnread(value)).filter((closesAt) => closesAt > now)
    .length;
}

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
interface UnreadPorts {
  storage: StorageArea;
  now(): number;
  setBadge(count: number): Promise<void>;
}

export class UnreadPostings {
  constructor(private readonly ports: UnreadPorts) {}
  private async load(): Promise<Record<string, number>> {
    const now = this.ports.now();
    const stored = await this.ports.storage.get(PUSH_UNREAD_KEY);
    return Object.fromEntries(
      Object.entries(parseUnread(stored[PUSH_UNREAD_KEY])).filter(
        ([, closesAt]) => closesAt > now,
      ),
    );
  }
  private async store(unread: Record<string, number>): Promise<number> {
    await this.ports.storage.set({ [PUSH_UNREAD_KEY]: unread });
    const count = Object.keys(unread).length;
    try {
      await this.ports.setBadge(count);
    } catch {
      /* A badge failure must not block the notification flow. */
    }
    return count;
  }
  async count(): Promise<number> {
    return Object.keys(await this.load()).length;
  }
  async add(postingId: string, closesAt: number): Promise<number> {
    return this.store({ ...(await this.load()), [postingId]: closesAt });
  }
  async remove(postingId: string): Promise<number> {
    const unread = await this.load();
    delete unread[postingId];
    return this.store(unread);
  }
  clear(): Promise<number> {
    return this.store({});
  }
  // Service worker start: drop closed postings and draw the saved count again.
  async redraw(): Promise<number> {
    return this.store(await this.load());
  }
}

type ChangeListener = (changes: Record<string, unknown>, area: string) => void;
interface UnreadReaderPorts {
  storage: { get(key: string): Promise<Record<string, unknown>> };
  onChanged: {
    addListener(listener: ChangeListener): void;
    removeListener(listener: ChangeListener): void;
  };
  now(): number;
}
export interface UnreadReader {
  count(): Promise<number>;
  subscribe(listener: (count: number) => void): () => void;
}
export function createUnreadReader(ports: UnreadReaderPorts): UnreadReader {
  return {
    count: async () => {
      try {
        const stored = await ports.storage.get(PUSH_UNREAD_KEY);
        return countUnread(stored[PUSH_UNREAD_KEY], ports.now());
      } catch {
        return 0;
      }
    },
    subscribe: (listener) => {
      const changed: ChangeListener = (changes, area) => {
        if (area !== "local" || !(PUSH_UNREAD_KEY in changes)) return;
        const change = changes[PUSH_UNREAD_KEY];
        listener(
          countUnread(
            isRecord(change) ? change.newValue : undefined,
            ports.now(),
          ),
        );
      };
      ports.onChanged.addListener(changed);
      return () => ports.onChanged.removeListener(changed);
    },
  };
}

export const unreadPostingsReader: UnreadReader = createUnreadReader({
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
  now: Date.now,
});
